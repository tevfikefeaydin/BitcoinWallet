# BTC Wallet Mobile 0.4.0

React Native ve resmi [BDK-RN 1.0](https://github.com/bitcoindevkit/bdk-rn) tabanlı, non-custodial Bitcoin cüzdanı. Android projesi birbirinden ayrı testnet ve mainnet uygulama kimlikleri üretir.

## Özellikler

- Taproot (BIP86) ve SegWit (BIP84), native BDK entropisiyle 12 kelimelik BIP39 yedek
- 6–8 haneli PIN, native PBKDF2-HMAC-SHA256 ve beş hatalı deneme sınırı
- Android Keystore içinde şifreli mnemonic saklama; uygun cihazlarda donanım seviyesi talebi
- Kurtarma kelimeleri doğrulanmadan mainnet gönderimini engelleme
- Çoklu cüzdan, watch-only descriptor ve ayrı duress/decoy profili
- Tam sayı tabanlı BTC/SAT gösterimi ve işlem hesaplarından ayrı yaklaşık USD değeri
- Mempool.space/Blockstream fallback, mainnet genesis doğrulaması ve özel HTTPS Esplora desteği
- Alma adresi türetme indeksi, kullanılmamış adres sayacı ve 20 adreslik güvenlik sınırı
- QR kodlu BIP21 ödeme isteği; panodan gelen URI'de bilinmeyen `req-` parametresi, tekrar eden anahtar ve aralık dışı tutar reddedilir
- Tüm bakiyeyi gönderme (MAX); gerçek tutar tahmin yerine tamamlanmış PSBT çıktılarından okunur
- İşlem ayrıntı ekranı: yerel tutarlar, ücret, zaman damgası, kopyalanabilir txid; blok gezgini sorgusu açık kullanıcı eylemidir
- RBF, ücret sınırları, tam alıcı adresi ve son dört karakter onayı
- Ekran görüntüsü, overlay/tapjacking, Android yedekleme ve cleartext trafik korumaları

## Geliştirme

Android gereksinimleri: Node.js 22.11+, JDK 17, Android SDK ve Git. iOS bağımlılık çözümü ayrıca Ruby 3.1+ gerektirir.

Kuruluma başlamadan önce **yarn'ı kurun**. `bdk-rn`, `uniffi-bindgen-react-native` paketini git kaynağından çeker ve o paketin hazırlık adımı `yarn build` çalıştırır; yarn bulunamazsa `npm ci` şu hatayla durur:

```
'yarn' is not recognized as an internal or external command
npm error command failed: cmd.exe /d /s /c yarn build
```

GitHub Actions imajlarında yarn hazır geldiği için CI bu durumu yakalamaz — temiz bir geliştirme makinesinde adım atlanmamalıdır.

```bash
npm install -g yarn   # veya: corepack enable
npm ci
npx tsc --noEmit
npm run lint
npm test -- --runInBand
```

Testnet debug sürümü:

```bash
npx react-native run-android
```

İmzalı mainnet derlemesi, gizli bilgileri kaynak koduna yazmadan aşağıdaki ortam değişkenlerini ister:

- `BTCWALLET_RELEASE_STORE_FILE`
- `BTCWALLET_RELEASE_STORE_PASSWORD`
- `BTCWALLET_RELEASE_KEY_ALIAS`
- `BTCWALLET_RELEASE_KEY_PASSWORD`

Ardından Windows'ta:

```powershell
cd android
.\gradlew.bat assembleMainnet
```

Üretim APK'sı `android/app/build/outputs/apk/mainnet/app-mainnet.apk` altında oluşur. Release varyantı Metro kullanmaz; JavaScript paketi APK içine gömülür.

Dört değişkenden biri eksikse `hasReleaseSigning` false olur ve varyant imzasız derlenir. Keystore dosyası bilerek sürüm kontrolünün dışındadır; **repo dışında yedekleyin**, çünkü anahtar kaybedilirse aynı uygulama kimliğine güncelleme yayınlanamaz.

`preview` varyantı, `com.btcwalletmobile.previewmainnet` kimliğiyle mainnet derlemesini mevcut kurulumun yanına kurmayı sağlar; doğrulama sırasında kullanıcı verisini silmeye gerek kalmaz.

```powershell
.\gradlew.bat assemblePreview
```

## Güvenlik sınırları

- Uygulama sunucusuz ve non-custodial'dır; Esplora özel anahtarla imza atamaz fakat sorgulanan adresleri/IP'yi gözlemleyebilir veya eksik veri sunabilir.
- Root/jailbreak, kötü amaçlı klavye, zararlı erişilebilirlik servisi, değiştirilmiş APK, işletim sistemi açığı ve kurtarma ifadesi oltalaması risk olmaya devam eder.
- Donanım Keystore bulunmadığında şifreli yazılım Keystore seviyesine düşülebilir; bu durum arayüzde gösterilir.
- Mainnet APK ARM64 cihazlarla sınırlıdır.
- Proje bağımsız güvenlik denetiminden geçmemiştir. Gerçek değerle kullanmadan önce [`../SECURITY_PREAUDIT_0.3.0.md`](../SECURITY_PREAUDIT_0.3.0.md) belgesindeki açık maddeleri inceleyin.
