"use strict";
// JOKER MAĞAZASI (Google Play Faturalandırma) ve HESABA BAĞLI JOKER CÜZDANI
// - Ödeme yalnızca Google Play uygulamasında (TWA) çalışır: Digital Goods API + Payment Request API.
// - Satın alma sunucuda doğrulanır (functions/index.js → verifyPurchase), jokerler wallets/{uid} kaydına eklenir.
// - İstemci cüzdandan yalnızca 1'er 1'er düşebilir (Firestore kuralları); ekleme yalnızca sunucudan.

const PLAY_BILLING = "https://play.google.com/billing";
const FUNCTIONS_REGION = "europe-west1";
// Ürün kimlikleri Play Console'da aynı adla tanımlanmalı (fiyatlar Play Console'dan gelir)
const PRODUCTS = [
  { id: "joker_baslangic", name: "Başlangıç paketi", half: 10, hint: 10, tag: "Tek seferlik", once: true, fallback: "24,99 TL" },
  { id: "joker_15", name: "Küçük paket", half: 7, hint: 8, tag: "", fallback: "29,99 TL" },
  { id: "joker_40", name: "Orta paket", half: 20, hint: 20, tag: "En popüler", fallback: "59,99 TL" },
  { id: "joker_100", name: "Büyük paket", half: 50, hint: 50, tag: "En avantajlı", fallback: "119,99 TL" },
];

/* ================= CÜZDAN (Firestore: wallets/{uid}) ================= */
const Wallet = (() => {
  let data = { half: 0, hint: 0, starter: false };
  let unsub = null, uid = null;
  function watch() {
    const want = Cloud.enabled() ? Auth.user.uid : null;
    if (want === uid) return;
    if (unsub) unsub();
    unsub = null; uid = want; data = { half: 0, hint: 0, starter: false };
    if (!uid) return;
    unsub = Auth.db.collection("wallets").doc(uid).onSnapshot((s) => {
      const d = s.exists ? s.data() : {};
      data = { half: d.half | 0, hint: d.hint | 0, starter: !!d.starter };
      if (typeof paintJokers === "function" && !game.over) paintJokers();
      if (!$("store").classList.contains("hidden")) Store.render();
    }, (e) => console.warn("Cüzdan okunamadı:", e));
  }
  function bag() { return { half: data.half, hint: data.hint }; }
  async function spend(k) {
    if (!uid || !(data[k] > 0)) return false;
    data[k]--; // hemen göster; sunucu kuralı yalnızca 1 azaltmaya izin verir
    try {
      await Auth.db.collection("wallets").doc(uid).update({ [k]: firebase.firestore.FieldValue.increment(-1) });
    } catch (e) { console.warn("Cüzdandan düşülemedi:", e); }
    return true;
  }
  return { watch, bag, spend, get starter() { return data.starter; } };
})();

/* ================= MAĞAZA ================= */
const Store = (() => {
  let service = null, details = {}, ready = false, busy = false;
  const forced = new URLSearchParams(location.search).has("magaza"); // web'de önizleme için

  async function init() {
    if ("getDigitalGoodsService" in window) {
      try {
        service = await window.getDigitalGoodsService(PLAY_BILLING);
        const list = await service.getDetails(PRODUCTS.map((p) => p.id));
        list.forEach((d) => { details[d.itemId] = d; });
      } catch (e) { console.warn("Google Play faturalandırma açılamadı:", e); service = null; }
    }
    ready = true;
    $("btn-store").classList.toggle("hidden", !available());
    if (service) restorePending();
  }
  const available = () => !!service || forced;

  function price(p) {
    const d = details[p.id];
    if (!d || !d.price) return p.fallback;
    try { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: d.price.currency }).format(+d.price.value); }
    catch { return d.price.value + " " + d.price.currency; }
  }

  function open() {
    if (!available()) return;
    render();
    $("store").classList.remove("hidden");
  }
  function close() { $("store").classList.add("hidden"); }

  function render() {
    const guest = !Cloud.enabled();
    const local = jokerBag(getProfile()), paid = Wallet.bag();
    $("store-bag").textContent = "Jokerlerin: ½ × " + (local.half + paid.half) + " · 💡 × " + (local.hint + paid.hint);
    $("store-note").textContent = guest
      ? "Satın alınan jokerler hesabına kaydedilir. Satın almak için e-posta ya da Google hesabıyla giriş yap."
      : !service ? "Satın alma yalnızca Google Play'den indirilen uygulamada çalışır." : "Ödeme Google Play üzerinden güvenle yapılır.";
    const list = $("store-list");
    list.innerHTML = "";
    PRODUCTS.forEach((p) => {
      if (p.once && Wallet.starter) return;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pack" + (p.tag === "En popüler" ? " hot" : "");
      b.disabled = guest || !service || busy;
      b.innerHTML = '<span class="pk-l"><b></b><small></small></span><span class="pk-r"><em></em><i></i></span>';
      b.querySelector("b").textContent = p.name;
      b.querySelector("small").textContent = "½ × " + p.half + " · 💡 × " + p.hint;
      b.querySelector("em").textContent = p.tag;
      b.querySelector("i").textContent = price(p);
      b.onclick = () => buy(p);
      list.appendChild(b);
    });
  }

  let fnCall = null;
  async function verify(productId, purchaseToken) {
    if (!fnCall) {
      if (!firebase.functions) {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions-compat.js";
          s.onload = res; s.onerror = () => rej(new Error("Bağlantı hatası"));
          document.head.appendChild(s);
        });
      }
      fnCall = firebase.app().functions(FUNCTIONS_REGION).httpsCallable("verifyPurchase");
    }
    const r = await fnCall({ productId, purchaseToken });
    return r.data;
  }

  async function buy(p) {
    if (!service || busy || !Cloud.enabled()) return;
    busy = true; render();
    let resp = null;
    try {
      const req = new PaymentRequest([{ supportedMethods: PLAY_BILLING, data: { sku: p.id } }],
        { total: { label: "Toplam", amount: { currency: "TRY", value: "0" } } });
      resp = await req.show();
      const token = resp.details.purchaseToken;
      const r = await verify(p.id, token);
      await service.consume(token);
      await resp.complete("success");
      toast("🎉 Teşekkürler! +" + r.half + " × ½ ve +" + r.hint + " × 💡 joker hesabına eklendi.", 4200);
    } catch (e) {
      if (resp) { try { await resp.complete("fail"); } catch {} }
      if (e && e.name !== "AbortError") { console.warn(e); toast("Satın alma tamamlanamadı. Ücret alındıysa jokerlerin uygulamayı yeniden açınca eklenir.", 4500); }
    } finally { busy = false; render(); }
  }

  // Yarıda kalan (ödemesi alınmış ama işlenmemiş) satın almaları tamamla
  async function restorePending() {
    if (!service || !Cloud.enabled()) return;
    try {
      const list = await service.listPurchases();
      for (const pu of list) {
        try { await verify(pu.itemId, pu.purchaseToken); await service.consume(pu.purchaseToken); }
        catch (e) { console.warn("Bekleyen satın alma işlenemedi:", e); }
      }
    } catch (e) { console.warn(e); }
  }

  $("btn-store").addEventListener("click", open);
  $("btn-store-close").addEventListener("click", close);
  $("store").addEventListener("click", (e) => { if (e.target.id === "store") close(); });

  return { init, open, close, render, available, restorePending };
})();

// Giriş durumu değişince cüzdanı izle
Auth.onChange(() => { Wallet.watch(); Store.restorePending(); });
Store.init();
