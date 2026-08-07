# BTC Wallet Mobile 0.3.0

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
- RBF, ücret sınırları, tam alıcı adresi ve son dört karakter onayı
- Ekran görüntüsü, overlay/tapjacking, Android yedekleme ve cleartext trafik korumaları

## Geliştirme

Gereksinimler: Node.js 22.11+, JDK 17 ve Android SDK.

```bash
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

## Güvenlik sınırları

- Uygulama sunucusuz ve non-custodial'dır; Esplora özel anahtarla imza atamaz fakat sorgulanan adresleri/IP'yi gözlemleyebilir veya eksik veri sunabilir.
- Root/jailbreak, kötü amaçlı klavye, zararlı erişilebilirlik servisi, değiştirilmiş APK, işletim sistemi açığı ve kurtarma ifadesi oltalaması risk olmaya devam eder.
- Donanım Keystore bulunmadığında şifreli yazılım Keystore seviyesine düşülebilir; bu durum arayüzde gösterilir.
- Mainnet APK ARM64 cihazlarla sınırlıdır.
- Proje bağımsız güvenlik denetiminden geçmemiştir. Gerçek değerle kullanmadan önce [`../SECURITY_PREAUDIT_0.3.0.md`](../SECURITY_PREAUDIT_0.3.0.md) belgesindeki açık maddeleri inceleyin.
