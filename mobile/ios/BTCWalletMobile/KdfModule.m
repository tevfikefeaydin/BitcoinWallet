// Android'deki KdfModule.kt'nin iOS karşılığı. JS tarafı her iki platformda da
// aynı `NativeModules.Kdf` arayüzünü görür:
//   - bitcoinNetwork: derleme yapılandırmasından gelen ağ (Info.plist → BTCBitcoinNetwork)
//   - pbkdf2Sha256: CommonCrypto ile native PBKDF2-HMAC-SHA256
//   - getWalletDatabasePath: BDK SQLite durumunun yedekleme dışı, korumalı konumu
#import <CommonCrypto/CommonCryptoError.h>
#import <CommonCrypto/CommonKeyDerivation.h>
#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <TargetConditionals.h>

@interface KdfModule : NSObject <RCTBridgeModule>
@end

@implementation KdfModule

RCT_EXPORT_MODULE(Kdf)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

// 600.000 iterasyonluk türetme arayüz iş parçacığını bloklamasın.
- (dispatch_queue_t)methodQueue
{
  static dispatch_queue_t queue;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    queue = dispatch_queue_create("com.btcwalletmobile.kdf", DISPATCH_QUEUE_SERIAL);
  });
  return queue;
}

- (NSDictionary *)constantsToExport
{
  // Yapılandırma okunamazsa güvenli tarafta kal: asla kendiliğinden mainnet'e geçme.
  NSString *configured = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"BTCBitcoinNetwork"];
  NSString *network = [configured isEqual:@"mainnet"] ? @"mainnet" : @"testnet";
#if TARGET_OS_SIMULATOR
  BOOL isSimulator = YES;
#else
  BOOL isSimulator = NO;
#endif
  return @{ @"bitcoinNetwork" : network, @"isSimulator" : @(isSimulator) };
}

static NSMutableData *BTCDataFromHex(NSString *hex)
{
  NSUInteger length = hex.length;
  if (length % 2 != 0) {
    return nil;
  }
  NSMutableData *data = [NSMutableData dataWithLength:length / 2];
  uint8_t *bytes = data.mutableBytes;
  for (NSUInteger i = 0; i < length; i += 2) {
    int value = 0;
    for (NSUInteger j = 0; j < 2; j++) {
      unichar c = [hex characterAtIndex:i + j];
      int nibble;
      if (c >= '0' && c <= '9') {
        nibble = c - '0';
      } else if (c >= 'a' && c <= 'f') {
        nibble = c - 'a' + 10;
      } else if (c >= 'A' && c <= 'F') {
        nibble = c - 'A' + 10;
      } else {
        return nil;
      }
      value = (value << 4) | nibble;
    }
    bytes[i / 2] = (uint8_t)value;
  }
  return data;
}

RCT_EXPORT_METHOD(pbkdf2Sha256:(NSString *)password
                  saltHex:(NSString *)saltHex
                  iterations:(double)iterations
                  dkLenBytes:(double)dkLenBytes
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSMutableData *salt = BTCDataFromHex(saltHex ?: @"");
  if (password == nil || salt == nil || salt.length == 0) {
    reject(@"KDF_ERROR", @"Geçersiz PBKDF2 girdisi.", nil);
    return;
  }
  if (iterations < 1 || iterations > UINT32_MAX || dkLenBytes < 1 || dkLenBytes > 64) {
    reject(@"KDF_ERROR", @"Geçersiz PBKDF2 parametresi.", nil);
    return;
  }

  NSMutableData *passwordData = [[password dataUsingEncoding:NSUTF8StringEncoding] mutableCopy];
  NSMutableData *derived = [NSMutableData dataWithLength:(NSUInteger)dkLenBytes];

  int status = CCKeyDerivationPBKDF(kCCPBKDF2,
                                    passwordData.bytes,
                                    passwordData.length,
                                    salt.bytes,
                                    salt.length,
                                    kCCPRFHmacAlgSHA256,
                                    (uint32_t)iterations,
                                    derived.mutableBytes,
                                    derived.length);

  NSString *result = nil;
  if (status == kCCSuccess) {
    NSMutableString *hex = [NSMutableString stringWithCapacity:derived.length * 2];
    const uint8_t *bytes = derived.bytes;
    for (NSUInteger i = 0; i < derived.length; i++) {
      [hex appendFormat:@"%02x", bytes[i]];
    }
    result = [hex copy];
  }

  // Ara tamponları bellekte bırakma.
  [passwordData resetBytesInRange:NSMakeRange(0, passwordData.length)];
  [salt resetBytesInRange:NSMakeRange(0, salt.length)];
  [derived resetBytesInRange:NSMakeRange(0, derived.length)];

  if (result != nil) {
    resolve(result);
  } else {
    reject(@"KDF_ERROR", [NSString stringWithFormat:@"PBKDF2 başarısız (%d).", status], nil);
  }
}

/**
 * iOS Keychain öğeleri uygulama silinince silinmez. Bu bayrak her kurulumda yalnızca
 * bir kez YES döner; JS tarafı bunu önceki kurulumdan kalan sırları temizlemek için kullanır.
 * Bayrak NSUserDefaults'ta tutulur: uygulama silinince sıfırlanır, Keychain ise kalır.
 */
RCT_EXPORT_METHOD(consumeFreshInstallFlag:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  static NSString *const key = @"BTCWalletInstallInitialized";
  NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
  if ([defaults boolForKey:key]) {
    resolve(@NO);
    return;
  }
  [defaults setBool:YES forKey:key];
  resolve(@YES);
}

/**
 * BDK'nin SQLite durumunu iCloud/Finder yedeğinin dışında, cihaz kilitliyken
 * okunamayan bir dizinde tutar. Cüzdan kimliği doğrulanır; çağıran tarafın
 * dosya yolu enjekte etmesine izin verilmez.
 */
RCT_EXPORT_METHOD(getWalletDatabasePath:(NSString *)walletId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSRegularExpression *pattern = [NSRegularExpression regularExpressionWithPattern:@"^[A-Za-z0-9_-]{1,64}$"
                                                                           options:0
                                                                             error:nil];
  if (walletId == nil ||
      [pattern numberOfMatchesInString:walletId options:0 range:NSMakeRange(0, walletId.length)] != 1) {
    reject(@"WALLET_DB_PATH_ERROR", @"Geçersiz cüzdan kimliği.", nil);
    return;
  }

  NSFileManager *fileManager = [NSFileManager defaultManager];
  NSError *error = nil;
  NSURL *support = [fileManager URLForDirectory:NSApplicationSupportDirectory
                                       inDomain:NSUserDomainMask
                              appropriateForURL:nil
                                         create:YES
                                          error:&error];
  NSURL *directory = [support URLByAppendingPathComponent:@"bdk-wallets" isDirectory:YES];
  if (support != nil) {
    [fileManager createDirectoryAtURL:directory
          withIntermediateDirectories:YES
                           attributes:@{ NSFileProtectionKey : NSFileProtectionComplete }
                                error:&error];
  }
  if (support == nil || error != nil) {
    reject(@"WALLET_DB_PATH_ERROR", @"Cüzdan veritabanı dizini oluşturulamadı.", error);
    return;
  }

  // Android'deki noBackupFilesDir karşılığı: işlem geçmişi yedeklere sızmasın.
  if (![directory setResourceValue:@YES forKey:NSURLIsExcludedFromBackupKey error:&error]) {
    reject(@"WALLET_DB_PATH_ERROR", @"Cüzdan veritabanı dizini yedeklemeden çıkarılamadı.", error);
    return;
  }

  NSString *fileName = [walletId stringByAppendingString:@".sqlite"];
  resolve([directory URLByAppendingPathComponent:fileName isDirectory:NO].path);
}

@end
