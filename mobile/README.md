# BTC Wallet Mobile 0.4.0

React Native ve resmi [BDK-RN 1.0](https://github.com/bitcoindevkit/bdk-rn) tabanlı, non-custodial Bitcoin cüzdanı. Android ve iOS aynı JavaScript kodunu paylaşır; her iki platformda da birbirinden ayrı testnet ve mainnet uygulama kimlikleri üretilir.

## Özellikler

- Taproot (BIP86) ve SegWit (BIP84), native BDK entropisiyle 12 kelimelik BIP39 yedek
- 6–8 haneli PIN, native PBKDF2-HMAC-SHA256 ve beş hatalı deneme sınırı
- Android Keystore / iOS Keychain içinde şifreli, yalnızca o cihaza bağlı mnemonic saklama; Android'de uygun cihazlarda donanım seviyesi talebi
- Kurtarma kelimeleri doğrulanmadan mainnet gönderimini engelleme
- Çoklu cüzdan, watch-only descriptor ve ayrı duress/decoy profili
- Tam sayı tabanlı BTC/SAT gösterimi ve işlem hesaplarından ayrı yaklaşık USD değeri
- Mempool.space/Blockstream fallback, mainnet genesis doğrulaması ve özel HTTPS Esplora desteği
- Alma adresi türetme indeksi, kullanılmamış adres sayacı ve 20 adreslik güvenlik sınırı
- QR kodlu BIP21 ödeme isteği; panodan gelen URI'de bilinmeyen `req-` parametresi, tekrar eden anahtar ve aralık dışı tutar reddedilir
- Tüm bakiyeyi gönderme (MAX); gerçek tutar tahmin yerine tamamlanmış PSBT çıktılarından okunur
- İşlem ayrıntı ekranı: yerel tutarlar, ücret, zaman damgası, kopyalanabilir txid; blok gezgini sorgusu açık kullanıcı eylemidir
- RBF, ücret sınırları, tam alıcı adresi ve son dört karakter onayı
- Android: ekran görüntüsü, overlay/tapjacking, yedekleme ve cleartext trafik korumaları
- iOS: uygulama değiştirici önizlemesinin ve (release derlemelerinde) ekran kaydı/yansıtmanın gizlenmesi, üçüncü taraf klavyelerin engellenmesi, yedekleme dışı cüzdan veritabanı, ATS

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

## iOS

Gereksinimler: macOS, Xcode 16+, Node.js 22.11+, yarn ve Ruby 3.1+. macOS'un kendi Ruby'si (2.6) `Gemfile` kısıtını karşılamaz; Homebrew (`brew install ruby`) veya rbenv ile güncel bir Ruby kurun.

İlk kurulum:

```bash
npm ci
```

```bash
bundle install
```

```bash
cd ios && bundle exec pod install && cd ..
```

`pod install`, `ios/Podfile.lock` dosyasını ve `BTCWalletMobile.xcworkspace` çalışma alanını üretir, ayrıca `Mainnet` yapılandırmasını Pods ayarlarına bağlar (`project.pbxproj` içinde küçük bir değişiklik oluşur). `Podfile.lock` ile bu değişikliği commit'leyin. Xcode'da her zaman `.xcodeproj` değil **`.xcworkspace`** açılmalıdır.

Simülatörde testnet (Metro ile, debug):

```bash
npm run ios
```

Simülatörde mainnet (JS paketi gömülü, Metro gerekmez):

```bash
npm run ios:mainnet
```

| Scheme | Yapılandırma | Ağ | Bundle ID | Ana ekran adı |
| --- | --- | --- | --- | --- |
| `BTCWalletMobile` | `Debug` / `Release` | testnet | `com.btcwalletmobile` | BTC Testnet |
| `BTCWalletMobile-Mainnet` | `Mainnet` | mainnet | `com.btcwalletmobile.mainnet` | BTC Wallet |

Ağ, derleme ayarı `BITCOIN_NETWORK` → `Info.plist` (`BTCBitcoinNetwork`) → native `Kdf` modülü yoluyla JS'e ulaşır; değer okunamazsa uygulama testnet'te kalır. İki uygulama yan yana kurulabilir ve Keychain kayıtlarını paylaşmaz.

Android ile aynı arayüzü sunan native modül `ios/BTCWalletMobile/KdfModule.m` dosyasındadır (CommonCrypto PBKDF2, BDK veritabanı yolu, ağ sabiti). Pencere kurulumu (UIScene), gizlilik perdesi ve klavye kısıtı `AppDelegate.swift` içindedir.

Gerçek cihaz için Xcode'da hedefin *Signing & Capabilities* sekmesinden kendi Team'inizi seçin; depo bilerek `DEVELOPMENT_TEAM` içermez. Uygulama yalnızca iPhone hedefler (iPad'de uyumluluk modunda çalışır) ve dikey yöne kilitlidir.

iOS'a özgü davranışlar:

- Keychain kayıtları uygulama silinince iOS tarafından silinmez. Uygulama, yeniden kurulumdan sonraki ilk açılışta önceki kurulumdan kalan PIN ve mnemonic kayıtlarını temizler (`src/core/InstallState.ts`); böylece "uygulamayı sil" Android'deki gibi cüzdanı cihazdan kaldırır. **Silmeden önce 12 kelimenin yedeği olduğundan emin olun.**
- Sırlar "yalnızca bu cihaz" korumasıyla saklanır; iCloud/Finder yedeğinden başka bir cihaza geri yüklenmez. Yeni cihazda cüzdan kurtarma ifadesiyle geri yüklenmelidir.
- iOS ekran görüntüsünü engellemeye izin vermez. Kurtarma kelimeleri ekrandayken ekran görüntüsü almayın; alınırsa fotoğraf arşivine ve varsa iCloud Fotoğraflar'a gider.
- Simülatörde Secure Enclave yoktur; Ayarlar ekranı kasayı "Simülatör (yazılım)" olarak gösterir.

## Güvenlik sınırları

- Uygulama sunucusuz ve non-custodial'dır; Esplora özel anahtarla imza atamaz fakat sorgulanan adresleri/IP'yi gözlemleyebilir veya eksik veri sunabilir.
- Root/jailbreak, kötü amaçlı klavye, zararlı erişilebilirlik servisi, değiştirilmiş APK, işletim sistemi açığı ve kurtarma ifadesi oltalaması risk olmaya devam eder.
- Donanım Keystore bulunmadığında şifreli yazılım Keystore seviyesine düşülebilir; bu durum arayüzde gösterilir.
- Mainnet APK ARM64 cihazlarla sınırlıdır.
- iOS derlemesi henüz gerçek cihazda doğrulanmamıştır; iOS'ta ekran görüntüsü engellenemez (yukarıdaki iOS bölümüne bakın).
- `npm audit` şu anda 10 high uyarı bildirir; hepsi Metro'nun `image-size` bağımlılığındaki tek bir açığın bağımlılık ağacında yukarı yayılmasıdır. Bu paket yalnızca derleme zamanında çalışır, APK'ya girmez ve upstream'de henüz yaması yoktur. **`npm audit fix --force` çalıştırmayın**: önerdiği "düzeltme" React Native'i 0.86.2'den 0.72.17'ye düşürmektir.
- Proje bağımsız güvenlik denetiminden geçmemiştir. Gerçek değerle kullanmadan önce [`../SECURITY_PREAUDIT_0.3.0.md`](../SECURITY_PREAUDIT_0.3.0.md) belgesindeki açık maddeleri inceleyin.
