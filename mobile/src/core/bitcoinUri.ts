const SATS_PER_BTC = 100_000_000;
const MAX_BITCOIN_SUPPLY_SAT = 21_000_000 * SATS_PER_BTC;

export interface BitcoinPaymentRequest {
  address: string;
  amountSat?: number;
  label?: string;
  message?: string;
  isUri: boolean;
}

function decodeComponent(value: string, label: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    throw new Error(`${label} geçerli URL kodlaması içermiyor.`);
  }
}

export function btcAmountToSats(value: string): number {
  const normalized = value.trim();
  const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(normalized);
  if (!match) {
    throw new Error("Bitcoin URI miktarı en fazla 8 ondalık basamak içermeli.");
  }

  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? "").padEnd(8, "0"));
  const satoshis = whole * BigInt(SATS_PER_BTC) + fraction;
  if (satoshis <= 0n || satoshis > BigInt(MAX_BITCOIN_SUPPLY_SAT)) {
    throw new Error("Bitcoin URI miktarı geçerli aralıkta değil.");
  }
  return Number(satoshis);
}

export function satsToBtcAmount(satoshis: number): string {
  if (!Number.isSafeInteger(satoshis) || satoshis <= 0 || satoshis > MAX_BITCOIN_SUPPLY_SAT) {
    throw new Error("Ödeme isteği miktarı pozitif bir tam satoshi değeri olmalı.");
  }
  const whole = Math.floor(satoshis / SATS_PER_BTC);
  const fraction = String(satoshis % SATS_PER_BTC).padStart(8, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function parseBitcoinPayment(value: string): BitcoinPaymentRequest {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Bitcoin adresi veya ödeme isteği boş olamaz.");
  if (!/^bitcoin:/i.test(trimmed)) {
    return { address: trimmed, isUri: false };
  }

  const payload = trimmed.slice(trimmed.indexOf(":") + 1);
  if (payload.startsWith("//")) throw new Error("Bitcoin URI biçimi geçersiz.");
  const separator = payload.indexOf("?");
  const rawAddress = separator >= 0 ? payload.slice(0, separator) : payload;
  const rawQuery = separator >= 0 ? payload.slice(separator + 1) : "";
  const address = decodeComponent(rawAddress, "Bitcoin adresi").trim();
  if (!address) throw new Error("Bitcoin URI içinde adres bulunamadı.");

  const request: BitcoinPaymentRequest = { address, isUri: true };
  const seen = new Set<string>();
  for (const pair of rawQuery.split("&")) {
    if (!pair) continue;
    const equals = pair.indexOf("=");
    const rawKey = equals >= 0 ? pair.slice(0, equals) : pair;
    const rawValue = equals >= 0 ? pair.slice(equals + 1) : "";
    const key = decodeComponent(rawKey, "Bitcoin URI parametresi");
    const decoded = decodeComponent(rawValue, `Bitcoin URI ${key} değeri`);

    if (key.startsWith("req-")) {
      throw new Error(`Desteklenmeyen zorunlu Bitcoin URI parametresi: ${key}`);
    }
    if (seen.has(key) && ["amount", "label", "message"].includes(key)) {
      throw new Error(`Bitcoin URI ${key} parametresi birden fazla kez kullanılamaz.`);
    }
    seen.add(key);

    if (key === "amount") request.amountSat = btcAmountToSats(decoded);
    if (key === "label") request.label = decoded.slice(0, 120);
    if (key === "message") request.message = decoded.slice(0, 240);
  }
  return request;
}

export function buildBitcoinPaymentUri(
  address: string,
  amountSat?: number,
  label?: string,
  message?: string,
): string {
  const normalizedAddress = address.trim();
  if (!normalizedAddress) throw new Error("Ödeme isteği için adres gerekli.");
  const params: string[] = [];
  if (amountSat !== undefined) params.push(`amount=${encodeURIComponent(satsToBtcAmount(amountSat))}`);
  if (label?.trim()) params.push(`label=${encodeURIComponent(label.trim().slice(0, 120))}`);
  if (message?.trim()) params.push(`message=${encodeURIComponent(message.trim().slice(0, 240))}`);
  return `bitcoin:${normalizedAddress}${params.length ? `?${params.join("&")}` : ""}`;
}
