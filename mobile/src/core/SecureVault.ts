// Sır saklama katmanı: mnemonic'ler ve PIN kayıtları react-native-keychain ile
// Android'de Keystore (donanım destekli, StrongBox varsa onda), iOS'ta ise
// Keychain (yalnızca bu cihaz, kilit açıkken erişilebilir; iCloud'a taşınmaz) içinde saklanır.
// Sırlar asla AsyncStorage'a veya düz metin dosyaya yazılmaz.
import { Platform } from "react-native";
import * as Keychain from "react-native-keychain";
import { APP_CONFIG } from "./config";

const SERVICE_PREFIX = APP_CONFIG.storagePrefix;

async function setSecret(key: string, value: string): Promise<void> {
  const base = {
    service: `${SERVICE_PREFIX}.${key}`,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  };
  if (Platform.OS !== "android") {
    // securityLevel Android'e özgüdür; iOS Keychain öğeleri cihazın donanım anahtarına bağlıdır.
    await Keychain.setGenericPassword(key, value, base);
    return;
  }
  try {
    // Önce donanım destekli Keystore (StrongBox/TEE) dene
    await Keychain.setGenericPassword(key, value, {
      ...base,
      securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
    });
  } catch {
    // Donanım keystore yoksa (ör. emülatör) yazılımsal Keystore'a düş — yine şifreli.
    // Güvenlik seviyesi ana ekranda açıkça gösterilir ve mainnet için kullanıcı uyarılır.
    await Keychain.setGenericPassword(key, value, {
      ...base,
      securityLevel: Keychain.SECURITY_LEVEL.ANY,
    });
  }
}

async function getSecret(key: string): Promise<string | null> {
  const result = await Keychain.getGenericPassword({ service: `${SERVICE_PREFIX}.${key}` });
  return result === false ? null : result.password;
}

async function deleteSecret(key: string): Promise<void> {
  await Keychain.resetGenericPassword({ service: `${SERVICE_PREFIX}.${key}` });
}

export const SecureVault = {
  saveMnemonic: (walletId: string, mnemonic: string) => setSecret(`mnemonic.${walletId}`, mnemonic),
  getMnemonic: (walletId: string) => getSecret(`mnemonic.${walletId}`),
  deleteMnemonic: (walletId: string) => deleteSecret(`mnemonic.${walletId}`),

  savePinRecord: (json: string) => setSecret("pin", json),
  getPinRecord: () => getSecret("pin"),
  deletePinRecord: () => deleteSecret("pin"),

  /** Bu uygulamanın (geçerli ağ önekiyle) kasada tuttuğu tüm kayıtların servis adları. */
  async listServices(): Promise<string[]> {
    const services = await Keychain.getAllGenericPasswordServices();
    return services.filter((service) => service.startsWith(`${SERVICE_PREFIX}.`));
  },

  async deleteService(service: string): Promise<void> {
    if (!service.startsWith(`${SERVICE_PREFIX}.`)) throw new Error("Yabancı kasa kaydı silinemez.");
    await Keychain.resetGenericPassword({ service });
  },

  async securityLevel(): Promise<"hardware" | "software" | "unknown"> {
    if (Platform.OS === "ios") {
      // Gerçek cihazlarda Keychain, Secure Enclave'e bağlı anahtarlarla şifrelenir;
      // simülatörde bu donanım yoktur.
      return APP_CONFIG.isSimulator ? "software" : "hardware";
    }
    try {
      const level = await Keychain.getSecurityLevel();
      if (level === Keychain.SECURITY_LEVEL.SECURE_HARDWARE) return "hardware";
      if (level === Keychain.SECURITY_LEVEL.SECURE_SOFTWARE) return "software";
      return "unknown";
    } catch {
      return "unknown";
    }
  },
};
