// Harf Çarkı — ElevenLabs hesabındaki KENDİ sesinle 3 örnek soru üretir (ornek-sesler/ klasörüne).
// Oyunun audio/ klasörüne dokunmaz. Kullanım:  node tools/kendi-sesim.mjs

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "ornek-sesler");
const API = "https://api.elevenlabs.io/v1";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

let key = process.env.ELEVENLABS_API_KEY || "";
if (!/^sk_[A-Za-z0-9]{20,}$/.test(key.trim())) {
  const a = await ask("\nElevenLabs API anahtarını buraya yapıştırıp Enter'a bas: ");
  key = (a.match(/sk_[A-Za-z0-9]+/) || [""])[0];
}
if (!key) { console.log("\nAnahtar bulunamadı (sk_ ile başlamalı)."); process.exit(1); }
const H = { "xi-api-key": key.trim() };

async function get(p) {
  const r = await fetch(API + p, { headers: H });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// Paket ve kalan karakter hakkı
try {
  const s = await get("/user/subscription");
  const left = (s.character_limit || 0) - (s.character_count || 0);
  console.log(`\nPaket: ${s.tier} · bu ay kalan hak: ${left} karakter (hepsi için yaklaşık 40.000 gerekir)`);
} catch (e) {
  console.log("\n(Paket bilgisi okunamadı: " + e.message + ")");
}

// Hesaptaki kendi sesleri (hazır ElevenLabs sesleri hariç).
// Anahtarın ses listeleme izni yoksa ses kimliğini (Voice ID) kullanıcıdan iste.
let voice = null;
try {
  const { voices = [] } = await get("/voices");
  const own = voices.filter((v) => v.category && v.category !== "premade");
  if (own.length) {
    console.log("\nHesabındaki kendi seslerin:");
    own.forEach((v, i) => console.log(`  ${i + 1}) ${v.name}  [${v.category}]`));
    let pick = 0;
    if (own.length > 1) {
      const a = await ask("\nHangisi? Numarasını yazıp Enter'a bas: ");
      pick = Math.max(0, Math.min(own.length - 1, parseInt(a, 10) - 1 || 0));
    }
    voice = own[pick];
  }
} catch (e) {
  console.log("\n(Anahtarın ses listeleme izni yok, sorun değil.)");
}
if (!voice) {
  console.log("\nElevenLabs'te: Voices → My Voices → kendi sesinin yanındaki ⋯ menüsü → \"Copy voice ID\".");
  const a = await ask("Kopyaladığın ses kimliğini (Voice ID) buraya yapıştırıp Enter'a bas: ");
  const id = (a.match(/[A-Za-z0-9]{15,}/) || [""])[0];
  if (!id) { console.log("Ses kimliği bulunamadı."); process.exit(1); }
  voice = { voice_id: id, name: "Kendi sesim" };
}
rl.close();
console.log(`\nSeçilen ses: ${voice.name} (${voice.voice_id})`);

const samples = [
  "Türkiye Cumhuriyetinin başkenti. Baş harfi a.",
  "Arıların çiçek nektarından ürettiği tatlı besin. Baş harfi be.",
  "Haftanın beşinci günü. Baş harfi ce.",
];
fs.mkdirSync(OUT, { recursive: true });
let ok = 0;
for (const [i, text] of samples.entries()) {
  for (const model of ["eleven_v4", "eleven_multilingual_v2"]) {
    const r = await fetch(`${API}/text-to-speech/${voice.voice_id}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { ...H, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: model }),
    });
    if (r.ok) {
      const file = path.join(OUT, `kendi-sesim-${i + 1}.mp3`);
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      console.log(`✓ ${path.basename(file)}  (${text})`);
      ok++;
      break;
    }
    const body = await r.text();
    if (/model/i.test(body) && model === "eleven_v4") continue; // diğer modelle dene
    console.log(`✗ Hata: ${body.slice(0, 220)}`);
    process.exit(1);
  }
}
fs.writeFileSync(path.join(OUT, "kendi-sesim.json"), JSON.stringify({ voice_id: voice.voice_id, name: voice.name }, null, 1));
console.log(`\nBitti: ${ok} örnek ses ornek-sesler klasöründe. Claude'a "bitti" yaz.`);
