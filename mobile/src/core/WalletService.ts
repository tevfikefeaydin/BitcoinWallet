import {
  Address,
  Amount,
  ChainPosition,
  Descriptor,
  DescriptorSecretKey,
  EsploraClient,
  FeeRate,
  KeychainKind,
  Mnemonic,
  Persister,
  TxBuilder,
  Wallet,
  WordCount,
} from "bdk-rn";
import type {
  DescriptorInterface,
  PersisterInterface,
  PsbtInterface,
  WalletInterface,
} from "bdk-rn";
import { APP_CONFIG, walletDatabasePath } from "./config";
import { checkEsploraServer, esploraCandidates } from "./EsploraService";
import { SecureVault } from "./SecureVault";
import { WalletStore } from "./WalletStore";
import type { AddressKind, Profile, TxItem, WalletMeta } from "./types";

export interface FeeChoices {
  fastSatVb: number;
  normalSatVb: number;
  slowSatVb: number;
}

export interface PreparedSend {
  psbt: PsbtInterface;
  toAddress: string;
  amountSat: number;
  feeRateSatVb: number;
  feeSat: number;
  sendAll: boolean;
}

export interface ReceiveAddressInfo {
  address: string;
  index: number;
  unusedCount: number;
  unusedLimit: number;
}

export const MAX_UNUSED_RECEIVE_ADDRESSES = 20;

function toSafeNumber(value: bigint, label: string): number {
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue)) throw new Error(`${label} güvenli sayı aralığını aşıyor.`);
  return numberValue;
}

function newWalletId(): string {
  return `w${Date.now().toString(36)}`;
}

async function withEsploraClient<T>(
  operationName: string,
  operation: (client: EsploraClient) => Promise<T> | T,
): Promise<T> {
  const failures: string[] = [];
  for (const server of await esploraCandidates()) {
    const health = await checkEsploraServer(server);
    if (!health.healthy) {
      failures.push(`${server.name}: ${health.error ?? "erişilemiyor"}`);
      continue;
    }
    try {
      const result = await operation(new EsploraClient(server.baseUrl));
      await WalletStore.setLastActiveEsploraUrl(server.baseUrl);
      return result;
    } catch (error) {
      failures.push(`${server.name}: ${(error as Error).message || "işlem başarısız"}`);
    }
  }
  throw new Error(`${operationName} için sağlıklı Esplora sunucusu bulunamadı. ${failures.join(" · ")}`);
}

function descriptorsFromMnemonic(
  mnemonicStr: string,
  kind: AddressKind,
): { external: DescriptorInterface; internal: DescriptorInterface } {
  const mnemonic = Mnemonic.fromString(mnemonicStr);
  const secretKey = new DescriptorSecretKey(APP_CONFIG.bdkNetworkKind, mnemonic, undefined);
  const make = (keychain: KeychainKind) =>
    kind === "taproot"
      ? Descriptor.newBip86(secretKey, keychain, APP_CONFIG.bdkNetworkKind)
      : Descriptor.newBip84(secretKey, keychain, APP_CONFIG.bdkNetworkKind);
  return { external: make(KeychainKind.External), internal: make(KeychainKind.Internal) };
}

async function createMeta(
  name: string,
  kind: AddressKind,
  profile: Profile,
  watchOnly: boolean,
  backupVerified: boolean,
): Promise<WalletMeta> {
  const meta: WalletMeta = {
    id: newWalletId(),
    name: name.trim() || "Cüzdanım",
    addressKind: kind,
    watchOnly,
    profile,
    createdAt: Date.now(),
    network: APP_CONFIG.networkName,
    backupVerified,
  };
  return meta;
}

export class WalletEngine {
  private wallet!: WalletInterface;
  private persister!: PersisterInterface;
  meta!: WalletMeta;

  /** Entropi BDK'nin native Rust katmanında üretilir. */
  static async createNew(
    name: string,
    kind: AddressKind,
    profile: Profile,
  ): Promise<{ engine: WalletEngine; mnemonic: string }> {
    const mnemonic = new Mnemonic(WordCount.Words12).toString();
    const meta = await createMeta(name, kind, profile, false, false);
    await SecureVault.saveMnemonic(meta.id, mnemonic);
    await WalletStore.add(meta);
    try {
      return { engine: await WalletEngine.open(meta), mnemonic };
    } catch (error) {
      await WalletStore.remove(meta.id);
      await SecureVault.deleteMnemonic(meta.id);
      throw error;
    }
  }

  static async restore(
    name: string,
    mnemonicStr: string,
    kind: AddressKind,
    profile: Profile,
  ): Promise<WalletEngine> {
    const normalized = mnemonicStr.trim().toLowerCase().replace(/\s+/g, " ");
    Mnemonic.fromString(normalized);

    for (const existing of await WalletStore.list()) {
      const secret = await SecureVault.getMnemonic(existing.id);
      if (secret === normalized && existing.addressKind === kind && existing.profile === profile) {
        return WalletEngine.open(existing);
      }
    }

    const meta = await createMeta(name, kind, profile, false, true);
    await SecureVault.saveMnemonic(meta.id, normalized);
    await WalletStore.add(meta);
    try {
      return await WalletEngine.open(meta);
    } catch (error) {
      await WalletStore.remove(meta.id);
      await SecureVault.deleteMnemonic(meta.id);
      throw error;
    }
  }

  /** Watch-only cüzdan yalnızca public descriptor tutar; cihazda özel anahtar bulunmaz. */
  static async addWatchOnly(name: string, descriptorStr: string, profile: Profile): Promise<WalletEngine> {
    const normalized = descriptorStr.trim();
    const descriptor = new Descriptor(normalized, APP_CONFIG.bdkNetworkKind);
    descriptor.sanityCheck();
    const meta = await createMeta(
      name || "İzleme",
      normalized.startsWith("tr(") ? "taproot" : "segwit",
      profile,
      true,
      true,
    );
    await SecureVault.saveMnemonic(meta.id, `DESC:${normalized}`);
    await WalletStore.add(meta);
    try {
      return await WalletEngine.open(meta);
    } catch (error) {
      await WalletStore.remove(meta.id);
      await SecureVault.deleteMnemonic(meta.id);
      throw error;
    }
  }

  static async open(meta: WalletMeta): Promise<WalletEngine> {
    const walletNetwork = meta.network ?? "testnet";
    if (walletNetwork !== APP_CONFIG.networkName) {
      throw new Error(`${walletNetwork} cüzdanı ${APP_CONFIG.networkLabel} sürümünde açılamaz.`);
    }

    const engine = new WalletEngine();
    engine.meta = { ...meta, network: walletNetwork };
    const secret = await SecureVault.getMnemonic(meta.id);
    if (!secret) throw new Error("Cüzdan sırrı bulunamadı.");

    const path = await walletDatabasePath(meta.id);
    engine.persister = path ? Persister.newSqlite(path) : Persister.newInMemory();

    if (secret.startsWith("DESC:")) {
      const descriptor = new Descriptor(secret.slice(5), APP_CONFIG.bdkNetworkKind);
      descriptor.sanityCheck();
      try {
        engine.wallet = Wallet.loadSingle(descriptor, engine.persister);
      } catch {
        engine.wallet = Wallet.createSingle(descriptor, APP_CONFIG.bdkNetwork, engine.persister);
      }
    } else {
      const { external, internal } = descriptorsFromMnemonic(secret, meta.addressKind);
      try {
        engine.wallet = Wallet.load(external, internal, engine.persister);
      } catch {
        engine.wallet = new Wallet(external, internal, APP_CONFIG.bdkNetwork, engine.persister);
      }
    }

    if (engine.wallet.network() !== APP_CONFIG.bdkNetwork) {
      throw new Error("Kalıcı cüzdan verisi yanlış Bitcoin ağına ait.");
    }
    return engine;
  }

  async markBackupVerified(): Promise<void> {
    await WalletStore.markBackupVerified(this.meta.id);
    this.meta.backupVerified = true;
  }

  async sync(): Promise<void> {
    const update = await withEsploraClient("Senkronizasyon", (client) =>
      this.meta.lastFullScanAt
        ? client.sync(this.wallet.startSyncWithRevealedSpks().build(), 4n)
        : client.fullScan(this.wallet.startFullScan().build(), 20n, 4n),
    );
    this.wallet.applyUpdate(update);
    this.wallet.persist(this.persister);
    if (!this.meta.lastFullScanAt) {
      this.meta.lastFullScanAt = await WalletStore.markFullScanComplete(this.meta.id);
    }
  }

  async balance(): Promise<{ confirmedSat: number; pendingSat: number; totalSat: number }> {
    const balance = this.wallet.balance();
    return {
      confirmedSat: toSafeNumber(balance.confirmed.toSat(), "Onaylı bakiye"),
      pendingSat: toSafeNumber(
        balance.trustedPending.toSat() + balance.untrustedPending.toSat(),
        "Bekleyen bakiye",
      ),
      totalSat: toSafeNumber(balance.total.toSat(), "Toplam bakiye"),
    };
  }

  async receiveAddress(fresh: boolean): Promise<ReceiveAddressInfo> {
    const unusedBefore = this.wallet.listUnusedAddresses(KeychainKind.External);
    if (fresh && unusedBefore.length >= MAX_UNUSED_RECEIVE_ADDRESSES) {
      throw new Error(
        `${MAX_UNUSED_RECEIVE_ADDRESSES} kullanılmamış alma adresi sınırına ulaşıldı. Yeni adres açmadan önce mevcut adreslerden birini kullanın.`,
      );
    }
    const info = fresh
      ? this.wallet.revealNextAddress(KeychainKind.External)
      : this.wallet.nextUnusedAddress(KeychainKind.External);
    this.wallet.persist(this.persister);
    return {
      address: info.address.toString(),
      index: info.index,
      unusedCount: this.wallet.listUnusedAddresses(KeychainKind.External).length,
      unusedLimit: MAX_UNUSED_RECEIVE_ADDRESSES,
    };
  }

  async transactions(): Promise<TxItem[]> {
    return this.wallet
      .transactions()
      .map((canonical) => {
        const txid = canonical.transaction.computeTxid();
        const details = this.wallet.txDetails(txid);
        const amounts = details ?? this.wallet.sentAndReceived(canonical.transaction);
        const confirmed = ChainPosition.Confirmed.instanceOf(canonical.chainPosition);
        let timestamp: number | undefined;
        if (ChainPosition.Confirmed.instanceOf(canonical.chainPosition)) {
          timestamp = toSafeNumber(
            canonical.chainPosition.inner.confirmationBlockTime.confirmationTime,
            "İşlem zamanı",
          );
        } else if (canonical.chainPosition.inner.timestamp !== undefined) {
          timestamp = toSafeNumber(canonical.chainPosition.inner.timestamp, "İşlem zamanı");
        }
        return {
          txid: txid.toString(),
          receivedSat: toSafeNumber(amounts.received.toSat(), "Alınan miktar"),
          sentSat: toSafeNumber(amounts.sent.toSat(), "Gönderilen miktar"),
          feeSat: details?.fee ? toSafeNumber(details.fee.toSat(), "İşlem ücreti") : undefined,
          confirmed,
          timestamp,
        };
      })
      .sort((a, b) => (b.timestamp ?? Infinity) - (a.timestamp ?? Infinity) || b.txid.localeCompare(a.txid));
  }

  async feeEstimates(): Promise<FeeChoices> {
    const estimates = await withEsploraClient("Ücret tahmini", (client) => client.getFeeEstimates());
    const at = (target: number, fallback: number) => {
      const exact = estimates.get(target);
      if (exact !== undefined && Number.isFinite(exact)) return Math.max(1, Math.ceil(exact));
      const nearest = [...estimates.entries()]
        .filter(([, value]) => Number.isFinite(value))
        .sort(([a], [b]) => Math.abs(a - target) - Math.abs(b - target))[0]?.[1];
      return Math.max(1, Math.ceil(nearest ?? fallback));
    };
    return { fastSatVb: at(1, 5), normalSatVb: at(6, 3), slowSatVb: at(144, 1) };
  }

  async prepareSend(
    toAddress: string,
    amountSat: number,
    feeRateSatVb: number,
    sendAll = false,
  ): Promise<PreparedSend> {
    if (this.meta.watchOnly) throw new Error("Watch-only cüzdandan gönderim yapılamaz.");
    if (APP_CONFIG.isMainnet && !this.meta.backupVerified) {
      throw new Error("Kurtarma ifadesi doğrulanmadan mainnet gönderimi yapılamaz.");
    }
    if (!sendAll && (!Number.isSafeInteger(amountSat) || amountSat <= 0)) {
      throw new Error("Miktar pozitif bir tam satoshi değeri olmalı.");
    }
    if (!Number.isSafeInteger(feeRateSatVb) || feeRateSatVb <= 0 || feeRateSatVb > 10_000) {
      throw new Error("Ücret oranı 1–10000 sat/vB arasında olmalı.");
    }

    const normalizedAddress = toAddress.trim();
    let address: Address;
    try {
      address = new Address(normalizedAddress, APP_CONFIG.bdkNetwork);
    } catch {
      throw new Error(`Yalnızca geçerli Bitcoin ${APP_CONFIG.networkLabel} adresi kullanılabilir.`);
    }
    if (!address.isValidForNetwork(APP_CONFIG.bdkNetwork)) {
      throw new Error(`Adres ${APP_CONFIG.networkLabel} ağına ait değil.`);
    }

    const builder = new TxBuilder();
    const recipientScript = address.scriptPubkey();
    if (sendAll) {
      builder.drainWallet();
      builder.drainTo(recipientScript);
    } else {
      builder.addRecipient(recipientScript, Amount.fromSat(BigInt(amountSat)));
    }
    builder.feeRate(FeeRate.fromSatPerVb(BigInt(feeRateSatVb)));
    // Sıfır onaylı girdileri varsayılan olarak harcama ve işlemi BIP-125 RBF uyumlu oluştur.
    builder.excludeUnconfirmed();
    builder.setExactSequence(0xfffffffd);
    const psbt = builder.finish(this.wallet);
    // TxBuilder değişiklik adresi türetebilir. Kullanıcı onay ekranından vazgeçse bile
    // aynı değişiklik adresinin daha sonra tekrar kullanılmaması için staged durumu kalıcılaştır.
    this.wallet.persist(this.persister);
    const feeSat = toSafeNumber(psbt.fee(), "Ağ ücreti");
    let resolvedAmountSat = amountSat;
    if (sendAll) {
      const target = new Uint8Array(recipientScript.toBytes());
      const sameScript = (candidate: ArrayBuffer) => {
        const bytes = new Uint8Array(candidate);
        return bytes.length === target.length && bytes.every((value, index) => value === target[index]);
      };
      resolvedAmountSat = psbt.extractTx().output().reduce(
        (total, output) =>
          sameScript(output.scriptPubkey.toBytes())
            ? total + toSafeNumber(output.value.toSat(), "Gönderim miktarı")
            : total,
        0,
      );
      if (resolvedAmountSat <= 0) throw new Error("Tüm bakiye gönderimi için harcanabilir onaylı bakiye yok.");
    }
    if (feeSat > Math.max(resolvedAmountSat, 1_000_000)) {
      throw new Error("Ağ ücreti güvenlik sınırını aşıyor; ücret oranını ve miktarı kontrol edin.");
    }
    return {
      psbt,
      toAddress: normalizedAddress,
      amountSat: resolvedAmountSat,
      feeRateSatVb,
      feeSat,
      sendAll,
    };
  }

  async broadcastPrepared(prepared: PreparedSend): Promise<string> {
    if (this.meta.watchOnly) throw new Error("Watch-only cüzdandan gönderim yapılamaz.");
    const finalized = this.wallet.sign(prepared.psbt, {
      trustWitnessUtxo: false,
      assumeHeight: undefined,
      allowAllSighashes: false,
      tryFinalize: true,
      signWithTapInternalKey: true,
      allowGrinding: true,
    });
    if (!finalized) throw new Error("İşlem imzalandı ancak tamamlanamadı; yayın yapılmadı.");
    const tx = prepared.psbt.extractTx();
    await withEsploraClient("İşlem yayını", (client) => client.broadcast(tx));
    await WalletStore.addKnownRecipient(prepared.toAddress);
    return tx.computeTxid().toString();
  }
}
