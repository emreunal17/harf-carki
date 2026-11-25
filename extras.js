"use strict";
// GÜNÜN ÇARKI · SERİ · ROZETLER · HAFTALIK LİDERLİK · JOKERLER · EMOJİ TEPKİLERİ
// app.js'ten sonra yüklenir; app.js bu dosyadaki işlevleri oyun sırasında çağırır.

/* ================= TARİH (Türkiye saati) ================= */
function dayKey(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function dayShift(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
// ISO hafta (pazartesi başlar): "2026-W48"
function weekKey(key = dayKey()) {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3); // haftanın perşembesi
  const fy = t.getUTCFullYear();
  const w = 1 + Math.floor((t - Date.UTC(fy, 0, 1)) / 864e5 / 7);
  return fy + "-W" + String(w).padStart(2, "0");
}
const trDate = (key) => key.split("-").reverse().join(".");
function daysLeftInWeek() {
  const [y, m, d] = dayKey().split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 0 = pazartesi
  return 7 - dow;
}
// Türkiye saatiyle gece yarısına kalan süre (Türkiye sabit UTC+3)
function untilMidnightText() {
  const ist = Date.now() + 3 * 3600e3;
  const ms = Math.ceil(ist / 864e5) * 864e5 - ist;
  const h = Math.floor(ms / 3600e3), mn = Math.floor((ms % 3600e3) / 60e3);
  return (h ? h + " sa " : "") + mn + " dk";
}

/* ================= KÜÇÜK BİLDİRİM ================= */
let toastTimer = null;
function toast(msg, ms = 2600) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

/* ================= GÜNÜN ÇARKI ================= */
const DAILY = { id: "gunluk", name: "Günün Çarkı", icon: "📅", color: "#ff9f1c" };
const DAILY_TIME = 240;
function seededRandom(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Herkese aynı gün aynı sorular ve aynı şık sırası
function buildDaily(key = dayKey()) {
  const rnd = seededRandom("harfcarki-" + key);
  const orig = Math.random;
  Math.random = rnd;
  try {
    return LETTERS.map((L) => {
      const options = CATEGORIES.flatMap((c) => c.questions.filter((q) => q.l === L)
        .map((q) => ({ ...q, cat: c.name, catId: c.id, key: qKey(c.id, q) })));
      if (!options.length) return null;
      const q = options[Math.floor(rnd() * options.length)];
      const it = { letter: L, q, status: "pending", given: "" };
      it.choices = buildChoices(it);
      return it;
    }).filter(Boolean);
  } finally { Math.random = orig; }
}
const dailyDone = (p) => !!(p.daily && p.daily.date === dayKey());

function squares(res) {
  const m = { c: "🟩", w: "🟥" };
  const sq = [...res].map((ch) => m[ch] || "🟦");
  const rows = [];
  for (let i = 0; i < sq.length; i += 7) rows.push(sq.slice(i, i + 7).join(""));
  return rows.join("\n");
}
const resString = (items) => items.map((i) => (i.status === "correct" ? "c" : i.status === "wrong" ? "w" : "p")).join("");

function shareTextFor(o) {
  // o: { daily, date, catName, catIcon, res, mode, streak }
  const c = [...o.res].filter((x) => x === "c").length, w = [...o.res].filter((x) => x === "w").length, e = o.res.length - c - w;
  const head = o.daily ? "Harf Çarkı 📅 " + trDate(o.date) : "Harf Çarkı · " + o.catIcon + " " + o.catName;
  return head + "\n✔ " + c + "  ✘ " + w + "  ↻ " + e + (o.mode === "choice" ? " · Şıklı" : "") +
    (o.streak > 1 ? "\n🔥 " + o.streak + " gündür oynuyorum" : "") + "\n\n" + squares(o.res) + "\n\n" +
    (o.daily ? "Sen de bugünün çarkını çöz:" : "Sen de dene:") + " " + location.origin + location.pathname;
}
async function shareText(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e && e.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(text); toast("Sonuç kopyalandı. WhatsApp'a yapıştırabilirsin 👍"); }
  catch { prompt("Kopyala ve paylaş:", text); }
}

function openDaily() {
  const p = getProfile();
  if (!dailyDone(p)) {
    askMode(DAILY);
    $("mode-msg").textContent = "Bugün herkese aynı 28 soru · " + DAILY_TIME / 60 + " dakika · günde 1 hak";
    return;
  }
  const d = p.daily;
  $("dd-date").textContent = trDate(d.date) + (d.mode === "choice" ? " · Şıklı" : "");
  $("dd-grid").textContent = d.res ? squares(d.res) : "";
  const c = d.res ? [...d.res].filter((x) => x === "c").length : 0;
  $("dd-score").textContent = d.res ? c + " / " + d.res.length + " doğru" : "Bugünkü çarkı yarıda bıraktın.";
  $("dd-next").textContent = "Yeni çark " + untilMidnightText() + " sonra";
  $("btn-dd-share").classList.toggle("hidden", !d.res);
  $("daily-done").classList.remove("hidden");
}
$("btn-daily").addEventListener("click", openDaily);
$("btn-dd-close").addEventListener("click", () => $("daily-done").classList.add("hidden"));
$("daily-done").addEventListener("click", (e) => { if (e.target.id === "daily-done") $("daily-done").classList.add("hidden"); });
$("btn-dd-share").addEventListener("click", () => {
  const p = getProfile();
  if (!p.daily || !p.daily.res) return;
  shareText(shareTextFor({ daily: true, date: p.daily.date, res: p.daily.res, mode: p.daily.mode, streak: currentStreak(p) }));
});

/* ================= SERİ ================= */
function bumpStreak(p) {
  const t = dayKey();
  const s = p.streak || { last: "", count: 0, best: 0 };
  if (s.last !== t) {
    s.count = s.last === dayShift(t, -1) ? s.count + 1 : 1;
    s.last = t;
    s.best = Math.max(s.best || 0, s.count);
  }
  p.streak = s;
  return s.count;
}
function currentStreak(p) {
  const s = p.streak;
  if (!s) return 0;
  const t = dayKey();
  return s.last === t || s.last === dayShift(t, -1) ? s.count : 0;
}

function paintMenuExtras() {
  const p = getProfile();
  const st = currentStreak(p);
  const pill = $("streak-pill");
  pill.textContent = "🔥 " + st;
  pill.title = st + " gündür üst üste oynuyorsun";
  pill.classList.toggle("hidden", st < 1);
  pill.classList.toggle("cold", st > 0 && p.streak.last !== dayKey()); // bugün henüz oynamadı
  const done = dailyDone(p);
  const c = done && p.daily.res ? [...p.daily.res].filter((x) => x === "c").length : 0;
  $("daily-state").textContent = done ? (p.daily.res ? "✔ " + c + "/" + p.daily.res.length + " · Paylaş" : "Yarım kaldı") : "Bugün oyna ▶";
  $("btn-daily").classList.toggle("done", done);
}

/* ================= ROZETLER ================= */
const BADGES = [
  { id: "ilk", icon: "🎉", name: "İlk Adım", desc: "İlk oyununu bitir" },
  { id: "yirmi", icon: "💪", name: "20 Kulübü", desc: "Bir oyunda 20 doğru yap" },
  { id: "kusursuz", icon: "🏆", name: "Kusursuz Çark", desc: "28 harfin hepsini doğru bil" },
  { id: "paslamadan", icon: "🎯", name: "Pas Yok", desc: "Hiç pas geçmeden bütün harfleri cevapla" },
  { id: "simsek", icon: "⚡", name: "Şimşek", desc: "Süreli oyunda bütün harfleri sürenin yarısı dolmadan bitir" },
  { id: "jokersiz", icon: "🧠", name: "Jokersiz", desc: "Joker kullanmadan 20 doğru yap" },
  { id: "gunluk", icon: "📅", name: "Günlük Oyuncu", desc: "Günün çarkını bitir" },
  { id: "seri3", icon: "🔥", name: "3 Gün Seri", desc: "3 gün üst üste oyna" },
  { id: "seri7", icon: "☄️", name: "Haftalık Seri", desc: "7 gün üst üste oyna" },
  { id: "seri30", icon: "🌋", name: "Ay Boyu Seri", desc: "30 gün üst üste oyna" },
  { id: "herkategori", icon: "🌈", name: "Her Telden", desc: "Bütün kategorilerde rekor kır" },
  { id: "ansiklopedi", icon: "📚", name: "Ayaklı Ansiklopedi", desc: "Bütün kategorilerde en az 20 doğruluk rekor" },
  { id: "online", icon: "👥", name: "Takım Oyuncusu", desc: "Arkadaşlarınla bir tur oyna" },
  { id: "sampiyon", icon: "👑", name: "Oda Şampiyonu", desc: "Online bir turu birinci bitir" },
  { id: "yuz", icon: "💯", name: "Yüzlük", desc: "Toplam 100 doğru yap" },
  { id: "bin", icon: "🏅", name: "Binlik", desc: "Toplam 1000 doğru yap" },
];
const badgeById = (id) => BADGES.find((b) => b.id === id);
function award(p, ids) {
  p.badges = p.badges || {};
  const fresh = ids.filter((id) => badgeById(id) && !p.badges[id]);
  fresh.forEach((id) => { p.badges[id] = dayKey(); });
  return fresh;
}
function checkBadges(p, g) {
  const ids = ["ilk"];
  if (g.c >= 20) ids.push("yirmi");
  if (g.c === g.n) ids.push("kusursuz");
  if (g.e === 0 && !g.passed) ids.push("paslamadan");
  if (g.e === 0 && g.total && g.timeLeft >= g.total / 2) ids.push("simsek");
  if (g.c >= 20 && !g.jokerUsed) ids.push("jokersiz");
  if (g.daily) ids.push("gunluk");
  if (g.online) ids.push("online");
  const st = currentStreak(p);
  if (st >= 3) ids.push("seri3");
  if (st >= 7) ids.push("seri7");
  if (st >= 30) ids.push("seri30");
  const rec = (id) => Math.max(p.best[id] || 0, (p.sik.best || {})[id] || 0);
  if (CATEGORIES.every((c) => rec(c.id) > 0)) ids.push("herkategori");
  if (CATEGORIES.every((c) => rec(c.id) >= 20)) ids.push("ansiklopedi");
  const total = (p.correct || 0) + ((p.sik && p.sik.correct) || 0);
  if (total >= 100) ids.push("yuz");
  if (total >= 1000) ids.push("bin");
  return award(p, ids);
}
function showNewBadges(ids) {
  const box = $("new-badges");
  box.innerHTML = "";
  box.classList.toggle("hidden", !ids.length);
  ids.forEach((id, i) => {
    const b = badgeById(id);
    const el = document.createElement("div");
    el.className = "nb";
    el.style.setProperty("--i", i);
    el.innerHTML = '<span class="nb-ico"></span><span><b></b><small></small></span>';
    el.querySelector(".nb-ico").textContent = b.icon;
    el.querySelector("b").textContent = "Yeni rozet: " + b.name;
    el.querySelector("small").textContent = b.desc;
    box.appendChild(el);
  });
}
function renderBadgeGrid(p) {
  const got = p.badges || {};
  const grid = $("badge-grid");
  grid.innerHTML = "";
  BADGES.forEach((b) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "badge" + (got[b.id] ? " got" : "");
    el.innerHTML = '<span class="bi"></span><span class="bn"></span>';
    el.querySelector(".bi").textContent = got[b.id] ? b.icon : "🔒";
    el.querySelector(".bn").textContent = b.name;
    el.title = b.desc;
    el.onclick = () => toast(b.icon + " " + b.name + " — " + b.desc + (got[b.id] ? " ✔ (" + trDate(got[b.id]) + ")" : ""), 3200);
    grid.appendChild(el);
  });
  $("badge-count").textContent = Object.keys(got).filter(badgeById).length + "/" + BADGES.length;
}

/* ================= HAFTALIK LİDERLİK ================= */
const Weekly = {
  ref(wk) { return Auth.db.collection("weekly").doc(wk).collection("scores").doc(Auth.user.uid); },
  // Oyun sonunda bu haftanın toplamına ekle (sunucuda artırarak: başka cihazdaki oyunlar da korunur)
  async add(p, c) {
    const wk = weekKey();
    p.wk = p.wk && p.wk.id === wk ? p.wk : { id: wk, score: 0, games: 0 };
    p.wk.score += c; p.wk.games += 1;
    if (!Cloud.enabled()) return;
    const info = Cloud.clean(p);
    const inc = firebase.firestore.FieldValue.increment;
    const data = { name: info.name, avatar: info.avatar, score: inc(c), games: inc(1), updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    try {
      await this.ref(wk).set(info.photo ? { ...data, photo: info.photo } : data, { merge: true });
    } catch (e) {
      console.warn("Haftalık skor yazılamadı:", e);
    }
  },
};

/* ================= JOKERLER ================= */
function resetJokers() {
  game.jokers = { half: 1, hint: 1 };
  game.jokerUsed = false;
  game.passed = false;
  paintJokers();
}
function paintJokers() {
  const j = game.jokers || { half: 0, hint: 0 };
  $("jk-half").classList.toggle("hidden", game.mode !== "choice");
  $("jk-half").disabled = !j.half;
  $("jk-hint").disabled = !j.hint;
}
function hintText(a) {
  let shown = 0;
  return [...a].map((ch) => {
    if (ch === " ") return "  ";
    if (shown < 2) { shown++; return ch.toLocaleUpperCase("tr-TR"); }
    return "_";
  }).join(" ");
}
function paintHint(it) {
  const h = $("hint");
  h.textContent = it && it.hinted ? "💡 " + hintText(it.q.a) : "";
}
function useHint() {
  if (game.over || game.paused || game.busy || !game.jokers || !game.jokers.hint) return;
  const it = game.items[game.idx];
  it.hinted = true;
  game.jokers.hint = 0; game.jokerUsed = true;
  paintHint(it); paintJokers(); beep("pas");
}
function useHalf() {
  if (game.mode !== "choice" || game.over || game.paused || game.busy || !game.jokers || !game.jokers.half) return;
  const it = game.items[game.idx];
  if (!it.choices) return;
  const wrong = it.choices.map((c, i) => i).filter((i) => it.choices[i] !== it.q.a);
  it.halfGone = wrong[Math.floor(Math.random() * wrong.length)];
  game.jokers.half = 0; game.jokerUsed = true;
  paintGone(it); paintJokers(); beep("pas");
}
function paintGone(it) {
  if (it.halfGone === undefined) return;
  const b = $("choices").children[it.halfGone];
  if (b) { b.classList.add("gone"); b.disabled = true; }
}
$("jk-hint").addEventListener("click", useHint);
$("jk-half").addEventListener("click", useHalf);

/* ================= EMOJİ TEPKİLERİ (online) ================= */
const REACTS = ["😂", "🔥", "😱", "👏", "😎", "🤯"];
let lastReactAt = 0;
function floatEmoji(e, who) {
  if (reducedMotion()) { toast(who + " " + e, 1400); return; }
  const el = document.createElement("div");
  el.className = "react-float";
  el.style.left = 12 + Math.random() * 70 + "%";
  el.innerHTML = '<span class="rf-e"></span><span class="rf-n"></span>';
  el.querySelector(".rf-e").textContent = e;
  el.querySelector(".rf-n").textContent = who;
  $("react-layer").appendChild(el);
  setTimeout(() => el.remove(), 2400);
}
function sendReact(e) {
  const now = Date.now();
  if (now - lastReactAt < 1000) return;
  lastReactAt = now;
  floatEmoji(e, "Sen");
  Online.react(e);
  $("react-bar").classList.add("hidden");
}
function buildReactBars() {
  ["react-bar", "react-row"].forEach((id) => {
    const box = $(id);
    box.innerHTML = "";
    REACTS.forEach((e) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = e; b.setAttribute("aria-label", "Tepki: " + e);
      b.onclick = () => sendReact(e);
      box.appendChild(b);
    });
  });
}
buildReactBars();
$("btn-react").addEventListener("click", (ev) => { ev.stopPropagation(); $("react-bar").classList.toggle("hidden"); });
document.addEventListener("click", (ev) => {
  if (!$("react-bar").contains(ev.target) && ev.target.id !== "btn-react") $("react-bar").classList.add("hidden");
});

/* ================= app.js'ten çağrılan kancalar ================= */
const Extras = {
  onStart() {
    resetJokers();
    paintHint(null);
    $("btn-react").classList.toggle("hidden", !game.online);
    $("react-bar").classList.add("hidden");
    if (game.daily) {
      // Günün çarkı başladı: hak kullanıldı (yarıda bırakılırsa tekrar oynanamaz)
      const p = getProfile();
      p.daily = { date: dayKey(), res: "", mode: game.mode };
      saveProfile(p);
    }
  },
  onQuestion(it) { paintHint(it); paintGone(it); paintJokers(); },
  onPass() { game.passed = true; },
  // Tek kişilik oyun bitti: p kaydedilmeden önce çağrılır
  afterSolo(p, g) {
    if (game.daily) p.daily = { date: dayKey(), res: resString(game.items), mode: game.mode };
    bumpStreak(p);
    Weekly.add(p, g.c);
    const fresh = checkBadges(p, { ...g, daily: game.daily, passed: game.passed, jokerUsed: game.jokerUsed, total: game.total, timeLeft: game.time });
    showNewBadges(fresh);
    $("btn-share").classList.remove("hidden");
  },
  afterOnline(g) {
    const p = getProfile();
    bumpStreak(p);
    const fresh = checkBadges(p, { ...g, online: true, passed: game.passed, jokerUsed: game.jokerUsed, total: game.total, timeLeft: game.time });
    saveProfile(p);
    showNewBadges(fresh);
    $("btn-share").classList.add("hidden");
  },
  onlineWon() {
    const p = getProfile();
    const fresh = award(p, ["sampiyon"]);
    if (fresh.length) { saveProfile(p); toast("🏅 Yeni rozet: 👑 Oda Şampiyonu"); }
  },
  share() {
    const p = getProfile();
    shareText(shareTextFor({ daily: game.daily, date: dayKey(), catName: game.cat.name, catIcon: game.cat.icon, res: resString(game.items), mode: game.mode, streak: currentStreak(p) }));
  },
};
$("btn-share").addEventListener("click", () => Extras.share());
