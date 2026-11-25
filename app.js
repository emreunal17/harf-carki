"use strict";

const LETTERS = ["A","B","C","Ç","D","E","F","G","H","I","İ","J","K","L","M","N","O","Ö","P","R","S","Ş","T","U","Ü","V","Y","Z"];
const MIXED = { id: "karisik", name: "Karışık", icon: "🎲", color: "#3d7bff" };
const AVATARS = ["🙂","😎","🤓","🦊","🐱","🐶","🐼","🦁","🐯","🐸","🐵","🦉","🐧","🐙","🦄","🐲","⚽","🏀","🎬","🎸","🚀","🌟","👑","🧠"];

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem("harfcarki." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("harfcarki." + k, JSON.stringify(v)); } catch {} },
};

/* ================= PROFİL & İSTATİSTİK ================= */
function profileKey() { return "profile." + (Auth.user ? Auth.user.uid : "none"); }
function getProfile() {
  const u = Auth.user || { name: "Oyuncu" };
  const p = store.get(profileKey(), null) || {};
  return { name: p.name || u.name || "Oyuncu", avatar: p.avatar || "🙂", games: p.games || 0, correct: p.correct || 0, answered: p.answered || 0, best: p.best || {}, photo: p.photo || "", sik: p.sik || { games: 0, correct: 0, answered: 0, best: {} } };
}
function saveProfile(p) { store.set(profileKey(), p); }

// Profil fotoğrafı: küçültülmüş JPEG (data URL) ya da emoji avatar
const validPhoto = (s) => typeof s === "string" && s.length < 60000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s);
function paintAvatar(el, p) {
  el.textContent = "";
  el.classList.toggle("has-photo", validPhoto(p && p.photo));
  if (validPhoto(p && p.photo)) {
    const img = document.createElement("img");
    img.src = p.photo; img.alt = ""; img.decoding = "async";
    el.appendChild(img);
  } else el.textContent = (p && p.avatar) || "🙂";
}
// Seçilen resmi ortadan kare kırpıp 160 piksele küçült
function photoFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error("Lütfen bir resim seç."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const S = 160, side = Math.min(img.naturalWidth, img.naturalHeight);
      const cv = document.createElement("canvas"); cv.width = cv.height = S;
      const ctx = cv.getContext("2d");
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, S, S);
      URL.revokeObjectURL(url);
      let q = 0.82, out = cv.toDataURL("image/jpeg", q);
      while (out.length > 45000 && q > 0.4) { q -= 0.1; out = cv.toDataURL("image/jpeg", q); }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Resim açılamadı.")); };
    img.src = url;
  });
}

/* ================= BULUT (Firestore) ================= */
const CAT_IDS = () => [...CATEGORIES.map((c) => c.id), "karisik"];
const Cloud = {
  status: "local", // local | synced | error
  enabled() { return !!(Auth.db && Auth.user && Auth.user.provider !== "local"); },
  ref() { return Auth.db.collection("users").doc(Auth.user.uid); },
  clean(p) {
    const best = {};
    CAT_IDS().forEach((id) => { const v = p.best[id]; if (Number.isInteger(v) && v > 0) best[id] = Math.min(28, v); });
    const games = Math.max(0, p.games | 0);
    const answered = Math.min(Math.max(0, p.answered | 0), games * 28);
    return {
      name: (String(p.name || "Oyuncu").trim() || "Oyuncu").slice(0, 20),
      avatar: String(p.avatar || "🙂").slice(0, 8),
      games, answered,
      correct: Math.min(Math.max(0, p.correct | 0), answered),
      best,
      ...(validPhoto(p.photo) ? { photo: p.photo } : {}),
    };
  },
  // Girişte buluttaki kaydı çek, cihazdakiyle birleştir
  async pull() {
    if (!this.enabled()) { this.status = "local"; return; }
    try {
      const snap = await this.ref().get();
      const local = getProfile();
      let merged = local;
      if (snap.exists) {
        const c = snap.data();
        const useCloud = (c.games || 0) >= local.games;
        const best = { ...(c.best || {}) };
        Object.entries(local.best).forEach(([k, v]) => { best[k] = Math.max(best[k] || 0, v); });
        merged = {
          sik: local.sik,
          photo: local.photo || (validPhoto(c.photo) ? c.photo : ""),
          name: c.name || local.name,
          avatar: c.avatar || local.avatar,
          games: useCloud ? c.games : local.games,
          correct: useCloud ? c.correct : local.correct,
          answered: useCloud ? c.answered : local.answered,
          best,
        };
      }
      saveProfile(merged);
      await this.push(merged, snap.exists ? snap.data() : null);
    } catch (e) {
      console.warn("Bulut okunamadı:", e);
      this.status = "error";
    }
  },
  async push(p, current) {
    if (!this.enabled()) { this.status = "local"; return; }
    const data = this.clean(p);
    try {
      if (current === undefined) { const snap = await this.ref().get(); current = snap.exists ? snap.data() : null; }
      // Kurallar tek seferde en fazla 5 oyunluk artışa izin verir
      if (current && data.games > (current.games || 0) + 5) {
        const step = (current.games || 0) + 5;
        data.answered = Math.min(data.answered, (current.answered || 0) + 5 * 28, step * 28);
        data.correct = Math.min(data.correct, data.answered);
        data.games = step;
      }
      try {
        await this.ref().set({ ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      } catch (e) {
        // Kurallar fotoğrafı henüz kabul etmiyorsa skorlar yine de kaydedilsin
        if (!data.photo || e.code !== "permission-denied") throw e;
        delete data.photo;
        await this.ref().set({ ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      }
      this.status = "synced";
    } catch (e) {
      console.warn("Buluta yazılamadı:", e);
      this.status = "error";
    }
  },
};

/* ================= METİN EŞLEŞTİRME ================= */
const lower = (s) => s.toLocaleLowerCase("tr-TR");
function normalize(s) {
  return lower(String(s || ""))
    .replace(/[’'`´]/g, "")
    .replace(/[^a-zçğıöşüâîû0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function fold(s) {
  return normalize(s)
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o")
    .replace(/ş/g, "s").replace(/ü/g, "u").replace(/â/g, "a").replace(/î/g, "i").replace(/û/g, "u")
    .replace(/\s/g, "");
}
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
function isCorrect(input, q) {
  const given = fold(input);
  if (!given) return false;
  return [q.a, ...(q.alt || [])].map(fold).some((ans) => {
    if (given === ans) return true;
    const tol = ans.length >= 9 ? 2 : ans.length >= 5 ? 1 : 0;
    return levenshtein(given, ans) <= tol;
  });
}
const PASS_WORDS = ["pas", "pass", "paso", "pas geç", "pas gec", "geç", "gec", "bilmiyorum", "sonraki"];
function isPassWord(text) {
  const n = normalize(text);
  return PASS_WORDS.includes(n) || /^pas\b/.test(n);
}

/* ================= SES EFEKTLERİ ================= */
let audioCtx = null;
function beep(type) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = { ok: [660, 880], bad: [220, 160], pas: [520, 520], end: [523, 659, 784] }[type];
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type === "bad" ? "sawtooth" : "sine";
      o.frequency.value = f;
      const t = audioCtx.currentTime + i * 0.12;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(t); o.stop(t + 0.2);
    });
  } catch {}
  if (navigator.vibrate && type === "bad") navigator.vibrate(120);
}

/* ================= SESLİ OKUMA (TTS) ================= */
const synth = window.speechSynthesis;
let trVoices = [];
let speakId = 0;
let liveUtterances = []; // Chrome, referansı tutulmayan konuşmaları yarıda kesebiliyor
const STUDIO = "studio";
let studio = null; // { voiceName, clips: { metin: dosya } }  — audio/manifest.json
let liveAudio = null;
function loadStudio() {
  return fetch("audio/manifest.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => { if (m && m.clips && Object.keys(m.clips).length) { studio = m; loadVoices(); } })
    .catch(() => {});
}
const useStudio = () => !!studio && $("opt-voice").value === STUDIO;

// Daha doğal sesleri öne al (Edge "Natural", Google, iOS "Gelişmiş/Premium" sesler)
function voiceScore(v) {
  const n = v.name.toLowerCase();
  let s = 0;
  if (/natural|neural|online|premium|enhanced|gelişmiş|wavenet/.test(n)) s += 20;
  if (/google/.test(n)) s += 8;
  if (/emel|ahmet|yelda|cem/.test(n)) s += 3;
  if (/microsoft/.test(n)) s += 2;
  if (v.localService === false) s += 1;
  return s;
}
function loadVoices() {
  trVoices = !synth ? [] : synth.getVoices().filter((v) => /^tr([-_]|$)/i.test(v.lang)).sort((a, b) => voiceScore(b) - voiceScore(a));
  const sel = $("opt-voice");
  const saved = store.get("opt-voice", null);
  sel.innerHTML = "";
  if (studio) {
    const o = document.createElement("option");
    o.value = STUDIO;
    o.textContent = "🎙 " + (studio.voiceName || "Doğal ses") + " · stüdyo sesi ★★";
    sel.appendChild(o);
  }
  if (!trVoices.length) {
    if (!studio) sel.innerHTML = '<option value="">Cihazın varsayılan sesi</option>';
  } else {
    trVoices.forEach((v) => {
      const o = document.createElement("option");
      o.value = v.voiceURI;
      o.textContent = prettyVoiceName(v) + (voiceScore(v) >= 20 ? " ★" : "");
      sel.appendChild(o);
    });
  }
  if (saved && [...sel.options].some((o) => o.value === saved)) sel.value = saved;
  else if (studio) sel.value = STUDIO;
  if (studio || trVoices.length) $("voice-row").classList.remove("hidden");
  const best = trVoices[0];
  let tip = "";
  if (useStudio()) tip = "";
  else if (!trVoices.length) tip = "Cihazda Türkçe ses bulunamadı. Ayarlar → Erişilebilirlik → Metin okuma bölümünden Türkçe ses indirin.";
  else if (!best || voiceScore(best) < 8) {
    tip = /iPhone|iPad|Mac/.test(navigator.userAgent)
      ? "Daha doğal ses için: Ayarlar → Erişilebilirlik → Seslendirilen İçerik → Sesler → Türkçe → Yelda (Gelişmiş) indirin."
      : "Daha doğal ses için: Windows'ta Edge tarayıcısı, Android'de Google Konuşma Hizmetleri Türkçe sesini kullanın.";
  }
  $("voice-tip").textContent = tip;
}
function prettyVoiceName(v) {
  return v.name.replace(/^Microsoft\s+/i, "").replace(/\s*-\s*Turkish.*$/i, "").replace(/\s*\(Turkey\)|\s*Türkçe \(Türkiye\)/gi, "").trim() || v.name;
}
function currentVoice() {
  const uri = $("opt-voice").value;
  return trVoices.find((v) => v.voiceURI === uri) || trVoices[0] || null;
}
if (synth) { loadVoices(); synth.onvoiceschanged = loadVoices; }

// Parçaları sırayla okur; hepsi bitince onEnd çağrılır.
// clipKey verilirse ve stüdyo sesi seçiliyse hazır ses dosyası çalınır; olmazsa cihaz sesine düşer.
function speak(parts, onEnd, clipKey) {
  const done = (() => { let called = false; return () => { if (!called) { called = true; onEnd && onEnd(); } }; })();
  if (!$("opt-tts").checked) { done(); return; }
  const rate = parseFloat($("opt-rate").value) || 0.95;
  const file = useStudio() && clipKey && studio.clips[clipKey];
  if (file) {
    const myId = ++speakId;
    if (synth) synth.cancel();
    if (liveAudio) liveAudio.pause();
    const a = new Audio("audio/" + file);
    liveAudio = a;
    a.playbackRate = Math.min(1.3, Math.max(0.75, rate / 0.95));
    const fallback = () => { if (myId === speakId) { liveAudio = null; speakDevice(parts, done); } };
    a.onended = () => { if (myId === speakId) done(); };
    a.onerror = fallback;
    const p = a.play();
    if (p && p.catch) p.catch(fallback);
    return;
  }
  speakDevice(parts, done);
}
function speakDevice(parts, done) {
  if (!synth) { done(); return; }
  const myId = ++speakId;
  synth.cancel();
  // cancel()'dan hemen sonra speak() bazı tarayıcılarda ilk kelimeleri yutuyor; kısa bekle
  setTimeout(() => {
    if (myId !== speakId) return;
    const voice = currentVoice();
    const rate = parseFloat($("opt-rate").value) || 0.95;
    const list = [].concat(parts).filter(Boolean).map(speechText);
    liveUtterances = list.map((text, i) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voice ? voice.lang : "tr-TR";
      if (voice) u.voice = voice;
      u.rate = rate;
      u.pitch = 1;
      if (i === list.length - 1) {
        u.onend = () => { if (myId === speakId) done(); };
        u.onerror = (e) => { if (myId === speakId && e.error !== "interrupted" && e.error !== "canceled") done(); };
      }
      return u;
    });
    liveUtterances.forEach((u) => synth.speak(u));
    // Hiç başlayamazsa (ses motoru yok vb.) oyunu bekletme
    setTimeout(() => { if (myId === speakId && !synth.speaking && !synth.pending) done(); }, 3000);
  }, 120);
}
function stopSpeaking() {
  speakId++;
  if (synth) synth.cancel();
  if (liveAudio) { liveAudio.pause(); liveAudio = null; }
}

function questionSpeech(it) {
  return [it.q.s || it.q.q, letterHint(it.q, it.letter)];
}
function speakQuestion(it, onEnd) {
  speak(questionSpeech(it), onEnd, clipText(it.q, it.letter));
}

/* ================= SESLE CEVAP (STT) ================= */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false;

let listenRetries = 0; // sesle modda sessiz kalınca kaç kez yeniden dinlendi
function startListening(auto) {
  if (!SR || listening || game.paused || game.over || game.busy) return;
  if (!auto) listenRetries = 0;
  rec = new SR();
  const myRec = rec;
  let gotResult = false;
  rec.lang = "tr-TR";
  rec.interimResults = true;
  rec.maxAlternatives = 5;
  rec.continuous = false;
  const token = game.turn;

  rec.onstart = () => { listening = true; $("btn-mic").classList.add("listening"); $("heard").textContent = "Dinliyorum… cevabını söyle (ya da “pas”)"; };
  rec.onresult = (e) => {
    const res = e.results[e.results.length - 1];
    $("answer").value = res[0].transcript.trim();
    if (!res.isFinal || token !== game.turn) return;
    const alts = Array.from(res).map((a) => a.transcript.trim()).filter(Boolean);
    $("heard").textContent = "Duyulan: “" + alts[0] + "”";
    gotResult = true;
    stopListening();
    handleVoice(alts);
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") { listenRetries = 99; $("heard").textContent = "Mikrofon izni verilmedi. Tarayıcı ayarlarından izin verin."; }
    else if (e.error === "no-speech") $("heard").textContent = "Ses algılanamadı. 🎤 ile tekrar dene.";
    else if (e.error !== "aborted") $("heard").textContent = "Ses tanıma hatası: " + e.error;
  };
  rec.onend = () => {
    if (rec !== myRec) return; // yerine yenisi başlatıldı
    listening = false; $("btn-mic").classList.remove("listening");
    // Sesle oynarken cevap gelmeden kapandıysa (sessizlik) birkaç kez kendiliğinden yeniden dinle
    if (!gotResult && !myRec.stopped && game.mode === "voice" && token === game.turn && !game.busy && !game.paused && !game.over) {
      if (listenRetries < 3) { listenRetries++; setTimeout(() => { if (token === game.turn) startListening(true); }, 250); }
      else $("heard").textContent = "Seni duyamadım. Konuşmak için 🎤 düğmesine dokun.";
    }
  };
  try { rec.start(); } catch {}
}
function stopListening() {
  if (rec) { rec.stopped = true; try { rec.abort(); } catch {} }
  listening = false;
  $("btn-mic").classList.remove("listening");
}
function handleVoice(alts) {
  if (alts.some(isPassWord)) return pass();
  const q = game.items[game.idx].q;
  submit(alts.find((t) => isCorrect(t, q)) || alts[0]);
}

/* ================= OYUN ================= */
const game = { items: [], idx: 0, time: 0, total: 0, timerId: null, paused: false, over: true, cat: null, turn: 0, busy: false, level: "", mode: "keyboard" };

// Son oyunlarda sorulanları hatırla; her harfte önce görülmemiş sorulardan seç
const SEEN_MAX = 1500;
const qKey = (catId, q) => catId + "|" + q.l + "|" + q.a;
function buildQuestions(cat) {
  const pools = cat.id === MIXED.id ? CATEGORIES : [cat];
  const seen = store.get("seen", []);
  const seenSet = new Set(seen);
  const items = LETTERS.map((L) => {
    const options = pools.flatMap((c) => c.questions.filter((q) => q.l === L).map((q) => ({ ...q, cat: c.name, catId: c.id, key: qKey(c.id, q) })));
    if (!options.length) return null;
    const fresh = options.filter((q) => !seenSet.has(q.key));
    let pool = fresh;
    if (!fresh.length) {
      // Bu harfin bütün soruları görüldüyse en eskisinden başla
      const order = (q) => seen.indexOf(q.key);
      const oldest = Math.min(...options.map(order));
      pool = options.filter((q) => order(q) === oldest);
    }
    const q = pool[Math.floor(Math.random() * pool.length)];
    return { letter: L, q, status: "pending", given: "" };
  }).filter(Boolean);
  const used = new Set(items.map((it) => it.q.key));
  store.set("seen", [...seen.filter((k) => !used.has(k)), ...used].slice(-SEEN_MAX));
  return items;
}

/* ---------- Şıklar: doğru cevap + aynı harf kuralına uyan 2 yanlış ---------- */
function fitsRule(ans, letter, contains) {
  const a = lower(ans), l = lower(letter);
  return contains ? a.includes(l) : a.startsWith(l);
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
function buildChoices(it) {
  const q = it.q, contains = !!q.c;
  // Elle hazırlanmış, soruyla aynı türden yanlış şıklar (questions-choices.js)
  const hand = typeof WRONG_CHOICES !== "undefined" && WRONG_CHOICES[q.catId] && WRONG_CHOICES[q.catId][q.a];
  if (hand && hand.length >= 2) return shuffle([q.a, hand[0], hand[1]]);
  const taken = new Set([q.a, ...(q.alt || [])].map(fold));
  const pick = (cats) => {
    const out = [];
    cats.forEach((c) => c.questions.forEach((o) => {
      if (o.l !== it.letter || !!o.c !== contains) return;
      const f = fold(o.a);
      if (taken.has(f) || !fitsRule(o.a, it.letter, contains) || out.some((x) => fold(x) === f)) return;
      out.push(o.a);
    }));
    return shuffle(out);
  };
  // Önce aynı kategoriden, yetmezse diğerlerinden
  let wrong = pick(CATEGORIES.filter((c) => c.id === q.catId)).slice(0, 2);
  if (wrong.length < 2) {
    wrong.forEach((w) => taken.add(fold(w)));
    wrong = wrong.concat(pick(CATEGORIES.filter((c) => c.id !== q.catId)).slice(0, 2 - wrong.length));
  }
  if (wrong.length < 2) {
    // "İçinde … var" sorularında: harfi içeren herhangi bir cevap
    wrong.forEach((w) => taken.add(fold(w)));
    const any = [];
    CATEGORIES.forEach((c) => c.questions.forEach((o) => {
      const f = fold(o.a);
      if (!taken.has(f) && fitsRule(o.a, it.letter, true) && !any.some((x) => fold(x) === f)) any.push(o.a);
    }));
    wrong = wrong.concat(shuffle(any).slice(0, 2 - wrong.length));
  }
  return shuffle([q.a, ...wrong]);
}
function renderChoices(it) {
  const box = $("choices");
  box.innerHTML = "";
  if (game.mode !== "choice") return;
  if (!it.choices) it.choices = buildChoices(it);
  it.choices.forEach((text, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "choice";
    b.style.setProperty("--i", i);
    const k = document.createElement("span"); k.className = "choice-key"; k.textContent = "ABC"[i];
    const t = document.createElement("span"); t.className = "choice-text"; t.textContent = text;
    b.append(k, t);
    b.onclick = () => pickChoice(i);
    box.appendChild(b);
  });
}
function pickChoice(i) {
  if (game.mode !== "choice" || game.over || game.paused || game.busy) return;
  const it = game.items[game.idx];
  const btns = [...$("choices").children];
  if (!btns[i]) return;
  btns.forEach((b, k) => {
    b.disabled = true;
    if (it.choices[k] === it.q.a) b.classList.add("right");
    else if (k === i) b.classList.add("wrong");
    else b.classList.add("dim");
  });
  submit(it.choices[i]);
}

function renderWheel() {
  const wheel = $("wheel");
  wheel.querySelectorAll(".bubble").forEach((b) => b.remove());
  const n = game.items.length;
  game.items.forEach((it, i) => {
    const ang = (-90 + (360 / n) * i) * (Math.PI / 180);
    const b = document.createElement("div");
    b.className = "bubble";
    b.id = "b-" + i;
    b.style.setProperty("--i", i);
    b.textContent = it.letter;
    b.style.left = 50 + 45 * Math.cos(ang) + "%";
    b.style.top = 50 + 45 * Math.sin(ang) + "%";
    wheel.appendChild(b);
  });
  // giriş animasyonu bir kez oynasın; sonra sınıf değişimlerinde tekrar etmesin
  wheel.classList.add("intro");
  clearTimeout(renderWheel.t);
  renderWheel.t = setTimeout(() => wheel.classList.remove("intro"), 1300);
}
function paintBubbles() {
  game.items.forEach((it, i) => {
    $("b-" + i).className = "bubble" + (it.status !== "pending" ? " " + it.status : "") + (i === game.idx && !game.over && !game.busy ? " current" : "");
  });
  const c = (s) => game.items.filter((it) => it.status === s).length;
  setCount("cnt-correct", c("correct"));
  setCount("cnt-wrong", c("wrong"));
  setCount("cnt-pass", c("passed"));
}

function setCount(id, n) {
  const el = $(id);
  if (el.textContent !== String(n)) {
    el.textContent = n;
    el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
  }
}
// Animasyonu baştan oynat
function replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
const reducedMotion = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Doğru cevapta harf ampulünden kıvılcım saç
function sparks(i, color) {
  if (reducedMotion()) return;
  const b = $("b-" + i);
  if (!b) return;
  const wheel = $("wheel");
  for (let k = 0; k < 14; k++) {
    const sp = document.createElement("span");
    sp.className = "spark";
    const ang = (Math.PI * 2 * k) / 14 + Math.random() * 0.4;
    const dist = 26 + Math.random() * 34;
    sp.style.left = b.style.left; sp.style.top = b.style.top;
    sp.style.setProperty("--dx", Math.cos(ang) * dist + "px");
    sp.style.setProperty("--dy", Math.sin(ang) * dist + "px");
    sp.style.setProperty("--sc", color);
    wheel.appendChild(sp);
    setTimeout(() => sp.remove(), 800);
  }
}

// Ekranın üstünden konfeti yağdır
function confetti(n = 70) {
  if (reducedMotion()) return;
  const colors = ["#ffb22e", "#ffd36b", "#2ed69b", "#4fa8ff", "#ff5b4f", "#f6eedb"];
  for (let k = 0; k < n; k++) {
    const c = document.createElement("i");
    c.className = "confetti";
    c.style.left = Math.random() * 100 + "vw";
    c.style.background = colors[k % colors.length];
    c.style.setProperty("--dx", (Math.random() * 160 - 80) + "px");
    c.style.setProperty("--r", (Math.random() * 900 - 450) + "deg");
    c.style.animationDuration = 1.8 + Math.random() * 1.6 + "s";
    c.style.animationDelay = Math.random() * 0.5 + "s";
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4200);
  }
}

// Sayıyı 0'dan hedefe doğru say
function countUp(el, to, ms = 700) {
  if (reducedMotion() || !to) { el.textContent = to; return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  el.textContent = 0;
  requestAnimationFrame(step);
}

function startGame(cat, opts) {
  stopListening();
  opts = opts || {};
  game.online = !!opts.online;
  game.cat = cat;
  game.items = opts.items || buildQuestions(cat);
  game.idx = 0;
  game.elapsed = 0;
  game.total = opts.total !== undefined ? opts.total : parseInt($("opt-time").value, 10);
  const lvl = [...$("opt-time").options].find((o) => o.value === String(game.total)) || $("opt-time").selectedOptions[0];
  game.level = game.online ? "👥 Online" : lvl.textContent.split("·")[0].trim();
  $("btn-pause").classList.toggle("hidden", game.online);
  $("online-rank").classList.add("hidden");
  game.time = game.total;
  game.paused = false;
  game.over = false;
  game.busy = false;
  $("game-category").innerHTML = escapeHtml(cat.icon + " " + cat.name) + '<span class="level-badge">' + escapeHtml(game.level + (game.mode === "choice" ? " · Şıklı" : "")) + "</span>";
  document.querySelector(".panel").dataset.mode = game.mode;
  flash("", "");
  $("pause-overlay").classList.add("hidden");
  renderWheel();
  showScreen("game");
  updateTimer();
  clearInterval(game.timerId);
  game.timerId = setInterval(tick, 1000);
  showQuestion();
}

function tick() {
  if (game.paused || game.over) return;
  game.elapsed = (game.elapsed || 0) + 1;
  if (!game.total) return;
  game.time--;
  updateTimer();
  if (game.time <= 0) endGame("Süre doldu!");
}
function updateTimer() {
  const el = $("timer");
  const center = $("wheel-center");
  center.classList.toggle("free", !game.total);
  if (!game.total) { el.textContent = "∞"; el.classList.remove("low"); center.classList.remove("low"); return; }
  const t = Math.max(0, game.time);
  el.textContent = Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
  el.classList.toggle("low", t <= 15);
  center.classList.toggle("low", t <= 15);
  $("timer-ring").setAttribute("stroke-dashoffset", String(100 - (100 * t) / game.total));
}

function showQuestion() {
  const it = game.items[game.idx];
  game.turn++;
  game.busy = false;
  const rule = it.q.c ? "İçinde " + it.letter + " var" : "Baş harfi " + it.letter;
  const letterEl = $("current-letter");
  if (letterEl.textContent !== it.letter) { letterEl.textContent = it.letter; replay(letterEl, "flip"); }
  $("letter-rule").textContent = it.q.c ? "içinde var" : "baş harfi";
  $("question").innerHTML = '<span class="rule">' + escapeHtml(rule.toLocaleUpperCase("tr-TR") +
    (game.cat.id === MIXED.id ? " · " + it.q.cat : "")) + "</span>" + it.q.q.split(/\s+/).map((w, i) => '<span class="w" style="--i:' + i + '">' + escapeHtml(w) + "</span>").join(" ");
  $("answer").value = "";
  $("heard").textContent = "";
  renderChoices(it);
  paintBubbles();
  const token = game.turn;
  if (game.mode === "keyboard") setTimeout(() => { if (token === game.turn) $("answer").focus({ preventScroll: true }); }, 50);
  speakQuestion(it, () => {
    if (game.mode === "voice" && token === game.turn && !game.paused && !game.over) startListening();
  });
}

function submit(text) {
  if (game.over || game.paused || game.busy) return;
  const answer = (text ?? $("answer").value).trim();
  if (!answer) { $("answer").focus(); flash("Bir cevap yaz ya da söyle 🙂", "pas"); return; }
  if (isPassWord(answer)) return pass();
  stopListening();
  stopSpeaking();
  const it = game.items[game.idx];
  it.given = answer;
  const panel = document.querySelector(".panel");
  if (isCorrect(answer, it.q)) {
    it.status = "correct";
    beep("ok");
    sparks(game.idx, "#2ed69b");
    flash("✔ Doğru! " + it.q.a, "ok");
  } else {
    it.status = "wrong";
    beep("bad");
    flash("✘ Yanlış. Doğru cevap: " + it.q.a, "bad");
    panel.classList.remove("shake"); void panel.offsetWidth; panel.classList.add("shake");
  }
  advance(it.status === "correct" ? 900 : 1900);
}

function pass() {
  if (game.over || game.paused || game.busy) return;
  stopListening();
  stopSpeaking();
  game.items[game.idx].status = "passed";
  beep("pas");
  flash("↻ Pas! Sonra tekrar gelecek.", "pas");
  advance(600);
}

function advance(delay) {
  game.busy = true;
  paintBubbles();
  if (game.online) Online.report(false);
  setTimeout(() => {
    if (game.over) return;
    const next = findNext();
    if (next === -1) return endGame();
    game.idx = next;
    flash("", "");
    if (game.paused) { game.busy = false; return; }
    showQuestion();
  }, delay);
}
function findNext() {
  const n = game.items.length;
  for (let k = 1; k <= n; k++) {
    const i = (game.idx + k) % n;
    const s = game.items[i].status;
    if (s === "pending" || s === "passed") return i;
  }
  return -1;
}

function flash(msg, cls) {
  const f = $("feedback");
  f.textContent = msg;
  f.className = "feedback " + cls;
}

function setPaused(p) {
  if (game.over || (p && game.online)) return;
  game.paused = p;
  $("pause-overlay").classList.toggle("hidden", !p);
  if (p) { stopListening(); stopSpeaking(); }
}

function endGame(title) {
  if (game.over) return;
  game.over = true;
  clearInterval(game.timerId);
  stopListening();
  stopSpeaking();
  beep("end");
  const c = game.items.filter((i) => i.status === "correct").length;
  const w = game.items.filter((i) => i.status === "wrong").length;
  const e = game.items.length - c - w;
  $("result-title").textContent = c === game.items.length ? "🏆 Kusursuz! Tüm harfler doğru!" : (title || "Oyun bitti!");
  setTimeout(() => { countUp($("res-correct"), c); countUp($("res-wrong"), w); countUp($("res-empty"), e); }, 250);
  $("res-best").classList.remove("record");

  if (game.online) {
    // Online turda kişisel rekorlar değişmez; sıralama canlı gösterilir
    Online.report(true);
    $("res-best").textContent = "Sıralama aşağıda 👇";
    $("btn-again").textContent = "ODAYA DÖN";
    $("btn-menu").textContent = "ODADAN ÇIK";
    $("btn-result-lb").classList.add("hidden");
    renderResultList();
    showScreen("result");
    Online.renderRanking();
    return;
  }
  $("btn-again").textContent = "TEKRAR OYNA";
  $("btn-menu").textContent = "MENÜ";
  $("btn-result-lb").classList.remove("hidden");
  const p = getProfile();
  const sik = game.mode === "choice";
  const st = sik ? p.sik : p;
  st.games += 1; st.correct += c; st.answered += game.items.length;
  const tag = sik ? " · Şıklı" : "";
  const best = st.best[game.cat.id] || 0;
  if (c > best) {
    st.best[game.cat.id] = c;
    $("res-best").textContent = "🎉 Yeni rekor! (" + game.cat.name + " · " + game.level + tag + ")";
    $("res-best").classList.add("record");
    setTimeout(() => confetti(c === game.items.length ? 140 : 70), 400);
  }
  else $("res-best").textContent = "Rekorun: " + best + " doğru (" + game.cat.name + tag + ") · Seviye: " + game.level;
  saveProfile(p);
  if (!sik) Cloud.push(p);

  renderResultList();
  showScreen("result");
  renderMenu();
}
function renderResultList() {
  $("result-list").innerHTML = game.items.map((it, i) =>
    '<li class="' + it.status + '" style="--i:' + i + '"><div class="rl">' + it.letter + "</div><div>" +
    '<div class="rq">' + escapeHtml(it.q.q) + "</div>" +
    '<div class="ra">' + escapeHtml(it.q.a) + "</div>" +
    (it.status === "wrong" ? '<div class="ry">Senin cevabın: ' + escapeHtml(it.given) + "</div>" : "") +
    "</div></li>"
  ).join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

/* ================= EKRANLAR & MENÜ ================= */
function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $("screen-" + name).classList.add("active");
  window.scrollTo(0, 0);
  if (name === "game") fitWheel();
}

/* Çarkı, soru paneliyle birlikte ekrana kaydırmadan sığacak boyda çiz */
function fitWheel() {
  const scr = $("screen-game");
  if (!scr.classList.contains("active")) return;
  const layout = scr.querySelector(".game-layout");
  const panel = scr.querySelector(".panel");
  const cs = getComputedStyle(layout);
  const row = cs.flexDirection === "row";
  const H = window.innerHeight;
  const W = document.documentElement.clientWidth;
  const top = layout.offsetTop - scr.offsetTop; // üst boşluk + üst çubuk + canlı skor
  const bottom = parseFloat(getComputedStyle(scr).paddingBottom) || 0;
  const gap = parseFloat(cs.rowGap) || 0;
  let size;
  if (row) size = Math.min(H - top - bottom, W * 0.5, 620);
  else size = Math.min(H - top - bottom - gap - panel.offsetHeight, W - 24, 560);
  size = Math.max(140, Math.floor(size));
  scr.style.setProperty("--size", size + "px");
}
window.addEventListener("resize", fitWheel);
if (window.visualViewport) visualViewport.addEventListener("resize", fitWheel);
if (window.ResizeObserver) {
  const ro = new ResizeObserver(() => fitWheel());
  const pn = document.querySelector("#screen-game .panel");
  if (pn) { ro.observe(pn); ro.observe($("live-board")); }
}

function renderMenu() {
  const p = getProfile();
  paintAvatar($("chip-avatar"), p);
  $("chip-name").textContent = p.name;
  const grid = $("category-grid");
  grid.innerHTML = "";
  [...CATEGORIES, MIXED].forEach((cat, i) => {
    const btn = document.createElement("button");
    btn.className = "cat-card";
    btn.style.setProperty("--c", cat.color);
    btn.style.setProperty("--i", i);
    const best = p.best[cat.id] || 0;
    const sb = p.sik.best[cat.id] || 0;
    const recs = [best ? "🏆 " + best + "/" + LETTERS.length : "", sb ? "🔤 " + sb : ""].filter(Boolean).join(" · ");
    btn.innerHTML = '<span class="ico">' + cat.icon + '</span><span><div class="name">' + escapeHtml(cat.name) +
      '</div><div class="best">' + (recs || "Yeni") + "</div>" +
      '<div class="bar"><i style="--w:' + Math.round((100 * best) / LETTERS.length) + '%"></i></div></span>';
    btn.onclick = () => askMode(cat);
    grid.appendChild(btn);
  });
}

/* ---------- Oyundan önce: sesle mi klavyeyle mi? ---------- */
let modeCat = null;
const voiceSupported = () => !!SR && window.isSecureContext;
function askMode(cat) {
  modeCat = cat;
  $("mode-cat").textContent = cat.icon + " " + cat.name;
  $("mode-msg").textContent = voiceSupported() ? "" : "Bu tarayıcıda sesle cevap verilemiyor. Android'de Chrome, iPhone/iPad'de Safari kullan.";
  $("mode-voice").disabled = !voiceSupported();
  let last = store.get("answer-mode", "choice");
  if (last === "voice" && !voiceSupported()) last = "choice";
  ["choice", "voice", "keyboard"].forEach((m) => $("mode-" + m).classList.toggle("last", m === last));
  $("mode-pick").classList.remove("hidden");
  $("mode-" + last).focus({ preventScroll: true });
}
function closeMode() { $("mode-pick").classList.add("hidden"); }
async function chooseMode(mode) {
  if (!modeCat) return;
  if (mode === "voice") {
    // Mikrofon iznini şimdi (dokunuşla) iste; oyun sırasında otomatik açılabilsin
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const st = await navigator.mediaDevices.getUserMedia({ audio: true });
        st.getTracks().forEach((t) => t.stop());
      } catch (e) {
        $("mode-msg").textContent = "Mikrofon izni verilmedi. Tarayıcı ayarlarından izin ver ya da Klavyeyle oyna.";
        return;
      }
    }
  }
  store.set("answer-mode", mode);
  game.mode = mode;
  closeMode();
  startGame(modeCat);
}
$("mode-choice").addEventListener("click", () => chooseMode("choice"));
$("mode-voice").addEventListener("click", () => chooseMode("voice"));
$("mode-keyboard").addEventListener("click", () => chooseMode("keyboard"));
$("mode-cancel").addEventListener("click", closeMode);
$("mode-pick").addEventListener("click", (e) => { if (e.target === $("mode-pick")) closeMode(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("mode-pick").classList.contains("hidden")) closeMode(); });
// Şıklı modda klavyeden A/B/C ya da 1/2/3
document.addEventListener("keydown", (e) => {
  if (game.mode !== "choice" || game.over || game.paused || !$("mode-pick").classList.contains("hidden")) return;
  if (!$("screen-game").classList.contains("active") || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = { a: 0, b: 1, c: 2, "1": 0, "2": 1, "3": 2 }[e.key.toLowerCase()];
  if (k !== undefined) { e.preventDefault(); pickChoice(k); }
});

/* ---------- Arkadaşlarla oyna ---------- */
function openOnline(prefill) {
  const sel = $("on-cat");
  if (!sel.options.length) {
    [...CATEGORIES, MIXED].forEach((c) => { const o = document.createElement("option"); o.value = c.id; o.textContent = c.icon + " " + c.name; sel.appendChild(o); });
    sel.value = MIXED.id;
    $("on-time").innerHTML = $("opt-time").innerHTML;
    $("on-time").value = "180";
  }
  const ok = Online.canPlay();
  $("online-need-account").classList.toggle("hidden", ok);
  $("online-forms").classList.toggle("hidden", !ok);
  $("online-msg").textContent = "";
  if (prefill) $("on-code").value = prefill;
  showScreen("online");
}
async function onlineRun(btn, fn) {
  $("online-msg").textContent = "";
  btn.disabled = true;
  try { await fn(); } catch (e) { $("online-msg").textContent = e.message; }
  btn.disabled = false;
}
$("btn-online").addEventListener("click", () => openOnline());
$("btn-online-back").addEventListener("click", () => showScreen("menu"));
$("btn-online-login").addEventListener("click", async () => { await Auth.logout(); afterLogin(); });
document.querySelectorAll("#on-mode button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll("#on-mode button").forEach((x) => x.classList.toggle("sel", x === b));
}));
$("btn-create-room").addEventListener("click", (e) => onlineRun(e.currentTarget, () => {
  const mode = document.querySelector("#on-mode button.sel").dataset.mode;
  return Online.create($("on-cat").value, parseInt($("on-time").value, 10), mode);
}));
$("join-form").addEventListener("submit", (e) => { e.preventDefault(); onlineRun($("btn-join-room"), () => Online.join($("on-code").value)); });
$("on-code").addEventListener("input", (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5); });
$("btn-lobby-leave").addEventListener("click", async () => {
  if (!confirm(Online.isHost() ? "Odayı kapatıp çıkılsın mı?" : "Odadan çıkılsın mı?")) return;
  await Online.leave(); renderMenu(); showScreen("menu");
});
$("btn-lobby-share").addEventListener("click", () => Online.share());
$("btn-lobby-start").addEventListener("click", () => Online.start());

/* ---------- Logo: dönen mini harf çarkı ---------- */
function buildLogoWheels() {
  document.querySelectorAll(".logo-wheel").forEach((w) => {
    if (w.childElementCount) return;
    const ring = document.createElement("div"); ring.className = "lw-ring";
    const n = LETTERS.length;
    const marks = { 2: "g", 5: "g", 6: "r", 9: "g", 13: "b", 17: "g", 18: "g", 22: "r", 25: "g" };
    LETTERS.forEach((L, i) => {
      const a = (-90 + (360 / n) * i) * (Math.PI / 180);
      const b = document.createElement("span");
      b.className = "lw-b" + (marks[i] ? " " + marks[i] : "");
      b.style.left = 50 + 45 * Math.cos(a) + "%";
      b.style.top = 50 + 45 * Math.sin(a) + "%";
      b.style.setProperty("--i", i);
      const t = document.createElement("i"); t.textContent = L;
      b.appendChild(t);
      ring.appendChild(b);
    });
    const c = document.createElement("div"); c.className = "lw-center";
    const l = document.createElement("b"); l.textContent = "A";
    c.appendChild(l);
    w.append(ring, c);
  });
  if (reducedMotion()) return;
  let k = 0;
  setInterval(() => {
    if (document.hidden) return;
    k = (k + 1) % LETTERS.length;
    document.querySelectorAll(".screen.active .lw-center b").forEach((b) => { b.textContent = LETTERS[k]; replay(b, "flip"); });
  }, 1500);
}
buildLogoWheels();

/* ---------- Profil ekranı ---------- */
let pendingAvatar = null;
let pendingPhoto = "";
function paintProfileAvatar() {
  paintAvatar($("profile-avatar"), { avatar: pendingAvatar, photo: pendingPhoto });
  $("btn-photo-remove").classList.toggle("hidden", !pendingPhoto);
  $("btn-photo").textContent = pendingPhoto ? "📷 Fotoğrafı değiştir" : "📷 Fotoğraf ekle";
}
function openProfile() {
  const p = getProfile();
  const u = Auth.user;
  pendingAvatar = p.avatar;
  pendingPhoto = p.photo || "";
  $("photo-msg").textContent = "";
  paintProfileAvatar();
  $("profile-name").value = p.name;
  const how = { google: "Google hesabı", facebook: "Facebook hesabı", email: "E-posta hesabı", local: "Misafir · yalnızca bu cihazda" }[u.provider] || "";
  $("profile-account").textContent = how + (u.email ? " · " + u.email : "");
  const sync = $("profile-sync");
  if (Cloud.enabled()) {
    sync.textContent = Cloud.status === "error" ? "⚠ Hesaba kaydedilemedi, internet bağlantını kontrol et" : "☁ Rekorların hesabına kaydediliyor · Adın ve avatarın liderlik tablosunda görünür";
    sync.className = "profile-sync" + (Cloud.status === "error" ? " local" : "");
  } else {
    sync.textContent = "Misafir rekorları yalnızca bu cihazda tutulur ve liderlik tablosuna girmez.";
    sync.className = "profile-sync local";
  }
  $("btn-logout").textContent = u.provider === "local" ? "PROFİLİ SİL" : "ÇIKIŞ";
  $("avatar-grid").innerHTML = "";
  AVATARS.forEach((a) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = a;
    if (a === pendingAvatar) b.classList.add("sel");
    b.onclick = () => {
      pendingAvatar = a; pendingPhoto = ""; paintProfileAvatar();
      $("avatar-grid").querySelectorAll("button").forEach((x) => x.classList.toggle("sel", x === b));
    };
    $("avatar-grid").appendChild(b);
  });
  $("st-games").textContent = p.games;
  $("st-correct").textContent = p.correct;
  $("st-rate").textContent = "%" + (p.answered ? Math.round((p.correct / p.answered) * 100) : 0);
  const rows = [...CATEGORIES, MIXED].filter((c) => p.best[c.id]).map((c) =>
    "<li><span>" + c.icon + " " + escapeHtml(c.name) + "</span><b>" + p.best[c.id] + "/" + LETTERS.length + "</b></li>").concat(
    [...CATEGORIES, MIXED].filter((c) => p.sik.best[c.id]).map((c) =>
    "<li><span>" + c.icon + " " + escapeHtml(c.name) + " · Şıklı</span><b>" + p.sik.best[c.id] + "/" + LETTERS.length + "</b></li>"));
  $("st-best").innerHTML = rows.length ? rows.join("") : '<li><span>Henüz rekor yok. Hadi bir oyun oyna!</span></li>';
  showScreen("profile");
}

/* ---------- Giriş ekranı ---------- */
let registerMode = false;
function setAuthMsg(msg, cls) { const m = $("auth-msg"); m.textContent = msg; m.className = "auth-msg " + (cls || ""); }
function setupLoginScreen() {
  const on = Auth.enabled;
  const prov = window.AUTH_PROVIDERS || { email: true, google: true, facebook: true };
  $("btn-google").classList.toggle("hidden", on && !prov.google);
  $("btn-facebook").classList.toggle("hidden", on && !prov.facebook);
  $("btn-google").disabled = !on;
  $("btn-facebook").disabled = !on;
  $("email-form").classList.toggle("disabled", !on);
  $("auth-setup-note").classList.toggle("hidden", on);
  const anySocial = on && (prov.google || prov.facebook);
  document.querySelector("#screen-login .auth-card .divider").classList.toggle("hidden", on && !anySocial);
}
function toggleRegister(force) {
  registerMode = force ?? !registerMode;
  document.querySelectorAll(".only-register").forEach((el) => el.classList.toggle("hidden", !registerMode));
  $("btn-email").textContent = registerMode ? "HESAP AÇ" : "GİRİŞ YAP";
  $("btn-toggle-register").innerHTML = registerMode ? "Zaten hesabın var mı? <b>Giriş yap</b>" : "Hesabın yok mu? <b>Hesap aç</b>";
  $("password").autocomplete = registerMode ? "new-password" : "current-password";
  setAuthMsg("");
}
async function runAuth(fn) {
  setAuthMsg("Bekleyin…");
  try { const u = await fn(); if (u) { setAuthMsg(""); afterLogin(); } }
  catch (e) { setAuthMsg(e.message, "bad"); }
}
function afterLogin() {
  const u = Auth.user;
  if (!u) { setupLoginScreen(); showScreen("login"); return; }
  const p = getProfile();
  if (!store.get(profileKey(), null)) saveProfile(p); // ilk girişte profil oluştur
  renderMenu();
  showScreen("menu");
  Cloud.pull().then(renderMenu);
  const invite = new URLSearchParams(location.search).get("oda");
  if (invite) {
    history.replaceState(null, "", location.pathname);
    openOnline(invite.toUpperCase().slice(0, 5));
    if (Online.canPlay()) onlineRun($("btn-join-room"), () => Online.join(invite));
  }
}

/* ---------- Liderlik tablosu ---------- */
let lbTab = "toplam";
let lbToken = 0;
function lbTabs() {
  return [{ id: "toplam", name: "⭐ Toplam doğru" }, ...CATEGORIES.map((c) => ({ id: c.id, name: c.icon + " " + c.name })), { id: MIXED.id, name: MIXED.icon + " " + MIXED.name }];
}
function openLeaderboard(tab) {
  if (tab) lbTab = tab;
  const wrap = $("lb-tabs");
  wrap.innerHTML = "";
  lbTabs().forEach((t) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = t.name; b.setAttribute("role", "tab");
    if (t.id === lbTab) { b.classList.add("sel"); b.setAttribute("aria-selected", "true"); }
    b.onclick = () => openLeaderboard(t.id);
    wrap.appendChild(b);
  });
  showScreen("leaderboard");
  const sel = wrap.querySelector(".sel"); if (sel) sel.scrollIntoView({ inline: "center", block: "nearest" });
  loadLeaderboard();
}
async function loadLeaderboard() {
  const list = $("lb-list");
  const myToken = ++lbToken;
  $("lb-caption").textContent = lbTab === "toplam" ? "Bütün oyunlarda bilinen toplam doğru sayısı" : "Bu kategoride tek oyunda en çok doğru (28 üzerinden)";
  const guest = !Auth.user || Auth.user.provider === "local";
  $("lb-note").textContent = guest ? "Misafirler tabloda görünmez. Tabloya girmek için profilinden çıkıp e-posta ile hesap aç." : "";
  if (!Auth.db) {
    list.innerHTML = '<li class="empty">Liderlik tablosu şu an kullanılamıyor.</li>';
    return;
  }
  list.innerHTML = '<li class="empty">Yükleniyor…</li>';
  const field = lbTab === "toplam" ? "correct" : "best." + lbTab;
  try {
    const snap = await Auth.db.collection("users").orderBy(field, "desc").limit(20).get();
    if (myToken !== lbToken) return;
    const myId = Auth.user && Auth.user.uid;
    const rows = [];
    snap.forEach((doc) => {
      const d = doc.data();
      const score = lbTab === "toplam" ? d.correct : (d.best || {})[lbTab];
      if (!score) return;
      rows.push({ id: doc.id, name: d.name, avatar: d.avatar, photo: d.photo, score, games: d.games });
    });
    list.innerHTML = "";
    if (!rows.length) { list.innerHTML = '<li class="empty">Henüz kimse yok. İlk sen ol! 🚀</li>'; return; }
    const medals = ["🥇", "🥈", "🥉"];
    rows.forEach((r, i) => {
      const li = document.createElement("li");
      if (r.id === myId) li.classList.add("me");
      const rank = document.createElement("span"); rank.className = "lb-rank"; rank.textContent = medals[i] || String(i + 1);
      const ava = document.createElement("span"); ava.className = "lb-ava"; paintAvatar(ava, r);
      const name = document.createElement("span"); name.className = "lb-name";
      name.textContent = (r.name || "Oyuncu") + (r.id === myId ? " (sen)" : "");
      const small = document.createElement("small"); small.textContent = (r.games || 0) + " oyun"; name.appendChild(small);
      const score = document.createElement("span"); score.className = "lb-score"; score.textContent = r.score;
      li.append(rank, ava, name, score);
      list.appendChild(li);
    });
    if (myId && !guest && !rows.some((r) => r.id === myId)) {
      const p = getProfile();
      const mine = lbTab === "toplam" ? p.correct : (p.best[lbTab] || 0);
      $("lb-note").textContent = "İlk 20'de değilsin. Senin skorun: " + mine;
    }
  } catch (e) {
    console.warn(e);
    if (myToken === lbToken) list.innerHTML = '<li class="empty">Tablo yüklenemedi. İnternet bağlantını kontrol edip ↻ ile yenile.</li>';
  }
}

/* ---------- Ayarlar ---------- */
function rateLabel(v) { v = parseFloat(v); return v < 0.88 ? "Yavaş" : v > 1.08 ? "Hızlı" : "Normal"; }
function initSettings() {
  ["opt-time", "opt-tts", "opt-rate"].forEach((id) => {
    const el = $(id);
    const saved = store.get(id, null);
    if (saved !== null) el.type === "checkbox" ? (el.checked = saved) : (el.value = saved);
    el.addEventListener("change", () => store.set(id, el.type === "checkbox" ? el.checked : el.value));
  });
  $("rate-label").textContent = rateLabel($("opt-rate").value);
  paintTimeChip();
  $("opt-rate").addEventListener("input", () => { $("rate-label").textContent = rateLabel($("opt-rate").value); });
  $("opt-voice").addEventListener("change", () => { store.set("opt-voice", $("opt-voice").value); loadVoices(); testVoice(); });
  $("btn-voice-test").addEventListener("click", testVoice);
  if (!synth) $("voice-row").classList.add("hidden");
  loadStudio();

  if (!SR) {
    $("btn-mic").classList.add("hidden");
    const w = $("voice-warning");
    w.textContent = "Bu tarayıcı sesli cevabı desteklemiyor. Sesli oynamak için Android'de Chrome, iPhone/iPad'de Safari kullanın.";
    w.classList.remove("hidden");
  } else if (!window.isSecureContext) {
    const w = $("voice-warning");
    w.textContent = "Sesli cevap için oyun https:// adresinden açılmalı.";
    w.classList.remove("hidden");
  }
}
function testVoice() {
  const was = $("opt-tts").checked;
  $("opt-tts").checked = true;
  const q = CATEGORIES[0].questions[0];
  speak(questionSpeech({ q, letter: q.l }), null, clipText(q, q.l));
  $("opt-tts").checked = was;
}

/* ================= OLAYLAR ================= */
$("answer-form").addEventListener("submit", (e) => { e.preventDefault(); submit(); });
$("btn-submit").addEventListener("click", () => submit());
$("btn-pass").addEventListener("click", () => pass());
$("btn-mic").addEventListener("click", () => { if (listening) stopListening(); else { stopSpeaking(); startListening(); } });
$("btn-repeat").addEventListener("click", () => { const it = game.items[game.idx]; if (it && !game.over) speakQuestion(it); });
$("btn-pause").addEventListener("click", () => setPaused(true));
$("btn-resume").addEventListener("click", () => { setPaused(false); if (!game.busy) showQuestion(); });
$("btn-quit").addEventListener("click", () => {
  if (game.online) {
    if (!game.over && !confirm("Turu bitirip odaya dönülsün mü?")) return;
    if (!game.over) endGame("Turu bitirdin");
    Online.backToLobby();
    return;
  }
  if (!game.over && !confirm("Oyundan çıkılsın mı?")) return;
  game.over = true; clearInterval(game.timerId); stopListening(); stopSpeaking();
  showScreen("menu");
});
$("btn-again").addEventListener("click", () => game.online && Online.active() ? Online.backToLobby() : askMode(game.cat));
$("btn-menu").addEventListener("click", async () => {
  if (game.online && Online.active()) { await Online.leave(); game.online = false; }
  renderMenu();
  showScreen("menu");
});
$("btn-howto").addEventListener("click", () => $("howto").classList.remove("hidden"));
function paintTimeChip() {
  const v = +$("opt-time").value;
  $("time-chip-label").textContent = v ? (v % 60 ? v + " sn" : v / 60 + " dk") : "Süresiz";
}
const openSettings = () => $("settings-overlay").classList.remove("hidden");
$("btn-settings").addEventListener("click", openSettings);
$("btn-time-chip").addEventListener("click", openSettings);
$("btn-settings-close").addEventListener("click", () => $("settings-overlay").classList.add("hidden"));
$("settings-overlay").addEventListener("click", (e) => { if (e.target.id === "settings-overlay") $("settings-overlay").classList.add("hidden"); });
$("opt-time").addEventListener("change", paintTimeChip);
const THEME_BG = { sahne: "#0a0c18", kagit: "#f5f2eb", sakin: "#f8f9fa", gece: "#121213" };
function applyTheme(t) {
  if (!THEME_BG[t]) t = "sahne";
  if (t === "sahne") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]').setAttribute("content", THEME_BG[t]);
  document.querySelectorAll("#theme-pick button").forEach((b) => {
    const on = b.dataset.theme === t;
    b.classList.toggle("sel", on); b.setAttribute("aria-checked", on);
  });
}
document.querySelectorAll("#theme-pick button").forEach((b) => {
  b.setAttribute("role", "radio");
  b.addEventListener("click", () => { store.set("theme", b.dataset.theme); applyTheme(b.dataset.theme); });
});
applyTheme(store.get("theme", "sahne"));
paintTimeChip();
$("btn-howto-close").addEventListener("click", () => $("howto").classList.add("hidden"));
document.addEventListener("visibilitychange", () => { if (document.hidden && !game.over && !game.paused && !game.online) setPaused(true); });

// Liderlik
$("btn-leaderboard").addEventListener("click", () => openLeaderboard());
$("btn-result-lb").addEventListener("click", () => openLeaderboard(game.cat ? game.cat.id : "toplam"));
$("btn-lb-back").addEventListener("click", () => showScreen("menu"));
$("btn-lb-refresh").addEventListener("click", loadLeaderboard);

// Profil
$("btn-profile").addEventListener("click", openProfile);
$("btn-profile-back").addEventListener("click", () => showScreen("menu"));
$("btn-photo").addEventListener("click", () => $("photo-input").click());
$("profile-avatar").addEventListener("click", () => $("photo-input").click());
$("photo-input").addEventListener("change", async (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!f) return;
  $("photo-msg").textContent = "Hazırlanıyor…";
  try { pendingPhoto = await photoFromFile(f); $("photo-msg").textContent = "Beğendiysen KAYDET'e bas."; paintProfileAvatar(); }
  catch (err) { $("photo-msg").textContent = err.message; }
});
$("btn-photo-remove").addEventListener("click", () => { pendingPhoto = ""; $("photo-msg").textContent = ""; paintProfileAvatar(); });
$("btn-profile-save").addEventListener("click", () => {
  const p = getProfile();
  p.name = $("profile-name").value.trim().slice(0, 20) || p.name;
  p.avatar = pendingAvatar || p.avatar;
  p.photo = pendingPhoto || "";
  saveProfile(p);
  Cloud.push(p);
  renderMenu();
  showScreen("menu");
});
$("btn-logout").addEventListener("click", async () => {
  const local = Auth.user && Auth.user.provider === "local";
  if (!confirm(local ? "Misafir profilin ve bu cihazdaki istatistiklerin silinecek. Emin misin?" : "Çıkış yapılsın mı?")) return;
  if (local) { try { localStorage.removeItem("harfcarki." + profileKey()); } catch {} }
  await Auth.logout();
  toggleRegister(false);
  afterLogin();
});

// Giriş
$("btn-google").addEventListener("click", () => runAuth(() => Auth.social("google")));
$("btn-facebook").addEventListener("click", () => runAuth(() => Auth.social("facebook")));
$("btn-toggle-register").addEventListener("click", () => toggleRegister());
$("email-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = $("email").value.trim(), pass = $("password").value;
  runAuth(() => registerMode ? Auth.emailRegister($("reg-name").value.trim(), email, pass) : Auth.emailLogin(email, pass));
});
$("btn-forgot").addEventListener("click", async () => {
  const email = $("email").value.trim();
  if (!email) return setAuthMsg("Önce e-posta adresini yaz.", "bad");
  try { await Auth.resetPassword(email); setAuthMsg("Şifre sıfırlama bağlantısı e-postana gönderildi.", "ok"); }
  catch (e) { setAuthMsg(e.message, "bad"); }
});
$("btn-guest").addEventListener("click", () => {
  const name = (prompt("Adın ne? (Profilde görünecek)", "Misafir") || "").trim().slice(0, 20) || "Misafir";
  Auth.guest(name);
  const p = getProfile(); p.name = name; saveProfile(p);
  afterLogin();
});
Auth.onChange(() => { if (!document.querySelector("#screen-game.active")) afterLogin(); });

/* ================= BAŞLAT ================= */
initSettings();
Auth.init().then(afterLogin);

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
