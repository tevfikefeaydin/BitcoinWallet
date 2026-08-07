// PIN yönetimi (Unstoppable Wallet modeli):
// - Ana PIN gerçek cüzdan profilini açar.
// - Opsiyonel "duress PIN" sahte (decoy) profili açar; zorlama altında
//   girildiğinde saldırgan yalnızca decoy cüzdanları görür.
// Türetme: native PBKDF2-SHA256 (KdfModule.kt) + rastgele tuz; düz PIN hiçbir yerde tutulmaz.
import "react-native-get-random-values";
import { NativeModules } from "react-native";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, randomBytes } from "@noble/hashes/utils.js";
import { SecureVault } from "./SecureVault";
import type { Profile } from "./types";
import { WalletStore } from "./WalletStore";

// PBKDF2-HMAC-SHA256 için yüksek iş faktörü; native tarafta cihaz hızına göre birkaç yüz ms sürer.
const CURRENT_ITERATIONS = 600_000;
// Eski kayıtlar saf-JS döneminden 2.000 iterasyonla türetildi (göç için okunur).
const LEGACY_ITERATIONS = 2_000;
const MAX_ATTEMPTS = 5;

interface PinRecord {
  saltHex: string;
  mainHashHex: string;
  duressHashHex?: string;
  failedAttempts: number;
  /** Bu kaydın hash'lerinin türetildiği PBKDF2 iterasyon sayısı. Eski kayıtlarda yok. */
  iterations?: number;
}

const Kdf = NativeModules.Kdf as
  | { pbkdf2Sha256(password: string, saltHex: string, iterations: number, dkLenBytes: number): Promise<string> }
  | undefined;

async function derive(pin: string, saltHex: string, iterations: number): Promise<string> {
  if (Kdf?.pbkdf2Sha256) return Kdf.pbkdf2Sha256(pin, saltHex, iterations, 32);

  // iOS ve native modülün bulunmadığı ortamlarda güvenli, asenkron yedek yol.
  // asyncTick arayüzün uzun türetme sırasında tamamen donmasını önler.
  const key = await pbkdf2Async(sha256, pin, hexToBytes(saltHex), {
    c: iterations,
    dkLen: 32,
    asyncTick: 8,
  });
  return bytesToHex(key);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let same = 1;
  for (let i = 0; i < a.length; i++) same *= Number(a.charCodeAt(i) === b.charCodeAt(i));
  return same === 1;
}

function assertValidPin(pin: string): void {
  if (!/^\d{6,8}$/.test(pin)) throw new Error("PIN 6-8 haneli ve yalnızca rakamlardan oluşmalı.");
}

export const PinManager = {
  async isConfigured(): Promise<boolean> {
    return (await SecureVault.getPinRecord()) !== null;
  },

  async setPin(pin: string): Promise<void> {
    assertValidPin(pin);
    const saltHex = bytesToHex(randomBytes(16));
    const record: PinRecord = {
      saltHex,
      mainHashHex: await derive(pin, saltHex, CURRENT_ITERATIONS),
      failedAttempts: 0,
      iterations: CURRENT_ITERATIONS,
    };
    await SecureVault.savePinRecord(JSON.stringify(record));
  },

  async setDuressPin(duressPin: string): Promise<void> {
    assertValidPin(duressPin);
    const record = await this.getRecord();
    if (!record) throw new Error("Önce ana PIN belirlenmeli.");
    const iterations = record.iterations ?? LEGACY_ITERATIONS;
    const hash = await derive(duressPin, record.saltHex, iterations);
    if (constantTimeEqual(hash, record.mainHashHex)) throw new Error("Duress PIN ana PIN ile aynı olamaz.");
    record.duressHashHex = hash;
    await SecureVault.savePinRecord(JSON.stringify(record));
  },

  /**
   * PIN doğrulaması. Dönen profil hangi cüzdan kümesinin gösterileceğini belirler.
   * MAX_ATTEMPTS aşılırsa kalıcı olarak kilitlenir (kurtarma ifadesiyle sıfırlama gerekir).
   * Eski (düşük iterasyonlu) kayıtlar, duress PIN tanımlı değilse başarılı ana PIN
   * girişinde sessizce CURRENT_ITERATIONS'a yükseltilir.
   */
  async verify(pin: string): Promise<Profile | "locked" | null> {
    const record = await this.getRecord();
    if (!record) return null;
    if (record.failedAttempts >= MAX_ATTEMPTS) return "locked";

    const iterations = record.iterations ?? LEGACY_ITERATIONS;
    const hash = await derive(pin, record.saltHex, iterations);

    if (constantTimeEqual(hash, record.mainHashHex)) {
      record.failedAttempts = 0;
      // İterasyon göçü: duress hash'i duress PIN'i bilmeden yeniden türetilemeyeceği
      // için yükseltme yalnızca duress tanımlı değilken yapılır.
      if (iterations < CURRENT_ITERATIONS && !record.duressHashHex) {
        const saltHex = bytesToHex(randomBytes(16));
        record.saltHex = saltHex;
        record.mainHashHex = await derive(pin, saltHex, CURRENT_ITERATIONS);
        record.iterations = CURRENT_ITERATIONS;
      }
      await SecureVault.savePinRecord(JSON.stringify(record));
      return "main";
    }
    if (record.duressHashHex && constantTimeEqual(hash, record.duressHashHex)) {
      record.failedAttempts = 0;
      await SecureVault.savePinRecord(JSON.stringify(record));
      return "duress";
    }
    record.failedAttempts += 1;
    await SecureVault.savePinRecord(JSON.stringify(record));
    return null;
  },

  async remainingAttempts(): Promise<number> {
    const record = await this.getRecord();
    if (!record) return MAX_ATTEMPTS;
    return Math.max(0, MAX_ATTEMPTS - record.failedAttempts);
  },

  async getRecord(): Promise<PinRecord | null> {
    const json = await SecureVault.getPinRecord();
    return json ? (JSON.parse(json) as PinRecord) : null;
  },

  /** Kalıcı kilidi yalnızca cihazdaki cüzdanlardan birinin kurtarma ifadesiyle kaldırır. */
  async recoverWithMnemonic(mnemonic: string, newPin: string): Promise<boolean> {
    assertValidPin(newPin);
    const normalized = mnemonic.trim().toLowerCase().replace(/\s+/g, " ");
    const wallets = await WalletStore.list();
    for (const wallet of wallets) {
      if (wallet.watchOnly) continue;
      const stored = await SecureVault.getMnemonic(wallet.id);
      if (stored && constantTimeEqual(stored, normalized)) {
        await this.setPin(newPin);
        return true;
      }
    }
    return false;
  },
};
