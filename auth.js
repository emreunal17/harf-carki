"use strict";
// Hesap yönetimi: Firebase (Google, Facebook, e-posta) ya da cihazda yerel misafir profil.

const Auth = (() => {
  const FB_VER = "10.12.2";
  const LS = "harfcarki.";
  let fbAuth = null;
  let user = null; // { uid, name, email, provider }
  const listeners = [];

  const readLS = (k, d) => { try { const v = localStorage.getItem(LS + k); return v === null ? d : JSON.parse(v); } catch { return d; } };
  const writeLS = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch {} };

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = () => rej(new Error("yüklenemedi: " + src));
      document.head.appendChild(s);
    });
  }

  function emit() { listeners.forEach((fn) => fn(user)); }

  function fromFirebase(u) {
    if (!u) return null;
    const p = (u.providerData[0] && u.providerData[0].providerId) || "password";
    return {
      uid: u.uid,
      name: u.displayName || (u.email ? u.email.split("@")[0] : "Oyuncu"),
      email: u.email || "",
      provider: p.includes("google") ? "google" : p.includes("facebook") ? "facebook" : "email",
    };
  }

  const ERRORS = {
    "auth/invalid-email": "E-posta adresi geçersiz.",
    "auth/missing-password": "Şifre girin.",
    "auth/weak-password": "Şifre en az 6 karakter olmalı.",
    "auth/email-already-in-use": "Bu e-posta ile zaten bir hesap var. Giriş yapmayı deneyin.",
    "auth/invalid-credential": "E-posta ya da şifre hatalı.",
    "auth/wrong-password": "E-posta ya da şifre hatalı.",
    "auth/user-not-found": "Bu e-posta ile kayıtlı hesap yok.",
    "auth/too-many-requests": "Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin.",
    "auth/popup-closed-by-user": "Giriş penceresi kapatıldı.",
    "auth/cancelled-popup-request": "Giriş penceresi kapatıldı.",
    "auth/account-exists-with-different-credential": "Bu e-posta başka bir giriş yöntemiyle kayıtlı. O yöntemle giriş yapın.",
    "auth/operation-not-allowed": "Bu giriş yöntemi Firebase konsolunda açılmamış.",
    "auth/unauthorized-domain": "Bu site adresi Firebase'de yetkili alan adı olarak eklenmemiş.",
    "auth/network-request-failed": "İnternet bağlantısı yok.",
  };
  const message = (e) => ERRORS[e && e.code] || (e && e.message) || "Bir hata oluştu.";

  async function init() {
    const cfg = window.FIREBASE_CONFIG;
    if (cfg && cfg.apiKey) {
      try {
        await loadScript(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app-compat.js`);
        await loadScript(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-auth-compat.js`);
        firebase.initializeApp(cfg);
        fbAuth = firebase.auth();
        fbAuth.languageCode = "tr";
        try { await fbAuth.getRedirectResult(); } catch (e) { console.warn(e); }
        await new Promise((resolve) => {
          let first = true;
          fbAuth.onAuthStateChanged((u) => {
            if (u) user = fromFirebase(u);
            else if (user && user.provider !== "local") user = null;
            if (!user) user = readLS("guest", null);
            if (first) { first = false; resolve(); } else emit();
          });
        });
        return user;
      } catch (e) {
        console.warn("Firebase başlatılamadı:", e);
        fbAuth = null;
      }
    }
    user = readLS("guest", null);
    return user;
  }

  const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));

  async function social(kind) {
    if (!fbAuth) throw new Error("Hesap girişi henüz etkin değil.");
    const provider = kind === "google" ? new firebase.auth.GoogleAuthProvider() : new firebase.auth.FacebookAuthProvider();
    if (kind === "facebook") provider.addScope("email");
    try {
      const r = await fbAuth.signInWithPopup(provider);
      user = fromFirebase(r.user); writeLS("guest", null); emit(); return user;
    } catch (e) {
      if (isMobile() && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) {
        await fbAuth.signInWithRedirect(provider); return null;
      }
      throw new Error(message(e));
    }
  }

  async function emailLogin(email, pass) {
    if (!fbAuth) throw new Error("Hesap girişi henüz etkin değil.");
    try { const r = await fbAuth.signInWithEmailAndPassword(email, pass); user = fromFirebase(r.user); writeLS("guest", null); emit(); return user; }
    catch (e) { throw new Error(message(e)); }
  }
  async function emailRegister(name, email, pass) {
    if (!fbAuth) throw new Error("Hesap girişi henüz etkin değil.");
    try {
      const r = await fbAuth.createUserWithEmailAndPassword(email, pass);
      if (name) await r.user.updateProfile({ displayName: name });
      try { await r.user.sendEmailVerification(); } catch {}
      user = fromFirebase(r.user); if (name) user.name = name; writeLS("guest", null); emit(); return user;
    } catch (e) { throw new Error(message(e)); }
  }
  async function resetPassword(email) {
    if (!fbAuth) throw new Error("Hesap girişi henüz etkin değil.");
    try { await fbAuth.sendPasswordResetEmail(email); } catch (e) { throw new Error(message(e)); }
  }

  function guest(name) {
    const existing = readLS("guest", null);
    user = existing || { uid: "local-" + Math.random().toString(36).slice(2, 10), name: name || "Misafir", email: "", provider: "local" };
    writeLS("guest", user); emit(); return user;
  }

  async function logout() {
    if (fbAuth && user && user.provider !== "local") await fbAuth.signOut();
    writeLS("guest", null);
    user = null; emit();
  }

  return {
    init, social, emailLogin, emailRegister, resetPassword, guest, logout,
    get user() { return user; },
    get enabled() { return !!fbAuth; },
    onChange(fn) { listeners.push(fn); },
  };
})();
