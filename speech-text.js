"use strict";
// Sesli okunacak metin. Hem oyun (tarayıcı) hem de tools/seslendir.mjs (ElevenLabs) bu dosyayı kullanır;
// böylece hazır ses dosyası ile oyundaki soru metni her zaman birebir eşleşir.

// Harflerin Türkçe okunuşu ("Baş harfi be" gibi doğru telaffuz için)
const LETTER_SAY = { A:"a", B:"be", C:"ce", "Ç":"çe", D:"de", E:"e", F:"fe", G:"ge", H:"he", I:"ı", "İ":"i", J:"je", K:"ke", L:"le", M:"me", N:"ne", O:"o", "Ö":"ö", P:"pe", R:"re", S:"se", "Ş":"şe", T:"te", U:"u", "Ü":"ü", V:"ve", Y:"ye", Z:"ze" };

// Ekranda okunacak metni konuşmaya uygun hâle getir
function speechText(t) {
  return String(t)
    .replace(/\s*\.\.\.\s*/g, ", ")
    .replace(/['’‘"“”]/g, "")
    .replace(/(\d)\s*km\b/g, "$1 kilometre")
    .replace(/\s+,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

// Sorudan sonra okunan ipucu: "Baş harfi a." / "İçinde a harfi var."
function letterHint(q, letter) {
  const say = LETTER_SAY[letter] || letter;
  return q.c ? `İçinde ${say} harfi var.` : `Baş harfi ${say}.`;
}

// Hazır ses dosyasının anahtarı: soru + ipucu, tek cümle dizisi
function clipText(q, letter) {
  let t = speechText(q.s || q.q);
  if (!/[.!?]$/.test(t)) t += ".";
  return t + " " + letterHint(q, letter);
}

if (typeof module !== "undefined") module.exports = { LETTER_SAY, speechText, letterHint, clipText };
