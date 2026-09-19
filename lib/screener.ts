import { num } from "./format";
import { buildStories, metaHeat, tagMemes } from "./memes";
import { deskPick, grade, MAX_SCREEN_MCAP, toTx } from "./signals";
import type { Meta, ScreenerResponse, Token, TxWindow } from "./types";

const DEX = "https://api.dexscreener.com";
const SKIP_MINTS = new Set([
  "So11111111111111111111111111111111111111112",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
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

type DexPair = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  url?: string;
  pairCreatedAt?: number;
  priceUsd?: string | number;
  fdv?: number;
  marketCap?: number;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  liquidity?: { usd?: number };
  volume?: Record<string, number>;
  priceChange?: Record<string, number>;
  txns?: Record<string, { buys?: number; sells?: number }>;
  info?: { imageUrl?: string };
};

type Cache = { at: number; data: ScreenerResponse };
let cache: Cache | null = null;
const TTL = 20_000;

export async function getScreener(): Promise<ScreenerResponse> {
  if (cache && Date.now() - cache.at < TTL && cache.data.tokens.length > 0) {
    return cache.data;
  }
  const data = await buildScreener();
  if (data.tokens.length > 0 || data.fresh.length > 0 || data.viral.length > 0) {
    cache = { at: Date.now(), data };
  }
  return data;
}

async function buildScreener(): Promise<ScreenerResponse> {
  const [profiles, boosts, metasRaw, solRaw] = await Promise.all([
    fetchJson(`${DEX}/token-profiles/latest/v1`),
    fetchJson(`${DEX}/token-boosts/top/v1`),
    fetchJson(`${DEX}/metas/trending/v1`),
    fetchJson(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true",
    ),
  ]);

  const metas = parseMetas(metasRaw).sort((a, b) => b.heat - a.heat);
  const hotSlugs = metas
    .filter((m) => m.heat > 0.3 || m.change.m5 > 0.1)
    .slice(0, 3)
    .map((m) => m.slug);

  const addrs = solAddrs(profiles, boosts).slice(0, 30);

  const [tokenPairs, ...metaDetails] = await Promise.all([
    addrs.length
      ? fetchJson(`${DEX}/latest/dex/tokens/${addrs.join(",")}`)
      : Promise.resolve(null),
    ...hotSlugs.map((slug) => fetchJson(`${DEX}/metas/meta/v1/${slug}`)),
  ]);

  const merged = new Map<string, Token>();
  const images = new Map<string, string>();
  collectImages(profiles, images);
  collectImages(boosts, images);

  ingestPairs(merged, tokenPairs?.pairs, "profile", images);
  for (const detail of metaDetails) {
    ingestPairs(merged, detail?.pairs, "meta", images);
  }

  const leadersForSearch = [...merged.values()]
    .filter((t) => t.change.m5 >= 12 || t.change.h1 >= 40)
    .sort((a, b) => b.change.m5 - a.change.m5)
    .slice(0, 2);

  const searches = [
    ...leadersForSearch.map((t) => t.symbol),
    ...metas.filter((m) => m.heat > 1 || m.change.m5 > 0.25).slice(0, 2).map((m) => m.name),
  ].filter((q, i, arr) => q && arr.indexOf(q) === i);

  const searchHits = await Promise.all(
    searches.slice(0, 3).map((q) =>
      fetchJson(`${DEX}/latest/dex/search?q=${encodeURIComponent(q)}`),
    ),
  );
  for (const hit of searchHits) ingestPairs(merged, hit?.pairs, "search", images);

  const tagged = [...merged.values()].filter(
    (t) => t.mcap <= MAX_SCREEN_MCAP * 3 && t.ageMin <= 60 * 72,
  );
  const { leaders, hotMetas } = tagMemes(tagged, metas);

  const graded = tagged.map((t) => ({ ...t, ...grade(t) }));
  const byMint = new Map(graded.map((t) => [t.mint, t]));
  const gradedLeaders = leaders.map((l) => byMint.get(l.mint) || l);

  const tokens = graded
    .filter((t) => t.mcap <= MAX_SCREEN_MCAP && t.ageMin <= 60 * 48)
    .sort((a, b) => b.score - a.score);

  const fresh = graded
    .filter((t) => t.ageMin <= 90 && t.mcap <= MAX_SCREEN_MCAP)
    .sort((a, b) => b.volume.m5 - a.volume.m5)
    .slice(0, 16);

  const viral = buildStories(graded, metas, gradedLeaders, hotMetas);

  const lookalikes = graded.filter(
    (t) =>
      t.meme?.relation === "lookalike" &&
      t.mcap <= MAX_SCREEN_MCAP &&
      (t.action === "APE" || t.action === "BUY" || t.score >= 50),
  );
  const desk = deskPick(tokens);
  const extra = lookalikes
    .filter((t) => !desk.ape.some((x) => x.mint === t.mint))
    .slice(0, 4);
  desk.ape = [...extra, ...desk.ape]
    .filter((t, i, arr) => arr.findIndex((x) => x.mint === t.mint) === i)
    .slice(0, 6);

  const hottest =
    viral[0]?.leader?.symbol
      ? `$${viral[0].leader.symbol}`
      : tokens.slice().sort((a, b) => b.change.m5 - a.change.m5)[0]?.symbol;

  return {
    updatedAt: new Date().toISOString(),
    sol: {
      price: num(solRaw?.solana?.usd),
      change24h: num(solRaw?.solana?.usd_24h_change),
    },
    tokens,
    fresh,
    metas,
    viral,
    desk,
    stats: {
      scanned: tokens.length + fresh.length,
      ape: tokens.filter((t) => t.action === "APE" || t.action === "BUY").length,
      sell: tokens.filter((t) => t.action === "SELL" || t.action === "FADE").length,
      avoid: tokens.filter((t) => t.action === "AVOID").length,
      hottest: hottest ? (hottest.startsWith("$") ? hottest : `$${hottest}`) : null,
    },
  };
}

function solAddrs(profiles: unknown, boosts: unknown) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of [profiles, boosts]) {
    if (!Array.isArray(list)) continue;
    for (const row of list as { chainId?: string; tokenAddress?: string }[]) {
      if (row.chainId !== "solana" || !row.tokenAddress) continue;
      if (seen.has(row.tokenAddress)) continue;
      seen.add(row.tokenAddress);
      out.push(row.tokenAddress);
    }
  }
  return out;
}

function collectImages(raw: unknown, into: Map<string, string>) {
  if (!Array.isArray(raw)) return;
  for (const row of raw as { chainId?: string; tokenAddress?: string; icon?: string }[]) {
    if (row.chainId !== "solana" || !row.tokenAddress || !row.icon) continue;
    const icon = row.icon.startsWith("http")
      ? row.icon
      : `https://cdn.dexscreener.com/cms/images/${row.icon}`;
    into.set(row.tokenAddress, icon);
  }
}

function ingestPairs(
  into: Map<string, Token>,
  pairs: DexPair[] | undefined,
  source: string,
  images: Map<string, string>,
) {
  if (!pairs) return;
  for (const p of pairs) {
    const t = pairToToken(p, source, images);
    if (!t) continue;
    const prev = into.get(t.mint);
    if (!prev) {
      into.set(t.mint, t);
      continue;
    }
    prev.sources = Array.from(new Set([...prev.sources, source]));
    if (t.volume.h24 > prev.volume.h24 || t.liquidity > prev.liquidity) {
      into.set(t.mint, { ...t, sources: prev.sources, meme: prev.meme });
    }
  }
}

function pairToToken(
  p: DexPair,
  source: string,
  images: Map<string, string>,
): Token | null {
  if (p.chainId !== "solana") return null;
  const base = p.baseToken;
  const mint = base?.address || "";
  const symbol = (base?.symbol || "?").trim();
  const name = (base?.name || symbol).trim();
  if (!mint || SKIP_MINTS.has(mint) || SKIP_SYMBOLS.has(symbol.toUpperCase())) return null;
  if (/wrapped\s/i.test(name) || /xstock/i.test(name)) return null;

  const mcap = num(p.marketCap) || num(p.fdv);
  const createdAt = p.pairCreatedAt
    ? new Date(p.pairCreatedAt).toISOString()
    : new Date().toISOString();
  const ageMin = p.pairCreatedAt
    ? Math.max(0, (Date.now() - p.pairCreatedAt) / 60000)
    : 9999;
  const tx = (w?: { buys?: number; sells?: number }): TxWindow =>
    toTx({ buys: w?.buys, sells: w?.sells, buyers: w?.buys, sellers: w?.sells });

  return {
    mint,
    pool: p.pairAddress || mint,
    symbol,
    name,
    image: p.info?.imageUrl || images.get(mint) || null,
    dex: p.dexId || "unknown",
    price: num(p.priceUsd),
    mcap,
    liquidity: num(p.liquidity?.usd),
    ageMin,
    createdAt,
    change: {
      m5: num(p.priceChange?.m5),
      m15: num(p.priceChange?.m5),
      h1: num(p.priceChange?.h1),
      h6: num(p.priceChange?.h6),
      h24: num(p.priceChange?.h24),
    },
    volume: {
      m5: num(p.volume?.m5),
      h1: num(p.volume?.h1),
      h6: num(p.volume?.h6),
      h24: num(p.volume?.h24),
    },
    tx: {
      m5: tx(p.txns?.m5),
      h1: tx(p.txns?.h1),
      h24: tx(p.txns?.h24),
    },
    sources: [source],
    onCurve: (p.dexId || "").toLowerCase().includes("pump"),
    score: 0,
    action: "HOLD",
    reasons: [],
    when: "",
    sellPlan: "",
    size: "skip",
  };
}

function parseMetas(raw: unknown): Meta[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((m: Record<string, unknown>) => {
    const icon = m.icon as { value?: string } | undefined;
    const ch = (m.marketCapChange || {}) as Record<string, number>;
    const meta: Meta = {
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
      heat: 0,
    };
    meta.heat = metaHeat(meta);
    return meta;
  });
}

async function fetchJson(url: string) {
  for (let i = 0; i < 2; i++) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 700));
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
