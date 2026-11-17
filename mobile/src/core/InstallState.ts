// iOS'a özgü kurulum tutarlılığı.
//
// Android'de uygulama silinince Keystore kayıtları da silinir ve yedekleme kapalıdır.
// iOS'ta ise iki fark vardır:
//   1. Keychain öğeleri uygulama silinse bile cihazda kalır. Yeniden kurulumda eski
//      mnemonic'ler ve PIN kaydı, kullanıcı "sildiğini" düşünürken kasada durmaya devam eder.
//   2. Cüzdan metadata'sı (AsyncStorage) cihaz yedeğiyle yeni bir cihaza taşınabilir, fakat
//      "yalnızca bu cihaz" korumalı Keychain sırları taşınmaz; geriye açılamayan kayıtlar kalır.
// Bu modül açılışta her iki durumu da Android'deki davranışa yaklaştırır.
import { Platform } from "react-native";
import { consumeFreshInstallFlag } from "./config";
import { SecureVault } from "./SecureVault";
import { WalletStore } from "./WalletStore";

export async function reconcileInstallState(): Promise<void> {
  if (Platform.OS !== "ios") return;

  const freshInstall = await consumeFreshInstallFlag();
  const wallets = await WalletStore.list();

  // 1. Yeni kurulum + kayıtlı cüzdan yok → kasadaki her şey önceki kurulumdan kalmadır.
  //    Yalnızca native "ilk açılış" bayrağı varken silinir; metadata'nın tek başına
  //    kaybolması (ör. depolama hatası) asla sır silmeye yol açmaz.
  if (freshInstall && wallets.length === 0) {
    for (const service of await SecureVault.listServices()) {
      await SecureVault.deleteService(service);
    }
    return;
  }

  // 2. PIN kaydı yok ama cüzdan metadata'sı var → yedekten başka cihaza geri yükleme.
  //    Sırrı kasada kesin olarak bulunmayan kayıtlar kaldırılır; okuma hatası "yok"
  //    sayılmaz (getMnemonic hata fırlatır ve hiçbir şey silinmez).
  if (wallets.length > 0 && (await SecureVault.getPinRecord()) === null) {
    for (const wallet of wallets) {
      if ((await SecureVault.getMnemonic(wallet.id)) === null) {
        await WalletStore.remove(wallet.id);
      }
    }
  }
}
