// Cüzdan kayıt defteri: yalnızca gizli OLMAYAN metadata AsyncStorage'da tutulur
// (isim, adres tipi, profil). Mnemonic'ler SecureVault'tadır.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BalanceUnit, EsploraMode, EsploraServer, Profile, WalletMeta } from "./types";
import { APP_CONFIG } from "./config";

const KEY_WALLETS = `${APP_CONFIG.storagePrefix}.wallets`;
const KEY_SERVER = `${APP_CONFIG.storagePrefix}.esplora`;
const KEY_SERVER_MODE = `${APP_CONFIG.storagePrefix}.esplora.mode`;
const KEY_CUSTOM_SERVERS = `${APP_CONFIG.storagePrefix}.esplora.custom`;
const KEY_ACTIVE_SERVER = `${APP_CONFIG.storagePrefix}.esplora.active`;
const KEY_BALANCE_UNIT = `${APP_CONFIG.storagePrefix}.balance.unit`;
const KEY_KNOWN_RECIPIENTS = `${APP_CONFIG.storagePrefix}.recipients`;

function belongsToCurrentNetwork(wallet: WalletMeta): boolean {
  const network = wallet.network ?? "testnet";
  return network === APP_CONFIG.networkName;
}

export const WalletStore = {
  async list(profile?: Profile): Promise<WalletMeta[]> {
    const json = await AsyncStorage.getItem(KEY_WALLETS);
    const all: WalletMeta[] = json ? JSON.parse(json) : [];
    const current = all.filter(belongsToCurrentNetwork);
    return profile ? current.filter((w) => w.profile === profile) : current;
  },

  async add(meta: WalletMeta): Promise<void> {
    const all = await this.list();
    all.push(meta);
    await AsyncStorage.setItem(KEY_WALLETS, JSON.stringify(all));
  },

  async remove(id: string): Promise<void> {
    const all = (await this.list()).filter((w) => w.id !== id);
    await AsyncStorage.setItem(KEY_WALLETS, JSON.stringify(all));
  },

  async markBackupVerified(id: string): Promise<void> {
    const all = await this.list();
    const wallet = all.find((w) => w.id === id);
    if (!wallet) throw new Error("Cüzdan kaydı bulunamadı.");
    wallet.backupVerified = true;
    await AsyncStorage.setItem(KEY_WALLETS, JSON.stringify(all));
  },

  async markFullScanComplete(id: string): Promise<number> {
    const all = await this.list();
    const wallet = all.find((w) => w.id === id);
    if (!wallet) throw new Error("Cüzdan kaydı bulunamadı.");
    const completedAt = Date.now();
    wallet.lastFullScanAt = completedAt;
    await AsyncStorage.setItem(KEY_WALLETS, JSON.stringify(all));
    return completedAt;
  },

  async getEsploraUrl(): Promise<string | null> {
    return AsyncStorage.getItem(KEY_SERVER);
  },

  async setEsploraUrl(url: string): Promise<void> {
    await AsyncStorage.setItem(KEY_SERVER, url);
  },

  async getEsploraMode(): Promise<EsploraMode> {
    return (await AsyncStorage.getItem(KEY_SERVER_MODE)) === "manual" ? "manual" : "automatic";
  },

  async setEsploraMode(mode: EsploraMode): Promise<void> {
    await AsyncStorage.setItem(KEY_SERVER_MODE, mode);
  },

  async getCustomEsploraServers(): Promise<EsploraServer[]> {
    try {
      const json = await AsyncStorage.getItem(KEY_CUSTOM_SERVERS);
      const servers = json ? (JSON.parse(json) as EsploraServer[]) : [];
      return servers.filter(
        (server) => server.custom === true && typeof server.name === "string" && typeof server.baseUrl === "string",
      );
    } catch {
      return [];
    }
  },

  async addCustomEsploraServer(server: EsploraServer): Promise<void> {
    const custom = (await this.getCustomEsploraServers()).filter((item) => item.baseUrl !== server.baseUrl);
    custom.push({ ...server, custom: true });
    await AsyncStorage.setItem(KEY_CUSTOM_SERVERS, JSON.stringify(custom.slice(-5)));
  },

  async removeCustomEsploraServer(baseUrl: string): Promise<void> {
    const custom = (await this.getCustomEsploraServers()).filter((server) => server.baseUrl !== baseUrl);
    await AsyncStorage.setItem(KEY_CUSTOM_SERVERS, JSON.stringify(custom));
    if ((await this.getEsploraUrl()) === baseUrl) {
      await this.setEsploraUrl(APP_CONFIG.esploraServers[0].baseUrl);
    }
  },

  async setLastActiveEsploraUrl(url: string): Promise<void> {
    await AsyncStorage.setItem(KEY_ACTIVE_SERVER, url);
  },

  async getLastActiveEsploraUrl(): Promise<string | null> {
    return AsyncStorage.getItem(KEY_ACTIVE_SERVER);
  },

  async getBalanceUnit(): Promise<BalanceUnit> {
    return (await AsyncStorage.getItem(KEY_BALANCE_UNIT)) === "sat" ? "sat" : "btc";
  },

  async setBalanceUnit(unit: BalanceUnit): Promise<void> {
    await AsyncStorage.setItem(KEY_BALANCE_UNIT, unit);
  },

  /** Anti-phishing: daha önce gönderilen adresler (address-poisoning karşılaştırması için). */
  async knownRecipients(): Promise<string[]> {
    const json = await AsyncStorage.getItem(KEY_KNOWN_RECIPIENTS);
    return json ? JSON.parse(json) : [];
  },

  async addKnownRecipient(address: string): Promise<void> {
    const all = await this.knownRecipients();
    if (!all.includes(address)) {
      all.push(address);
      await AsyncStorage.setItem(KEY_KNOWN_RECIPIENTS, JSON.stringify(all.slice(-200)));
    }
  },
};
