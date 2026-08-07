import AsyncStorage from "@react-native-async-storage/async-storage";
import { APP_CONFIG } from "./config";
import type { FiatQuote } from "./types";

const CACHE_KEY = `${APP_CONFIG.storagePrefix}.price.usd`;
const FRESH_FOR_MS = 5 * 60_000;
const MAX_STALE_MS = 24 * 60 * 60_000;
const TIMEOUT_MS = 5_000;

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function validPrice(value: unknown): number | null {
  const numberValue = typeof value === "string" ? Number(value) : value;
  return typeof numberValue === "number" && Number.isFinite(numberValue) && numberValue > 0
    ? numberValue
    : null;
}

async function liveQuote(): Promise<FiatQuote> {
  const providers = [
    async () => {
      const json = (await fetchJson("https://mempool.space/api/v1/prices")) as { USD?: unknown };
      return { usd: validPrice(json.USD), source: "mempool.space" };
    },
    async () => {
      const json = (await fetchJson("https://api.coinbase.com/v2/prices/BTC-USD/spot")) as {
        data?: { amount?: unknown };
      };
      return { usd: validPrice(json.data?.amount), source: "Coinbase" };
    },
  ];

  for (const provider of providers) {
    try {
      const result = await provider();
      if (result.usd) {
        return { usd: result.usd, source: result.source, fetchedAt: Date.now(), stale: false };
      }
    } catch {}
  }
  throw new Error("BTC/USD fiyat kaynaklarına ulaşılamadı.");
}

async function cachedQuote(): Promise<FiatQuote | null> {
  try {
    const json = await AsyncStorage.getItem(CACHE_KEY);
    if (!json) return null;
    const quote = JSON.parse(json) as FiatQuote;
    if (!validPrice(quote.usd) || !Number.isFinite(quote.fetchedAt)) return null;
    return quote;
  } catch {
    return null;
  }
}

export const PriceService = {
  async getUsdQuote(force = false): Promise<FiatQuote | null> {
    const cached = await cachedQuote();
    const age = cached ? Date.now() - cached.fetchedAt : Infinity;
    if (!force && cached && age < FRESH_FOR_MS) return { ...cached, stale: false };
    try {
      const quote = await liveQuote();
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(quote));
      return quote;
    } catch {
      return cached && age < MAX_STALE_MS ? { ...cached, stale: true } : null;
    }
  },
};
