// Cüzdan çekirdeği: BDK (WASM) + BIP39. Tüm işlemler testnet üzerindedir.
// Mnemonic, Web Crypto AES-GCM ile parola tabanlı bir anahtar kullanılarak şifreli saklanır.
import {
  Address,
  Amount,
  ChangeSet,
  EsploraClient,
  FeeRate,
  Recipient,
  SignOptions,
  Wallet,
  seed_to_descriptor,
} from "@bitcoindevkit/bdk-wallet-web";
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

const NETWORK = "testnet" as const;
const ESPLORA_URL = "https://mempool.space/testnet/api";
const LS_VAULT = "btcwallet.vault";
const LS_LEGACY_MNEMONIC = "btcwallet.mnemonic";
const LS_CHANGESET = "btcwallet.changeset";
const LS_ADDRTYPE = "btcwallet.addrtype";

export type WalletAddressType = "p2wpkh" | "p2tr";

export interface FeeChoices {
  fastSatVb: number;
  normalSatVb: number;
  slowSatVb: number;
}

export interface TxSummary {
  txid: string;
  confirmed: boolean;
  sentSat: bigint;
  receivedSat: bigint;
  feeSat: bigint | null;
}

interface VaultRecord {
  version: 1;
  iterations: number;
  salt: number[];
  iv: number[];
  ciphertext: number[];
}

const VAULT_ITERATIONS = 600_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function vaultKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptMnemonic(mnemonic: string, passphrase: string): Promise<string> {
  if (passphrase.length < 8) throw new Error("Şifreleme parolası en az 8 karakter olmalı.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await vaultKey(passphrase, salt, VAULT_ITERATIONS);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(mnemonic)));
  const record: VaultRecord = {
    version: 1,
    iterations: VAULT_ITERATIONS,
    salt: Array.from(salt),
    iv: Array.from(iv),
    ciphertext: Array.from(ciphertext),
  };
  return JSON.stringify(record);
}

async function decryptMnemonic(json: string, passphrase: string): Promise<string> {
  try {
    const record = JSON.parse(json) as VaultRecord;
    if (record.version !== 1) throw new Error("unsupported vault");
    const key = await vaultKey(passphrase, new Uint8Array(record.salt), record.iterations);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(record.iv) },
      key,
      new Uint8Array(record.ciphertext),
    );
    return decoder.decode(plaintext);
  } catch {
    throw new Error("Parola yanlış veya şifreli cüzdan kaydı bozuk.");
  }
}

export class WalletService {
  private wallet!: Wallet;
  private client = new EsploraClient(ESPLORA_URL, 3);
  private fullScanDone = false;
  addressType: WalletAddressType = "p2tr";

  get exists(): boolean {
    return localStorage.getItem(LS_VAULT) !== null || localStorage.getItem(LS_LEGACY_MNEMONIC) !== null;
  }

  get needsMigration(): boolean {
    return localStorage.getItem(LS_VAULT) === null && localStorage.getItem(LS_LEGACY_MNEMONIC) !== null;
  }

  async createNew(addressType: WalletAddressType, passphrase: string): Promise<string> {
    const mnemonic = generateMnemonic(wordlist, 128);
    this.addressType = addressType;
    this.initFromMnemonic(mnemonic, true);
    localStorage.setItem(LS_VAULT, await encryptMnemonic(mnemonic, passphrase));
    return mnemonic;
  }

  async restore(mnemonic: string, addressType: WalletAddressType, passphrase: string): Promise<void> {
    const normalized = mnemonic.trim().toLowerCase().replace(/\s+/g, " ");
    if (!validateMnemonic(normalized, wordlist)) {
      throw new Error("Geçersiz mnemonic: 12 kelimeyi kontrol edin.");
    }
    this.addressType = addressType;
    this.initFromMnemonic(normalized, true);
    localStorage.setItem(LS_VAULT, await encryptMnemonic(normalized, passphrase));
  }

  async loadExisting(passphrase: string): Promise<void> {
    const encrypted = localStorage.getItem(LS_VAULT);
    const legacy = localStorage.getItem(LS_LEGACY_MNEMONIC);
    if (!encrypted && !legacy) throw new Error("Kayıtlı cüzdan yok.");
    const mnemonic = encrypted ? await decryptMnemonic(encrypted, passphrase) : legacy!;
    this.addressType = (localStorage.getItem(LS_ADDRTYPE) as WalletAddressType) ?? "p2wpkh";
    this.initFromMnemonic(mnemonic, false);
    if (!encrypted) {
      localStorage.setItem(LS_VAULT, await encryptMnemonic(mnemonic, passphrase));
      localStorage.removeItem(LS_LEGACY_MNEMONIC);
    }
  }

  private initFromMnemonic(mnemonic: string, fresh: boolean): void {
    const seed = mnemonicToSeedSync(mnemonic);
    let desc: ReturnType<typeof seed_to_descriptor>;
    try {
      desc = seed_to_descriptor(seed, NETWORK, this.addressType);
    } finally {
      seed.fill(0);
    }

    if (fresh) localStorage.removeItem(LS_CHANGESET);

    const savedChangeset = fresh ? null : localStorage.getItem(LS_CHANGESET);
    if (savedChangeset) {
      this.wallet = Wallet.load(ChangeSet.from_json(savedChangeset), desc.external, desc.internal);
      this.fullScanDone = true;
    } else {
      this.wallet = Wallet.create(NETWORK, desc.external, desc.internal);
    }

    localStorage.setItem(LS_ADDRTYPE, this.addressType);
    this.persist();
  }

  forget(): void {
    localStorage.removeItem(LS_VAULT);
    localStorage.removeItem(LS_LEGACY_MNEMONIC);
    localStorage.removeItem(LS_CHANGESET);
    localStorage.removeItem(LS_ADDRTYPE);
  }

  private persist(): void {
    const staged = this.wallet.take_staged();
    if (!staged) return;
    const saved = localStorage.getItem(LS_CHANGESET);
    if (saved) {
      const merged = ChangeSet.from_json(saved);
      merged.merge(staged);
      localStorage.setItem(LS_CHANGESET, merged.to_json());
    } else {
      localStorage.setItem(LS_CHANGESET, staged.to_json());
    }
  }

  async sync(): Promise<void> {
    if (!this.fullScanDone) {
      const update = await this.client.full_scan(this.wallet.start_full_scan(), 20, 4);
      this.wallet.apply_update(update);
      this.fullScanDone = true;
    } else {
      const update = await this.client.sync(this.wallet.start_sync_with_revealed_spks(), 4);
      this.wallet.apply_update(update);
    }
    this.persist();
  }

  get balance() {
    const b = this.wallet.balance;
    return {
      confirmedSat: b.confirmed.to_sat(),
      pendingSat: b.trusted_pending.to_sat() + b.untrusted_pending.to_sat(),
      totalSat: b.total.to_sat(),
    };
  }

  receiveAddress(): string {
    const info = this.wallet.next_unused_address("external");
    this.persist();
    return info.address.toString();
  }

  newAddress(): string {
    const info = this.wallet.reveal_next_address("external");
    this.persist();
    return info.address.toString();
  }

  transactions(): TxSummary[] {
    return this.wallet
      .transactions()
      .map((wtx) => {
        const sr = this.wallet.sent_and_received(wtx.tx);
        let feeSat: bigint | null = null;
        try {
          feeSat = this.wallet.calculate_fee(wtx.tx).to_sat();
        } catch {
          // fee hesaplanamazsa (eksik prev-out) boş bırak
        }
        return {
          txid: wtx.txid.toString(),
          confirmed: wtx.chain_position.is_confirmed,
          sentSat: sr[0].to_sat(),
          receivedSat: sr[1].to_sat(),
          feeSat,
        };
      })
      .reverse();
  }

  /** Hızlı ~1 blok, normal ~6 blok, yavaş ~144 blok hedefli sat/vB tahminleri. */
  async feeEstimates(): Promise<FeeChoices> {
    const est = await this.client.get_fee_estimates();
    return {
      fastSatVb: Math.max(1, Math.ceil(est.get(1) ?? 2)),
      normalSatVb: Math.max(1, Math.ceil(est.get(6) ?? 1)),
      slowSatVb: Math.max(1, Math.ceil(est.get(144) ?? 1)),
    };
  }

  async send(toAddress: string, amountSat: bigint, feeRateSatVb: bigint): Promise<string> {
    const to = Address.from_string(toAddress.trim(), NETWORK);
    const psbt = this.wallet
      .build_tx()
      .add_recipient(Recipient.from_address(to, Amount.from_sat(amountSat)))
      .fee_rate(new FeeRate(feeRateSatVb))
      .finish();

    const signed = this.wallet.sign(psbt, new SignOptions());
    if (!signed) throw new Error("İmzalama tamamlanamadı.");

    const tx = psbt.extract_tx();
    await this.client.broadcast(tx);
    const txid = tx.compute_txid().toString();
    this.persist();
    return txid;
  }
}
