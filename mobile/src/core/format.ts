import type { BalanceUnit } from "./types";

const SATS_PER_BTC = 100_000_000;

export function formatSat(sat: number): string {
  if (!Number.isSafeInteger(sat)) throw new Error("Satoshi değeri güvenli tam sayı aralığında olmalı.");
  return `${sat.toLocaleString("tr-TR")} SAT`;
}

export function formatBtc(sat: number, ticker = "BTC", compact = false): string {
  if (!Number.isSafeInteger(sat)) throw new Error("Satoshi değeri güvenli tam sayı aralığında olmalı.");
  const sign = sat < 0 ? "-" : "";
  const absolute = Math.abs(sat);
  const whole = Math.floor(absolute / SATS_PER_BTC);
  const fraction = String(absolute % SATS_PER_BTC).padStart(8, "0");
  const visibleFraction = compact ? fraction.replace(/0+$/, "").padEnd(2, "0") : fraction;
  return `${sign}${whole.toLocaleString("tr-TR")}.${visibleFraction} ${ticker}`;
}

export function formatBitcoin(sat: number, unit: BalanceUnit, ticker = "BTC"): string {
  return unit === "sat" ? formatSat(sat) : formatBtc(sat, ticker, true);
}

export function formatUsd(sat: number, usdPerBtc?: number): string | null {
  if (!usdPerBtc || !Number.isFinite(usdPerBtc) || usdPerBtc <= 0) return null;
  const usd = (sat * usdPerBtc) / SATS_PER_BTC;
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
