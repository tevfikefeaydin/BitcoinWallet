// Sır saklama katmanı: mnemonic'ler ve PIN kayıtları react-native-keychain ile
// Android Keystore (donanım destekli, StrongBox varsa onda) içinde şifrelenir.
// Sırlar asla AsyncStorage'a veya düz metin dosyaya yazılmaz.
import * as Keychain from "react-native-keychain";
import { APP_CONFIG } from "./config";

const SERVICE_PREFIX = APP_CONFIG.storagePrefix;

async function setSecret(key: string, value: string): Promise<void> {
  const base = {
    service: `${SERVICE_PREFIX}.${key}`,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  };
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

  async securityLevel(): Promise<"hardware" | "software" | "unknown"> {
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
