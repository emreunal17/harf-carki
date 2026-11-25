// Harf Çarkı — soruları önceden seslendirip audio/ klasörüne koyar.
//
// Varsayılan: Microsoft'un ücretsiz Türkçe doğal sesi (Edge "Natural" sesleri, edge-tts aracıyla).
//   python -m pip install --user edge-tts      # bir kez
//   node tools/seslendir.mjs                    # hepsini üret (Ahmet)
//   node tools/seslendir.mjs --voice tr-TR-EmelNeural --voice-name Emel   # kadın ses
//
// ElevenLabs (Creator ya da üstü paket gerekir; anahtarı betik sorar):
//   node tools/seslendir.mjs --engine elevenlabs --limit 3
//
// Diğer seçenekler: --limit <n>  --dry  --model <ElevenLabs model_id>  --rate <-10% gibi, Microsoft>
// Var olan dosyalar atlanır; yarıda kalırsa tekrar çalıştırmak kaldığı yerden devam eder.
// Soru metni değişirse yalnızca o soru yeniden seslendirilir.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "audio");
const MANIFEST = path.join(OUT, "manifest.json");

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : def; };
const DRY = args.includes("--dry");
const ENGINE = opt("engine", "microsoft"); // microsoft | elevenlabs
const MS = ENGINE !== "elevenlabs";
const VOICE = opt("voice", MS ? "tr-TR-AhmetNeural" : "jXQQtt6VqErg2FxVySNR"); // Ahmet / Oğuz Delioğlu
const KNOWN = { "tr-TR-EmelNeural": "Emel", "tr-TR-AhmetNeural": "Ahmet", jXQQtt6VqErg2FxVySNR: "Oğuz" };
const VOICE_NAME = opt("voice-name", KNOWN[VOICE] || "Doğal ses");
const RATE = opt("rate", "-5%");
let MODEL = MS ? "edge-tts" : opt("model", "eleven_v4");
const FALLBACK_MODEL = "eleven_multilingual_v2";
const LIMIT = parseInt(opt("limit", "0"), 10) || Infinity;
let KEY = process.env.ELEVENLABS_API_KEY;

// Oyunun kendi dosyalarını yükle (aynı metin fonksiyonları)
const ctx = vm.createContext({ module: undefined });
for (const f of ["speech-text.js", "questions.js", "questions-extra.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
}
vm.runInContext("this.__x = { CATEGORIES, clipText };", ctx);
const { CATEGORIES, clipText } = ctx.__x;

// Tüm soruların okunacak metni (aynı metin iki kez geçerse bir kez üretilir)
const texts = [...new Set(CATEGORIES.flatMap((c) => c.questions.map((q) => clipText(q, q.l))))];
const fileFor = (t) => crypto.createHash("sha1").update(VOICE + "|" + t).digest("hex").slice(0, 12) + ".mp3";
const exists = (t) => fs.existsSync(path.join(OUT, fileFor(t)));

const todo = texts.filter((t) => !exists(t));
const chars = todo.reduce((n, t) => n + t.length, 0);
console.log(`Toplam ${texts.length} ses · hazır ${texts.length - todo.length} · üretilecek ${todo.length} (${chars} karakter)`);
console.log(`Ses: ${VOICE_NAME} (${VOICE}) · ${MS ? "Microsoft (ücretsiz)" : "ElevenLabs · Model: " + MODEL}`);

function writeManifest() {
  const clips = {};
  texts.forEach((t) => { if (exists(t)) clips[t] = fileFor(t); });
  fs.writeFileSync(MANIFEST, JSON.stringify({ voice: VOICE, voiceName: VOICE_NAME, model: MODEL, clips }, null, 1));
  return Object.keys(clips).length;
}

if (DRY) {
  fs.mkdirSync(OUT, { recursive: true });
  if (fs.existsSync(MANIFEST) || texts.some(exists)) writeManifest();
  console.log("--dry: hiçbir şey üretilmedi, kredi harcanmadı.");
  process.exit(0);
}
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Microsoft (edge-tts) ----
async function msTts(text) {
  const { execFile } = await import("node:child_process");
  const tmp = path.join(OUT, "_tmp_" + crypto.randomBytes(4).toString("hex") + ".mp3");
  const py = process.env.PYTHON || "python";
  for (let attempt = 1; ; attempt++) {
    try {
      await new Promise((res, rej) => execFile(py, ["-m", "edge_tts", "--voice", VOICE, "--rate=" + RATE, "--text", text, "--write-media", tmp],
        { timeout: 60000, windowsHide: true }, (err, _o, stderr) => (err ? rej(new Error((stderr || err.message).trim().split(/\r?\n/).pop())) : res())));
      const buf = fs.readFileSync(tmp);
      fs.unlinkSync(tmp);
      if (buf.length < 1000) throw new Error("boş ses dosyası");
      return buf;
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch {}
      if (/No module named/i.test(e.message)) throw Object.assign(new Error("edge-tts kurulu değil: python -m pip install --user edge-tts"), { fatal: true });
      if (attempt >= 4) throw e;
      await sleep(1500 * attempt);
    }
  }
}
// Anahtar geçerli görünmüyorsa (boş, "anahtarınız", "sk_..." gibi) kullanıcıdan iste
const validKey = (k) => typeof k === "string" && /^sk_[A-Za-z0-9]{20,}$/.test(k.trim());
async function askKey() {
  const readline = await import("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const answer = await new Promise((res) => rl.question("\nElevenLabs API anahtarını buraya yapıştırıp Enter'a bas: ", res));
  rl.close();
  // Yapıştırırken araya giren boşluk/tırnak gibi fazlalıkları at
  return (answer.match(/sk_[A-Za-z0-9]+/) || [answer.trim()])[0];
}
if (!MS && !validKey(KEY)) {
  KEY = await askKey();
  if (!validKey(KEY)) {
    console.error("\nBu bir ElevenLabs anahtarına benzemiyor (sk_ ile başlamalı). Tekrar dene.\n");
    process.exit(1);
  }
}
if (!MS) KEY = KEY.trim();

async function tts(text) {
  if (MS) return msTts(text);
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: MODEL }),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const body = await res.text();
    // Model adı tanınmazsa bir kez yaygın çok dilli modele geç (hatalı istek ücretlendirilmez)
    if ((res.status === 400 || res.status === 422) && /model/i.test(body) && MODEL !== FALLBACK_MODEL) {
      console.warn(`Model "${MODEL}" kabul edilmedi, "${FALLBACK_MODEL}" ile devam ediliyor.`);
      MODEL = FALLBACK_MODEL;
      continue;
    }
    if (res.status === 401) throw Object.assign(new Error("API anahtarı geçersiz ya da metin-okuma izni yok."), { fatal: true });
    if (/quota|credit/i.test(body)) throw Object.assign(new Error("ElevenLabs krediniz bitti."), { fatal: true });
    if ((res.status === 429 || res.status >= 500) && attempt < 5) { await sleep(2000 * attempt); continue; }
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
}

const queue = todo.slice(0, LIMIT);
let done = 0, failed = 0, stop = false;
async function worker() {
  while (queue.length && !stop) {
    const text = queue.shift();
    try {
      const mp3 = await tts(text);
      fs.writeFileSync(path.join(OUT, fileFor(text)), mp3);
      done++;
      process.stdout.write(`\r${done}/${Math.min(todo.length, LIMIT)} hazır   `);
    } catch (e) {
      failed++;
      console.error(`\nHata: "${text.slice(0, 50)}…" → ${e.message}`);
      if (e.fatal) stop = true;
    }
  }
}
await Promise.all(Array.from({ length: MS ? 8 : 3 }, worker));
const total = writeManifest();
console.log(`\nBitti: ${done} yeni ses${failed ? `, ${failed} hata` : ""}. Oyunda ${total}/${texts.length} soru doğal sesle okunacak.`);
const unused = fs.readdirSync(OUT).filter((f) => f.endsWith(".mp3") && !Object.values(JSON.parse(fs.readFileSync(MANIFEST, "utf8")).clips).includes(f));
if (unused.length) console.log(`Not: audio/ içinde artık kullanılmayan ${unused.length} eski ses dosyası var (silinebilir).`);
console.log("audio/ klasörü güncellendi. Yayına almak için Claude'a 'sesler hazır' demeniz yeterli.");
