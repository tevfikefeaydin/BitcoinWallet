import { NativeModules } from "react-native";
import { Network, NetworkKind } from "bdk-rn";
import type { BitcoinNetworkName, EsploraServer } from "./types";

// Android: KdfModule.kt · iOS: ios/BTCWalletMobile/KdfModule.m — aynı arayüz.
type KdfNativeModule = {
  bitcoinNetwork?: string;
  /** Yalnızca iOS: simülatörde Secure Enclave bulunmaz. */
  isSimulator?: boolean;
  getWalletDatabasePath?(walletId: string): Promise<string>;
  /** Yalnızca iOS: kurulum başına bir kez true döner. */
  consumeFreshInstallFlag?(): Promise<boolean>;
};

const native = NativeModules.Kdf as KdfNativeModule | undefined;

// Native yapılandırma bulunamadığında güvenli tarafta kal: hiçbir zaman kendiliğinden
// gerçek paranın kullanıldığı ağa geçme.
const networkName: BitcoinNetworkName = native?.bitcoinNetwork === "mainnet" ? "mainnet" : "testnet";
const isMainnet = networkName === "mainnet";

const mainnetServers: EsploraServer[] = [
  { name: "mempool.space", baseUrl: "https://mempool.space/api" },
  { name: "Blockstream", baseUrl: "https://blockstream.info/api" },
];

const testnetServers: EsploraServer[] = [
  { name: "mempool.space", baseUrl: "https://mempool.space/testnet/api" },
  { name: "Blockstream", baseUrl: "https://blockstream.info/testnet/api" },
];

export const APP_CONFIG = Object.freeze({
  networkName,
  isMainnet,
  bdkNetwork: isMainnet ? Network.Bitcoin : Network.Testnet,
  bdkNetworkKind: isMainnet ? NetworkKind.Main : NetworkKind.Test,
  networkLabel: isMainnet ? "MAINNET" : "TESTNET",
  ticker: isMainnet ? "BTC" : "tBTC",
  addressPlaceholder: isMainnet ? "bc1…" : "tb1…",
  esploraServers: isMainnet ? mainnetServers : testnetServers,
  txExplorerBase: isMainnet ? "https://mempool.space/tx/" : "https://mempool.space/testnet/tx/",
  // Eski testnet kurulumları geriye dönük uyumlu kalır; mainnet hiçbir anahtarı paylaşmaz.
  storagePrefix: isMainnet ? "btcwallet.mainnet" : "btcwallet",
  isSimulator: native?.isSimulator === true,
});

export async function walletDatabasePath(walletId: string): Promise<string | null> {
  if (!native?.getWalletDatabasePath) return null;
  return native.getWalletDatabasePath(walletId);
}

/** iOS'ta uygulamanın bu kurulumdaki ilk açılışı mı? Diğer platformlarda her zaman false. */
export async function consumeFreshInstallFlag(): Promise<boolean> {
  if (!native?.consumeFreshInstallFlag) return false;
  return (await native.consumeFreshInstallFlag()) === true;
}
