# Harf Çarkı — Google Play'e çıkış ve joker satışı

Kod tarafı hazır. Satın alma düğmesi yalnızca **Google Play'den indirilen uygulamada** görünür, web sitesinde görünmez.

Aşağıdaki adımları senin yapman gerekiyor. Bunlar hesap, ödeme ve imza anahtarı gerektiren işler.

---

## 1. Google Play geliştirici hesabı
- https://play.google.com/console adresinden hesap aç. Bir kerelik **25 $** ücret var, kimlik doğrulaması da isteniyor.
- Satış yapabilmek için Play Console'da **Ödeme profili** (Payments profile) oluştur. Banka ve vergi bilgilerini buraya sen gireceksin.
- Yeni kişisel hesaplarda kural şu: uygulama yayına girmeden önce **en az 12 test kullanıcısıyla 14 gün kapalı test** yapılmalı. Arkadaşlarını şimdiden topla.

## 2. Firebase'i Blaze planına geçir
- Satın alma doğrulama fonksiyonu yalnızca Blaze planında çalışır.
- Firebase Console → harf-carki-69e45 → ⚙️ → Kullanım ve faturalandırma → **Blaze**.
- Hemen ardından bir **bütçe uyarısı** kur (ör. 5 $). Bu ölçekte maliyet pratikte 0 olur, çünkü ücretsiz kota çok geniş.

## 3. Android paketini oluştur (TWA)
İki yoldan birini seç.

**Kolay yol: PWABuilder**
1. https://www.pwabuilder.com adresine git ve `https://emreunal17.github.io/harf-carki/` yaz.
2. **Package for stores → Android** seç.
3. Package ID olarak `io.github.emreunal17.harfcarki` yaz.
4. **"Google Play Billing" seçeneğini aç.**
5. İndirdiğin zipte `.aab` dosyası (Play'e yüklenecek), imza anahtarı ve `assetlinks.json` bulunur.

**Komut satırı: Bubblewrap**
```
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://emreunal17.github.io/harf-carki/manifest.json
```
- Paket adı `io.github.emreunal17.harfcarki` olmalı.
- `twa-manifest.json` içinde `"features": { "playBilling": { "enabled": true } }` olmalı.
- Ardından `bubblewrap build` çalıştır.

⚠️ **İmza anahtarı (keystore) ve şifresi çok önemli.** Kaybedersen uygulamayı bir daha güncelleyemezsin. Bilgisayar dışında güvenli bir yere yedekle. Şifreyi kimseyle paylaşma, bana da yazma.

## 4. Site ile uygulamayı eşleştir (assetlinks.json)
Bu adım yapılmazsa uygulamanın üstünde tarayıcı adres çubuğu görünür.

1. Play Console → Uygulama → **Kurulum → Uygulama bütünlüğü → Uygulama imzalama** ekranından **SHA-256** parmak izini kopyala.
2. Dosya şu adreste olmalı: `https://emreunal17.github.io/.well-known/assetlinks.json`. Bu, `harf-carki` deposunda değil, alan adının kökünde demek.
3. Bunun için GitHub'da **`emreunal17.github.io`** adında yeni ve herkese açık bir depo gerekiyor.
   - İstersen bu depoyu ben hazırlarım. SHA-256'yı bana vermen yeterli, o gizli bir bilgi değil.

## 5. Ürünleri tanımla
Play Console → **Para kazanma → Ürünler → Uygulama içi ürünler** ekranına git. Kimlikler **aynen** böyle olmalı:

| Ürün kimliği | Ad | İçerik | Fiyat |
|---|---|---|---|
| `joker_baslangic` | Başlangıç paketi (tek seferlik) | 10 × ½ + 10 × 💡 | 24,99 TL |
| `joker_15` | Küçük paket | 7 × ½ + 8 × 💡 | 29,99 TL |
| `joker_40` | Orta paket | 20 × ½ + 20 × 💡 | 59,99 TL |
| `joker_100` | Büyük paket | 50 × ½ + 50 × 💡 | 119,99 TL |

Fiyatları sonradan Play Console'dan değiştirebilirsin, uygulama güncel fiyatı oradan okur. İçerikleri değiştirirsen bana söyle; `store.js` ve `functions/index.js` dosyalarının da güncellenmesi gerekir.

## 6. Doğrulama fonksiyonuna Play erişimi ver
1. Google Cloud Console → harf-carki-69e45 → **API'ler** ekranında **Google Play Android Developer API**'yi etkinleştir.
2. Fonksiyonun hizmet hesabı `harf-carki-69e45@appspot.gserviceaccount.com` ya da `…-compute@developer.gserviceaccount.com` olur. Hangisi olduğunu Cloud Console → IAM ekranında görebilirsin.
3. Play Console → **Kullanıcılar ve izinler → Yeni kullanıcı davet et** ile bu e-postayı ekle.
   - Uygulama izinlerinde **"Finansal verileri görüntüle"** ve **"Siparişleri yönet"** seçeneklerini işaretle.

## 7. Fonksiyonu yayınla
Blaze planına geçtikten sonra bana "fonksiyonu yükle" demen yeterli. Ya da kendin şunları çalıştır:
```
cd functions
npm install
cd ..
npx firebase-tools deploy --only functions --project harf-carki-69e45
```

## 8. Test ve yayın
1. Play Console → **Test → Kapalı test** ekranında `.aab` dosyasını yükle ve test kullanıcılarını ekle.
2. **Lisans testi** listesine kendi Google hesabını ekle. Böylece satın almaları ücretsiz deneyebilirsin.
3. Mağaza kaydı için şunlar gerekiyor:
   - simge (512×512, `icons/icon-512.png`);
   - en az 2 ekran görüntüsü;
   - kısa ve uzun açıklama;
   - gizlilik politikası adresi: **https://emreunal17.github.io/harf-carki/gizlilik.html**
   - "Veri güvenliği" formu. Gizlilik sayfasındaki maddeler burada işine yarar: e-posta, ad, oyun istatistikleri, satın alma geçmişi; reklam yok.
4. 14 gün kapalı testten sonra **Üretim** için başvur.

---

### Nasıl çalışıyor (kısaca)
- Yeni oyuncular hoş geldin hediyesi olarak **3 × ½ ve 3 × 💡** alır. Günün çarkı, 7 günlük seri ve rozetlerle ücretsiz joker de kazanılır.
- Satın alınan jokerler **hesaba bağlıdır** (Firestore `wallets/{uid}`). Telefon değişse de kaybolmaz.
- Satın alma sonrası jokerleri **yalnızca sunucu** ekler; ödeme önce Google Play'den doğrulanır. Oyuncu kendi cüzdanına joker yazamaz, kullandıkça yalnızca 1'er 1'er düşebilir.
- Aynı satın alma iki kez sayılmaz. Bağlantı koptuğunda yarım kalan satın almalar uygulama yeniden açılınca tamamlanır.
