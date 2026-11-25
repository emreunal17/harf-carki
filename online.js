"use strict";
// ARKADAŞLARLA ONLINE OYUN
// Oda: rooms/{KOD}  { host, hostName, cat, total, mode, status: lobby|playing|closed, round, items, createdAt }
// Oyuncular: rooms/{KOD}/players/{uid}  { name, avatar, photo?, correct, wrong, answered, done, time, round, updatedAt }
// Herkes aynı 28 soruyu (ve şıklı modda aynı şıkları) aynı anda kendi cihazında çözer, skorlar canlı görünür.

const Online = (() => {
  const CODE_CHARS = "ABCDEFGHJKLMNPRSTUVYZ23456789";
  let code = null;
  let room = null;
  let players = [];
  let unsubRoom = null, unsubPlayers = null;
  let localRound = 0;
  let reportTimer = null;

  const fs = () => firebase.firestore;
  const roomRef = (c) => Auth.db.collection("rooms").doc(c || code);
  const meRef = () => roomRef().collection("players").doc(Auth.user.uid);
  const canPlay = () => !!(Auth.db && Auth.user && Auth.user.provider !== "local");
  const isHost = () => !!(room && Auth.user && room.host === Auth.user.uid);
  const active = () => !!code;

  // Soru anahtarından soruyu bul (kategori|harf|cevap)
  let qIndex = null;
  function findQ(key) {
    if (!qIndex) {
      qIndex = new Map();
      CATEGORIES.forEach((c) => c.questions.forEach((q) => qIndex.set(qKey(c.id, q), { ...q, cat: c.name, catId: c.id, key: qKey(c.id, q) })));
    }
    return qIndex.get(key);
  }
  const catById = (id) => [...CATEGORIES, MIXED].find((c) => c.id === id) || MIXED;

  function genCode() {
    let s = "";
    for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return s;
  }

  function myInfo() {
    const p = getProfile();
    const d = { name: p.name.slice(0, 20), avatar: p.avatar.slice(0, 8) };
    if (p.photo) d.photo = p.photo;
    return d;
  }

  function errText(e) {
    if (e && e.code === "permission-denied") return "Online oyun için sunucu izni yok. (Firestore kuralları güncellenmeli.)";
    if (e && e.code === "unavailable") return "İnternet bağlantısı yok.";
    return (e && e.message) || "Bir hata oluştu.";
  }

  /* ---------- Oda kur / katıl / ayrıl ---------- */
  async function create(catId, total, mode) {
    if (!canPlay()) throw new Error("Online oynamak için e-posta hesabıyla giriş yapmalısın.");
    let c = genCode();
    for (let i = 0; i < 4; i++) {
      const s = await roomRef(c).get().catch(() => null);
      if (!s || !s.exists) break;
      c = genCode();
    }
    try {
      await roomRef(c).set({
        host: Auth.user.uid, hostName: getProfile().name.slice(0, 20),
        cat: catId, total, mode, status: "lobby", round: 0, items: [],
        createdAt: fs().FieldValue.serverTimestamp(),
      });
    } catch (e) { throw new Error(errText(e)); }
    await join(c);
  }

  async function join(c) {
    if (!canPlay()) throw new Error("Online oynamak için e-posta hesabıyla giriş yapmalısın.");
    c = String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (c.length !== 5) throw new Error("Oda kodu 5 karakter olmalı.");
    let snap;
    try { snap = await roomRef(c).get(); } catch (e) { throw new Error(errText(e)); }
    if (!snap.exists || snap.data().status === "closed") throw new Error("Bu kodla açık bir oda bulunamadı.");
    const r = snap.data();
    if (r.status === "playing" && r.host !== Auth.user.uid) throw new Error("Bu odada oyun başlamış. Bitince tekrar dene.");
    leaveQuietly();
    code = c; room = r; localRound = r.round;
    try {
      await meRef().set({ ...myInfo(), correct: 0, wrong: 0, answered: 0, done: false, time: 0, round: r.round, updatedAt: fs().FieldValue.serverTimestamp() });
    } catch (e) { code = null; room = null; throw new Error(errText(e)); }
    store.set("online-room", c);
    subscribe();
    renderLobby();
    showScreen("lobby");
  }

  function subscribe() {
    unsubRoom = roomRef().onSnapshot((s) => {
      if (!s.exists || s.data().status === "closed") {
        const wasHost = isHost();
        leaveQuietly();
        if (!wasHost) { alert("Oda kapatıldı."); showScreen("menu"); }
        return;
      }
      room = s.data();
      if (room.status === "playing" && room.round !== localRound) {
        localRound = room.round;
        beginRound();
      } else if (room.status === "lobby" && document.querySelector("#screen-lobby.active")) {
        renderLobby();
      }
    }, (e) => console.warn("Oda dinlenemedi:", e));
    unsubPlayers = roomRef().collection("players").onSnapshot((s) => {
      players = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      handleReacts();
      renderLobby();
      renderLive();
      renderRanking();
    }, (e) => console.warn("Oyuncular dinlenemedi:", e));
  }

  function leaveQuietly() {
    if (unsubRoom) unsubRoom(); if (unsubPlayers) unsubPlayers();
    unsubRoom = unsubPlayers = null;
    clearTimeout(reportTimer);
    code = null; room = null; players = []; localRound = 0; seenReacts = {};
    store.set("online-room", null);
    $("live-board").classList.add("hidden");
    $("online-rank").classList.add("hidden");
  }

  async function leave() {
    if (!code) return;
    const c = code, host = isHost();
    leaveQuietly();
    try {
      if (host) await roomRef(c).update({ status: "closed" });
      await roomRef(c).collection("players").doc(Auth.user.uid).delete();
    } catch (e) { console.warn(e); }
  }

  /* ---------- Oyun ---------- */
  async function start() {
    if (!isHost()) return;
    const cat = catById(room.cat);
    const items = buildQuestions(cat).map((it) => ({ k: it.q.key, ch: room.mode === "choice" ? buildChoices(it) : [] }));
    $("btn-lobby-start").disabled = true;
    try {
      await roomRef().update({ status: "playing", round: (room.round || 0) + 1, items, startAt: fs().FieldValue.serverTimestamp() });
    } catch (e) { alert(errText(e)); }
    $("btn-lobby-start").disabled = false;
  }

  function beginRound() {
    const items = (room.items || []).map((x) => {
      const q = findQ(x.k);
      if (!q) return null;
      return { letter: q.l, q, status: "pending", given: "", choices: x.ch && x.ch.length ? x.ch : null };
    }).filter(Boolean);
    if (!items.length) return;
    meRef().set({ ...myInfo(), correct: 0, wrong: 0, answered: 0, done: false, time: 0, round: room.round, updatedAt: fs().FieldValue.serverTimestamp() }).catch(() => {});
    closeMode();
    game.mode = room.mode === "choice" ? "choice" : "keyboard";
    startGame(catById(room.cat), { items, total: room.total, online: true });
    renderLive();
  }

  // Her cevaptan sonra skoru gönder (art arda cevaplarda tek yazma)
  function report(done) {
    if (!code || !game.online) return;
    clearTimeout(reportTimer);
    const send = () => {
      const c = (s) => game.items.filter((i) => i.status === s).length;
      meRef().update({
        correct: c("correct"), wrong: c("wrong"),
        answered: game.items.filter((i) => i.status === "correct" || i.status === "wrong").length,
        done: !!done, time: game.total ? game.total - Math.max(0, game.time) : game.elapsed || 0,
        round: room ? room.round : 0, updatedAt: fs().FieldValue.serverTimestamp(),
      }).catch((e) => console.warn("Skor gönderilemedi:", e));
    };
    if (done) send(); else reportTimer = setTimeout(send, 250);
  }

  // Rövanş: kurucu aynı ayarlarla hemen yeni tur başlatır
  async function rematch() {
    if (!isHost()) return backToLobby();
    const r = room ? room.round : 0;
    const waiting = players.filter((p) => p.round === r && !p.done && p.id !== Auth.user.uid).length;
    if (waiting && !confirm(waiting + " oyuncu hâlâ oynuyor. Yine de yeni tur başlasın mı?")) return;
    await start();
  }

  // Emoji tepkileri: oyuncu kaydındaki react alanı değişince ekranda uçur
  let seenReacts = {};
  function handleReacts() {
    players.forEach((p) => {
      if (!p.react || typeof p.react.n !== "number") return;
      const prev = seenReacts[p.id];
      seenReacts[p.id] = p.react.n;
      if (prev === undefined || prev === p.react.n || p.id === Auth.user.uid) return;
      if (typeof floatEmoji === "function") floatEmoji(p.react.e, p.name);
    });
  }
  function react(e) {
    if (!code) return;
    meRef().update({ react: { e, n: Date.now() % 2000000000 } }).catch((err) => console.warn("Tepki gönderilemedi:", err));
  }

  async function backToLobby() {
    if (!code) return showScreen("menu");
    if (isHost() && room.status === "playing") {
      try { await roomRef().update({ status: "lobby" }); } catch (e) { console.warn(e); }
    }
    renderLobby();
    showScreen("lobby");
  }

  /* ---------- Görünüm ---------- */
  function ranked() {
    const r = room ? room.round : 0;
    return players.filter((p) => p.round === r).sort((a, b) =>
      (b.correct - a.correct) || (a.wrong - b.wrong) || ((b.done ? 1 : 0) - (a.done ? 1 : 0)) || (a.time - b.time));
  }

  function avatarNode(p, cls) {
    const el = document.createElement("span");
    el.className = cls;
    paintAvatar(el, p);
    return el;
  }

  function renderLobby() {
    if (!code || !room) return;
    $("lobby-code").textContent = code;
    const cat = catById(room.cat);
    const level = [...$("opt-time").options].find((o) => o.value === String(room.total));
    $("lobby-info").textContent = cat.icon + " " + cat.name + " · " + (level ? level.textContent : "") + " · " + (room.mode === "choice" ? "Şıklı" : "Yazarak / sesle");
    const list = $("lobby-players");
    list.innerHTML = "";
    players.slice().sort((a, b) => (a.id === room.host ? -1 : b.id === room.host ? 1 : 0)).forEach((p, i) => {
      const li = document.createElement("li");
      li.style.setProperty("--i", i);
      li.appendChild(avatarNode(p, "lb-ava"));
      const n = document.createElement("span"); n.className = "lp-name";
      n.textContent = p.name + (p.id === Auth.user.uid ? " (sen)" : "");
      li.appendChild(n);
      if (p.id === room.host) { const b = document.createElement("span"); b.className = "lp-host"; b.textContent = "👑 Kurucu"; li.appendChild(b); }
      list.appendChild(li);
    });
    $("lobby-count").textContent = players.length + " oyuncu";
    const host = isHost();
    $("btn-lobby-start").classList.toggle("hidden", !host);
    $("lobby-wait").classList.toggle("hidden", host);
    $("lobby-hint").textContent = host ? (players.length < 2 ? "Arkadaşlarına kodu gönder. Gelenler burada görünür." : "Herkes hazırsa başlat!") : "";
  }

  function renderLive() {
    const box = $("live-board");
    if (!code || !game.online) { box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    box.innerHTML = "";
    ranked().forEach((p, i) => {
      const d = document.createElement("div");
      d.className = "lv" + (p.id === Auth.user.uid ? " me" : "") + (p.done ? " done" : "");
      const rk = document.createElement("b"); rk.className = "lv-rank"; rk.textContent = i + 1;
      d.appendChild(rk);
      d.appendChild(avatarNode(p, "lv-ava"));
      const n = document.createElement("span"); n.className = "lv-name"; n.textContent = p.id === Auth.user.uid ? "Sen" : p.name;
      const s = document.createElement("span"); s.className = "lv-score"; s.textContent = "✔" + p.correct + (p.done ? " 🏁" : "");
      d.append(n, s);
      box.appendChild(d);
    });
  }

  function renderRanking() {
    const box = $("online-rank");
    if (!code || !game.online || !game.over) { box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    const list = $("online-rank-list");
    list.innerHTML = "";
    const medals = ["🥇", "🥈", "🥉"];
    const rows = ranked();
    rows.forEach((p, i) => {
      const li = document.createElement("li");
      if (p.id === Auth.user.uid) li.classList.add("me");
      const rk = document.createElement("span"); rk.className = "lb-rank"; rk.textContent = medals[i] || String(i + 1);
      const n = document.createElement("span"); n.className = "lb-name";
      n.textContent = p.name + (p.id === Auth.user.uid ? " (sen)" : "");
      const sm = document.createElement("small");
      sm.textContent = p.done ? "✘ " + p.wrong + " yanlış · " + Math.floor(p.time / 60) + ":" + String(p.time % 60).padStart(2, "0") : "oynuyor…";
      n.appendChild(sm);
      const sc = document.createElement("span"); sc.className = "lb-score"; sc.textContent = p.correct;
      li.append(rk, avatarNode(p, "lb-ava"), n, sc);
      list.appendChild(li);
    });
    const waiting = rows.filter((p) => !p.done).length;
    $("online-rank-note").textContent = waiting ? waiting + " oyuncu hâlâ oynuyor, sıralama canlı güncelleniyor." : "Herkes bitirdi!";
    const first = rows[0];
    if (!waiting && first) {
      $("result-title").textContent = first.id === Auth.user.uid ? "🏆 Kazandın!" : "🏆 Kazanan: " + first.name;
      if (first.id === Auth.user.uid && rows.length > 1 && typeof Extras !== "undefined") Extras.onlineWon();
    }
    if (!waiting && !isHost()) $("online-rank-note").textContent = "Herkes bitirdi! Kurucu rövanş başlatabilir.";
  }

  async function share() {
    const url = location.origin + location.pathname + "?oda=" + code;
    const text = "Harf Çarkı'nda benimle yarış! Oda kodu: " + code;
    if (navigator.share) { try { await navigator.share({ title: "Harf Çarkı", text, url }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(text + " " + url); flashLobby("Davet bağlantısı kopyalandı 👍"); }
    catch { prompt("Bu bağlantıyı arkadaşına gönder:", url); }
  }
  function flashLobby(msg) { const m = $("lobby-hint"); m.textContent = msg; }

  return { create, join, leave, start, rematch, react, report, backToLobby, share, renderRanking, renderLive, canPlay, active, isHost, get code() { return code; } };
})();
