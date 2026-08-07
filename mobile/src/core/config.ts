import { NativeModules, Platform } from "react-native";
import { Network, NetworkKind } from "bdk-rn";
import type { BitcoinNetworkName, EsploraServer } from "./types";

type KdfNativeModule = {
  bitcoinNetwork?: string;
  getWalletDatabasePath?(walletId: string): Promise<string>;
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
});

export async function walletDatabasePath(walletId: string): Promise<string | null> {
  if (Platform.OS !== "android" || !native?.getWalletDatabasePath) return null;
  return native.getWalletDatabasePath(walletId);
}
