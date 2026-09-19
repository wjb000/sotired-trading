import { num } from "./format";
import { deskPick, grade, MAX_SCREEN_MCAP, toTx } from "./signals";
import type { Meta, ScreenerResponse, Token, TxWindow } from "./types";

const GECKO = "https://api.geckoterminal.com/api/v2";
const SKIP_MINTS = new Set([
  "So11111111111111111111111111111111111111112",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  "USDSwr9ApdHk5bvJKMjz91nkXyyGmqENQ6P2bXBfz7z",
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4",
  "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
  "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
  "bSo13r4TkiE4KumL71LsHTPpL2euXUYw2ldQTsV84G5",
]);
const SKIP_SYMBOLS = new Set([
  "SOL",
  "WSOL",
  "USDC",
  "USDT",
  "USDS",
  "USD1",
  "JUP",
  "JLP",
  "MSOL",
  "JITOSOL",
  "BSOL",
]);

type GeckoPool = {
  id: string;
  attributes: {
    name: string;
    address: string;
    pool_created_at: string;
    base_token_price_usd: string;
    fdv_usd: string | null;
    market_cap_usd: string | null;
    reserve_in_usd: string;
    price_change_percentage: Record<string, string | number>;
    volume_usd: Record<string, string | number>;
    transactions: Record<string, TxWindow>;
  };
  relationships: {
    base_token: { data: { id: string } };
    quote_token: { data: { id: string } };
    dex: { data: { id: string } };
  };
};

type GeckoIncluded = {
  id: string;
  type: string;
  attributes: {
    address?: string;
    name?: string;
    symbol?: string;
    image_url?: string | null;
  };
};

type Cache = { at: number; data: ScreenerResponse };
let cache: Cache | null = null;
const TTL = 25_000;

export async function getScreener(): Promise<ScreenerResponse> {
  if (cache && Date.now() - cache.at < TTL && cache.data.tokens.length > 0) {
    return cache.data;
  }
  const data = await buildScreener();
  if (data.tokens.length > 0 || data.fresh.length > 0) {
    cache = { at: Date.now(), data };
  }
  return data;
}

async function buildScreener(): Promise<ScreenerResponse> {
  const headers = {
    accept: "application/json",
  };

  const [t5, t1h, freshRaw, metasRaw, solRaw] = await Promise.all([
    fetchJson(`${GECKO}/networks/solana/trending_pools?include=base_token,quote_token,dex&duration=5m`, headers),
    fetchJson(`${GECKO}/networks/solana/trending_pools?include=base_token,quote_token,dex&duration=1h`, headers),
    fetchJson(`${GECKO}/networks/solana/new_pools?include=base_token,quote_token,dex`, headers),
    fetchJson("https://api.dexscreener.com/metas/trending/v1", headers),
    fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true", headers),
  ]);

  const merged = new Map<string, Token>();
  ingest(merged, t5, "5m");
  ingest(merged, t1h, "1h");

  const freshMap = new Map<string, Token>();
  ingest(freshMap, freshRaw, "new");
  for (const t of freshMap.values()) {
    const lifeVol = t.volume.h24 || t.volume.m5;
    const tx = t.tx.m5.buys + t.tx.m5.sells;
    const alive = lifeVol >= 600 && tx >= 5 && (t.liquidity >= 4_000 || t.onCurve);
    if (alive && t.ageMin <= 180 && t.mcap <= MAX_SCREEN_MCAP) {
      const prev = merged.get(t.mint);
      if (!prev) merged.set(t.mint, t);
      else prev.sources = Array.from(new Set([...prev.sources, "new"]));
    }
  }

  const tokens = [...merged.values()]
    .filter((t) => t.mcap <= MAX_SCREEN_MCAP && t.ageMin <= 60 * 48)
    .map((t) => ({ ...t, ...grade(t) }))
    .sort((a, b) => b.score - a.score);

  const fresh = [...freshMap.values()]
    .filter((t) => {
      const lifeVol = t.volume.h24 || t.volume.m5;
      const tx = t.tx.m5.buys + t.tx.m5.sells;
      return (
        t.ageMin <= 90 &&
        t.mcap <= MAX_SCREEN_MCAP &&
        lifeVol >= 400 &&
        tx >= 4 &&
        (t.liquidity >= 3_000 || t.onCurve)
      );
    })
    .map((t) => ({ ...t, ...grade(t) }))
    .sort((a, b) => b.volume.m5 - a.volume.m5)
    .slice(0, 16);

  const metas = parseMetas(metasRaw);
  const sol = {
    price: num(solRaw?.solana?.usd),
    change24h: num(solRaw?.solana?.usd_24h_change),
  };

  const hottest = tokens
    .slice()
    .sort((a, b) => b.change.m5 - a.change.m5)[0];

  const desk = deskPick([...tokens, ...fresh.filter((t) => !tokens.some((x) => x.mint === t.mint))]);

  return {
    updatedAt: new Date().toISOString(),
    sol,
    tokens,
    fresh,
    metas,
    desk,
    stats: {
      scanned: tokens.length + fresh.length,
      ape: tokens.filter((t) => t.action === "APE" || t.action === "BUY").length,
      sell: tokens.filter((t) => t.action === "SELL" || t.action === "FADE").length,
      avoid: tokens.filter((t) => t.action === "AVOID").length,
      hottest: hottest ? `$${hottest.symbol}` : null,
    },
  };
}

function ingest(
  into: Map<string, Token>,
  payload: { data?: GeckoPool[]; included?: GeckoIncluded[] } | null,
  source: string,
) {
  if (!payload?.data) return;
  const included = new Map((payload.included || []).map((x) => [x.id, x]));

  for (const pool of payload.data) {
    const baseRel = pool.relationships?.base_token?.data?.id;
    const dexId = pool.relationships?.dex?.data?.id || "unknown";
    const base = included.get(baseRel);
    const mint = base?.attributes?.address || baseRel?.replace(/^solana_/, "") || "";
    const symbol = (base?.attributes?.symbol || pool.attributes.name.split(" / ")[0] || "?").trim();
    const name = (base?.attributes?.name || symbol).trim();

    if (!mint || SKIP_MINTS.has(mint) || SKIP_SYMBOLS.has(symbol.toUpperCase())) continue;
    if (num(pool.attributes.fdv_usd) > MAX_SCREEN_MCAP * 1.4) continue;
    if (/wrapped\s/i.test(name) || /xstock/i.test(name)) continue;

    const attr = pool.attributes;
    const createdAt = attr.pool_created_at;
    const ageMin = Math.max(0, (Date.now() - new Date(createdAt).getTime()) / 60000);
    const mcap = num(attr.market_cap_usd) || num(attr.fdv_usd);
    const onCurve = dexId === "pump-fun";

    const next: Token = {
      mint,
      pool: attr.address,
      symbol,
      name,
      image: base?.attributes?.image_url || null,
      dex: dexId,
      price: num(attr.base_token_price_usd),
      mcap,
      liquidity: num(attr.reserve_in_usd),
      ageMin,
      createdAt,
      change: {
        m5: num(attr.price_change_percentage?.m5),
        m15: num(attr.price_change_percentage?.m15),
        h1: num(attr.price_change_percentage?.h1),
        h6: num(attr.price_change_percentage?.h6),
        h24: num(attr.price_change_percentage?.h24),
      },
      volume: {
        m5: num(attr.volume_usd?.m5),
        h1: num(attr.volume_usd?.h1),
        h6: num(attr.volume_usd?.h6),
        h24: num(attr.volume_usd?.h24),
      },
      tx: {
        m5: toTx(attr.transactions?.m5),
        h1: toTx(attr.transactions?.h1),
        h24: toTx(attr.transactions?.h24),
      },
      sources: [source],
      onCurve,
      score: 0,
      action: "HOLD",
      reasons: [],
      when: "",
      sellPlan: "",
      size: "skip",
    };

    const prev = into.get(mint);
    if (!prev) {
      into.set(mint, next);
      continue;
    }
    prev.sources = Array.from(new Set([...prev.sources, source]));
    if (next.volume.h24 > prev.volume.h24 || next.liquidity > prev.liquidity) {
      into.set(mint, { ...next, sources: prev.sources });
    }
  }
}

function parseMetas(raw: unknown): Meta[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 12).map((m: Record<string, unknown>) => {
    const icon = m.icon as { value?: string } | undefined;
    const ch = (m.marketCapChange || {}) as Record<string, number>;
    return {
      name: String(m.name || ""),
      slug: String(m.slug || ""),
      description: String(m.description || ""),
      emoji: icon?.value || "•",
      marketCap: num(m.marketCap),
      volume: num(m.volume),
      tokenCount: num(m.tokenCount),
      change: {
        m5: num(ch.m5),
        h1: num(ch.h1),
        h6: num(ch.h6),
        h24: num(ch.h24),
      },
    };
  });
}

async function fetchJson(url: string, headers: Record<string, string>) {
  for (let i = 0; i < 2; i++) {
    try {
      const res = await fetch(url, { headers, cache: "no-store" });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      if (i === 0) await new Promise((r) => setTimeout(r, 400));
    }
  }
  return null;
}
