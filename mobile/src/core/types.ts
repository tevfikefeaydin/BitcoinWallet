export type AddressKind = "taproot" | "segwit";
export type BitcoinNetworkName = "mainnet" | "testnet";
export type BalanceUnit = "btc" | "sat";
export type EsploraMode = "automatic" | "manual";

/** Hangi PIN ile açıldığına göre görünen cüzdan kümesi (Unstoppable duress mode). */
export type Profile = "main" | "duress";

export interface WalletMeta {
  id: string;
  name: string;
  addressKind: AddressKind;
  /** true ise yalnızca izleme: cihazda özel anahtar yok */
  watchOnly: boolean;
  profile: Profile;
  createdAt: number;
  /** Eski kayıtlarda yoksa testnet kabul edilir. */
  network?: BitcoinNetworkName;
  /** Yeni cüzdanlarda kurtarma ifadesinin kullanıcı tarafından doğrulandığını gösterir. */
  backupVerified?: boolean;
  /** İlk kapsamlı adres taramasından sonra artımlı senkronizasyona geçmek için. */
  lastFullScanAt?: number;
}

export interface TxItem {
  txid: string;
  receivedSat: number;
  sentSat: number;
  feeSat?: number;
  confirmed: boolean;
  timestamp?: number;
}

export interface EsploraServer {
  name: string;
  baseUrl: string;
  custom?: boolean;
}

export interface EsploraHealth {
  baseUrl: string;
  healthy: boolean;
  checkedAt: number;
  latencyMs: number;
  height?: number;
  error?: string;
}

export interface FiatQuote {
  usd: number;
  source: string;
  fetchedAt: number;
  stale: boolean;
}

export const AUTO_LOCK_SECONDS = 60;
