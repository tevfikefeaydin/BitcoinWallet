import { APP_CONFIG } from "./config";
import type { EsploraHealth, EsploraServer } from "./types";
import { WalletStore } from "./WalletStore";

const REQUEST_TIMEOUT_MS = 6_000;
const HEALTH_CACHE_MS = 60_000;
const healthCache = new Map<string, EsploraHealth>();
const GENESIS = {
  mainnet: "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f",
  testnet: "000000000933ea01ad0ee984209779baaaec3ced90fa3f408719526f8d77f4943",
} as const;

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "text/plain" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.text()).trim();
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeEsploraUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Geçerli bir Esplora URL'si girin.");
  }
  if (parsed.protocol !== "https:") throw new Error("Özel Esplora sunucusu HTTPS kullanmalı.");
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Esplora URL'si kullanıcı bilgisi, sorgu veya parça içeremez.");
  }
  return trimmed;
}

export async function configuredEsploraServers(): Promise<EsploraServer[]> {
  const custom = await WalletStore.getCustomEsploraServers();
  const seen = new Set<string>();
  return [...APP_CONFIG.esploraServers, ...custom].filter((server) => {
    if (seen.has(server.baseUrl)) return false;
    seen.add(server.baseUrl);
    return true;
  });
}

export async function checkEsploraServer(server: EsploraServer, force = false): Promise<EsploraHealth> {
  const cached = healthCache.get(server.baseUrl);
  if (!force && cached && Date.now() - cached.checkedAt < HEALTH_CACHE_MS) return cached;
  const startedAt = Date.now();
  try {
    const [genesis, heightText] = await Promise.all([
      fetchText(`${server.baseUrl}/block-height/0`),
      fetchText(`${server.baseUrl}/blocks/tip/height`),
    ]);
    if (genesis !== GENESIS[APP_CONFIG.networkName]) {
      throw new Error(`${APP_CONFIG.networkLabel} ağ kimliği eşleşmedi`);
    }
    const height = Number(heightText);
    if (!Number.isSafeInteger(height) || height < 0) throw new Error("Geçersiz blok yüksekliği");
    const health: EsploraHealth = {
      baseUrl: server.baseUrl,
      healthy: true,
      checkedAt: Date.now(),
      latencyMs: Date.now() - startedAt,
      height,
    };
    healthCache.set(server.baseUrl, health);
    return health;
  } catch (error) {
    const health: EsploraHealth = {
      baseUrl: server.baseUrl,
      healthy: false,
      checkedAt: Date.now(),
      latencyMs: Date.now() - startedAt,
      error: (error as Error).message || "Sunucuya ulaşılamadı",
    };
    healthCache.set(server.baseUrl, health);
    return health;
  }
}

export async function esploraCandidates(): Promise<EsploraServer[]> {
  const servers = await configuredEsploraServers();
  const selected = (await WalletStore.getEsploraUrl()) ?? servers[0]?.baseUrl;
  const selectedServer = servers.find((server) => server.baseUrl === selected);
  const ordered = [selectedServer, ...servers.filter((server) => server.baseUrl !== selected)].filter(
    (server): server is EsploraServer => Boolean(server),
  );
  return (await WalletStore.getEsploraMode()) === "manual" ? ordered.slice(0, 1) : ordered;
}
