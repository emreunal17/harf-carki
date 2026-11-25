// Google / Facebook / e-posta ile giriş için Firebase ayarları.
// Kurulum adımları BENIOKU.md dosyasında. Firebase konsolunda
// "Proje ayarları → Uygulamalarınız → Web uygulaması" kısmındaki değerleri buraya yapıştırın.
// Bu değerler gizli değildir; web uygulamalarında herkese açık olması normaldir.
//
// Boş (null) bırakılırsa oyun yalnızca misafir/yerel profil ile çalışır.

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyChYQGHqcGIRr9PXPRE7S28v31t82Wcg1A",
  authDomain: "harf-carki-69e45.firebaseapp.com",
  projectId: "harf-carki-69e45",
  storageBucket: "harf-carki-69e45.firebasestorage.app",
  messagingSenderId: "221123781277",
  appId: "1:221123781277:web:335897b7ee5804cac26a74",
};

// Firebase konsolunda açılan giriş yöntemleri. Açtıkça true yapın.
window.AUTH_PROVIDERS = { email: true, google: false, facebook: false };

/* Örnek:
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "harf-carki.firebaseapp.com",
  projectId: "harf-carki",
  appId: "1:1234567890:web:abcdef",
};
*/
