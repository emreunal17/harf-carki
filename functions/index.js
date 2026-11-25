"use strict";
// Harf Çarkı — Google Play satın alma doğrulaması
// Uygulama, satın almadan sonra verifyPurchase'ı çağırır. Fonksiyon:
//   1) Satın alma jetonunu Google Play Developer API ile doğrular (ödendi mi, bu uygulamaya mı ait),
//   2) Aynı jeton daha önce işlendiyse tekrar joker vermez,
//   3) Jokerleri wallets/{uid} kaydına ekler (istemci buraya ekleme yapamaz, yalnızca 1'er düşebilir).

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { google } = require("googleapis");
const crypto = require("crypto");

initializeApp();
const db = getFirestore();

// Play Console'daki uygulama paket adı
const PACKAGE_NAME = "io.github.emreunal17.harfcarki";

// Ürün → verilecek jokerler (store.js'teki PRODUCTS ile aynı olmalı)
const PRODUCTS = {
  joker_baslangic: { half: 10, hint: 10, starter: true },
  joker_15: { half: 7, hint: 8 },
  joker_40: { half: 20, hint: 20 },
  joker_100: { half: 50, hint: 50 },
};

let publisher = null;
async function androidPublisher() {
  if (!publisher) {
    const auth = new google.auth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/androidpublisher"] });
    publisher = google.androidpublisher({ version: "v3", auth: await auth.getClient() });
  }
  return publisher;
}

exports.verifyPurchase = onCall({ region: "europe-west1" }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Giriş yapmalısın.");
  const uid = req.auth.uid;
  const { productId, purchaseToken } = req.data || {};
  const prod = PRODUCTS[productId];
  if (!prod || typeof purchaseToken !== "string" || purchaseToken.length < 10 || purchaseToken.length > 4096) {
    throw new HttpsError("invalid-argument", "Geçersiz satın alma.");
  }

  // 1) Google Play'e sor
  let p;
  try {
    const api = await androidPublisher();
    const r = await api.purchases.products.get({ packageName: PACKAGE_NAME, productId, token: purchaseToken });
    p = r.data;
  } catch (e) {
    console.error("Play doğrulama hatası", e.message);
    throw new HttpsError("failed-precondition", "Satın alma Google Play'de doğrulanamadı.");
  }
  if (p.purchaseState !== 0) throw new HttpsError("failed-precondition", "Ödeme henüz tamamlanmamış.");

  // 2) + 3) Aynı jeton bir kez işlenir; jokerler cüzdana eklenir
  const id = crypto.createHash("sha256").update(purchaseToken).digest("hex");
  const purchaseRef = db.collection("purchases").doc(id);
  const walletRef = db.collection("wallets").doc(uid);
  const res = await db.runTransaction(async (t) => {
    const done = await t.get(purchaseRef);
    if (done.exists) {
      const d = done.data();
      if (d.uid !== uid) throw new HttpsError("permission-denied", "Bu satın alma başka bir hesaba ait.");
      return { half: d.half, hint: d.hint, already: true };
    }
    t.set(purchaseRef, {
      uid, productId, orderId: p.orderId || "", half: prod.half, hint: prod.hint,
      purchaseTime: Number(p.purchaseTimeMillis) || 0, createdAt: FieldValue.serverTimestamp(),
    });
    t.set(walletRef, {
      half: FieldValue.increment(prod.half), hint: FieldValue.increment(prod.hint),
      ...(prod.starter ? { starter: true } : {}), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { half: prod.half, hint: prod.hint, already: false };
  });
  return res;
});
