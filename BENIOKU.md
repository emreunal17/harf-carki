# Harf Çarkı — Kelime Yarışması

Telefon ve tabletlerde tarayıcıdan oynanan, ana ekrana uygulama gibi eklenebilen harf çarkı oyunu.

## Özellikler
- 8 kategori + Karışık: Genel Kültür, Spor, Sinema, Tarih & Coğrafya, Bilim & Doğa, Müzik, Edebiyat, Mutfak
- Her harfte 3 soru (toplam 672); oyun son oyunlarda sorulanları hatırlar, önce görülmemiş soruları getirir
- Türk alfabesinin 28 harfi (Ğ hariç); "… ile başlar" ve "İçinde … olan" soruları
- **Klavye ile** ya da **sesle** cevap (🎤 düğmesi; "pas" demek pas geçer)
- Soruları sesli okuma, isteğe bağlı **eller serbest** modu (okuduktan sonra mikrofon kendisi açılır)
- Süre seçimi, duraklatma, kategori rekorları, sonuç ekranında doğru cevaplar
- Yazım hatası ve Türkçe karakter toleransı (fenerbahce = Fenerbahçe)
- Çevrimdışı çalışma (PWA)

## Bilgisayarda deneme
```powershell
python -m http.server 5577
```
Ardından tarayıcıda http://localhost:5577 adresini açın.

## Telefona / tablete koyma
Mikrofon ancak **https** adresinde çalışır. En kolay yol:
1. https://app.netlify.com/drop adresine gidin, bu klasörü sürükleyip bırakın (ya da GitHub Pages kullanın).
2. Size verilen https adresini telefonda açın.
3. Android Chrome: menü → **Ana ekrana ekle**. iPhone/iPad Safari: Paylaş → **Ana Ekrana Ekle**.

Sesli cevap Android'de Chrome'da, iPhone/iPad'de Safari'de çalışır. Firefox desteklemez (klavye ile oynanır).

## Soru ekleme
`questions.js` ya da `questions-extra.js` dosyasında ilgili kategoriye satır ekleyin:
```js
{ l: "A", q: "Soru metni", a: "Doğru cevap", alt: ["Kabul edilen başka yazım"] },
{ l: "Ğ", c: true, q: "İçinde Ğ olan soru", a: "Dağ" },
```
Aynı harfe birden çok soru yazarsanız oyun her seferinde farklı birini seçer (yakın zamanda sorulanları atlar).
Yeni kategori için `CATEGORIES` dizisine `{ id, name, icon, color, questions: [...] }` ekleyin.
Dosyaları değiştirdikten sonra `sw.js` içindeki `VERSION` değerini artırın.

## Hesap açma: Google, Facebook, e-posta (Firebase)
Oyun, Firebase ayarı girilmeden de **misafir profil** ile çalışır. Gerçek hesap girişi için:

1. https://console.firebase.google.com adresinde yeni bir proje oluşturun (ücretsiz plan yeterli).
2. **Proje ayarları → Genel → Uygulamalarınız → Web (</>)** ile bir web uygulaması ekleyin.
   Verilen `firebaseConfig` değerlerini `firebase-config.js` içindeki `window.FIREBASE_CONFIG` alanına yapıştırın.
3. **Authentication → Sign-in method** bölümünde açın:
   - **E-posta/Şifre**
   - **Google**
   - **Facebook**: https://developers.facebook.com adresinde bir uygulama oluşturup "Facebook Girişi" ekleyin.
     Uygulama kimliği ve gizli anahtarını Firebase'e girin. Firebase'in verdiği OAuth yönlendirme adresini
     Facebook uygulamasındaki "Geçerli OAuth Yönlendirme URI'leri" alanına ekleyin.
4. **Authentication → Settings → Authorized domains** listesine oyunun adresini ekleyin
   (örnek: `kullaniciadi.github.io`).

Not: İstatistikler ve rekorlar şimdilik cihazda saklanır (her hesap için ayrı).

## Ses kalitesi
Soruları cihazın kendi Türkçe sesi okur. Menüdeki **Okuyan ses** listesinden sesi seçip **▶ Dinle** ile deneyebilirsiniz; ★ işaretliler daha doğal seslerdir.
- **iPhone/iPad:** Ayarlar → Erişilebilirlik → Seslendirilen İçerik → Sesler → Türkçe → *Yelda (Gelişmiş)* indirin.
- **Android:** Ayarlar → Metin okuma → Google Konuşma Hizmetleri → Türkçe ses verisini yükleyin.
- **Windows:** Edge tarayıcısında "Emel/Ahmet Online (Natural)" sesleri çok daha doğaldır.

### Doğal stüdyo sesi (ElevenLabs)
Sorular ElevenLabs ile önceden seslendirilip `audio/` klasörüne konabilir. Dosyalar varsa menüde **🎙 Oğuz · stüdyo sesi** seçeneği çıkar ve varsayılan olur; dosyası olmayan sorular cihaz sesiyle okunur.

```powershell
$env:ELEVENLABS_API_KEY = "anahtarınız"   # elevenlabs.io → Developers → API Keys (Text to Speech izni yeterli)
node tools/seslendir.mjs --dry            # kaç ses üretileceğini gösterir, kredi harcamaz
node tools/seslendir.mjs --limit 3        # önce 3 tane dene
node tools/seslendir.mjs                  # hepsini üret (672 soru ≈ 31.000 kredi)
```
Soru ekleyip değiştirdikten sonra komutu tekrar çalıştırın: yalnızca yeni/değişen sorular seslendirilir. Başka bir ses için `--voice <voice_id>`, ad için `--voice-name "Öykü"` ekleyin.
