import type { Meta, MemeHit, Token, ViralStory } from "./types";

const GENERIC_METAS = new Set([
  "meme-hall-of-fame",
  "character",
  "degen",
  "knockoff-legends",
]);

const STOP = new Set([
  "the",
  "and",
  "for",
  "coin",
  "inu",
  "token",
  "meme",
  "sol",
  "solana",
  "pump",
  "ai",
]);

export function metaHeat(m: Meta) {
  return m.change.m5 * 12 + m.change.h1 * 4 + Math.max(0, m.change.h6) * 0.4;
}

export function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function tokensOf(s: string) {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

function bigrams(s: string) {
  const n = normalize(s);
  const g = new Set<string>();
  for (let i = 0; i < n.length - 1; i++) g.add(n.slice(i, i + 2));
  return g;
}

function dice(a: string, b: string) {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size < 2 || B.size < 2) return 0;
  let hit = 0;
  for (const x of A) if (B.has(x)) hit++;
  return (2 * hit) / (A.size + B.size);
}

function editDist(a: string, b: string) {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function nameScore(a: Token, b: Token) {
  const as = normalize(a.symbol);
  const bs = normalize(b.symbol);
  const an = normalize(a.name);
  const bn = normalize(b.name);
  if (!as || !bs || as === bs) return 0;
  let s = 0;
  if (as.length >= 4 && bs.length >= 4) {
    if (as.includes(bs) || bs.includes(as)) s = Math.max(s, 0.92);
    if (editDist(as, bs) <= 2) s = Math.max(s, 0.84);
  }
  if (an.length >= 5 && bn.length >= 5) {
    if (an.includes(bs) || bn.includes(as)) s = Math.max(s, 0.8);
    s = Math.max(s, dice(a.name, b.name));
  }
  const aw = new Set(tokensOf(a.name + " " + a.symbol));
  const bw = new Set(tokensOf(b.name + " " + b.symbol));
  let shared = 0;
  for (const w of aw) if (bw.has(w) && w.length >= 4) shared++;
  if (shared) s = Math.max(s, 0.7);
  return s;
}

export function matchesMeta(token: Token, meta: Meta) {
  if (GENERIC_METAS.has(meta.slug)) return false;
  const blob = `${token.name} ${token.symbol}`.toLowerCase();
  const keys = [meta.name, meta.slug.replace(/-/g, " "), ...tokensOf(meta.name)];
  return keys.some((k) => {
    const key = k.toLowerCase().trim();
    if (key.length < 3) return false;
    return blob.includes(key);
  });
}

export function tagMemes(tokens: Token[], metas: Meta[]) {
  const leaders = tokens
    .filter(
      (t) =>
        (t.change.m5 >= 10 || t.change.h1 >= 30) &&
        t.volume.m5 + t.volume.h1 >= 2500 &&
        t.mcap >= 20_000,
    )
    .sort((a, b) => b.change.m5 * 2 + b.change.h1 - (a.change.m5 * 2 + a.change.h1))
    .slice(0, 10);

  const hotMetas = metas
    .filter((m) => !GENERIC_METAS.has(m.slug))
    .slice()
    .sort((a, b) => b.heat - a.heat);

  for (const t of tokens) {
    let best: MemeHit | undefined;

    for (const leader of leaders) {
      if (leader.mint === t.mint) {
        const hit: MemeHit = {
          viral: `$${leader.symbol}`,
          relation: "leader",
          why: `this is the viral one — $${leader.symbol} is the meme people are copying`,
        };
        if (!best) best = hit;
        continue;
      }
      const sim = nameScore(t, leader);
      if (sim >= 0.62 && t.mcap <= leader.mcap * 0.7) {
        const hit: MemeHit = {
          viral: `$${leader.symbol}`,
          relation: "lookalike",
          why: `rhymes with $${leader.symbol} (${leader.change.h1 >= 0 ? "+" : ""}${leader.change.h1.toFixed(0)}% 1h). same joke, still smaller`,
        };
        if (!best || best.relation !== "lookalike") best = hit;
      }
    }

    for (const meta of hotMetas.slice(0, 5)) {
      if (meta.heat < 0.4 && meta.change.m5 < 0.12) continue;
      if (!matchesMeta(t, meta)) continue;
      const isLeader =
        t.mcap >= 400_000 && (t.change.h1 >= 15 || t.change.m5 >= 8);
      const hit: MemeHit = {
        viral: meta.name,
        relation: isLeader ? "leader" : "lookalike",
        why: isLeader
          ? `${meta.emoji} ${meta.name} is the live meta — this is a lead name`
          : `${meta.emoji} ${meta.name} meta is hot. this is a cheaper name in that joke`,
      };
      if (!best) best = hit;
      else if (best.relation === "leader" && hit.relation === "lookalike") {
        /* keep leader tag on the original */
      } else if (best.relation !== "lookalike") best = hit;
    }

    if (best) t.meme = best;
  }

  return { leaders, hotMetas };
}

export function buildStories(
  tokens: Token[],
  metas: Meta[],
  leaders: Token[],
  hotMetas: Meta[],
): ViralStory[] {
  const stories: ViralStory[] = [];
  const seen = new Set<string>();

  for (const leader of leaders.slice(0, 6)) {
    const lookalikes = tokens
      .filter(
        (t) =>
          t.mint !== leader.mint &&
          t.meme?.viral === `$${leader.symbol}` &&
          t.meme.relation === "lookalike" &&
          t.mcap <= 8_000_000,
      )
      .sort((a, b) => a.mcap - b.mcap || a.ageMin - b.ageMin)
      .slice(0, 5);
    const key = leader.mint;
    if (seen.has(key)) continue;
    seen.add(key);
    stories.push({
      headline:
        lookalikes.length > 0
          ? `$${leader.symbol} is going nuclear. buy the rhymes, not the wick.`
          : `$${leader.symbol} is the new meme. hunt names that sound like it.`,
      viral: `$${leader.symbol}`,
      emoji: "🔥",
      heat: leader.change.m5 * 2 + leader.change.h1,
      leader,
      lookalikes,
    });
  }

  for (const meta of hotMetas.slice(0, 4)) {
    if (meta.heat < 0.5 && meta.change.m5 < 0.2) continue;
    const inMeta = tokens.filter((t) => matchesMeta(t, meta));
    if (inMeta.length === 0) continue;
    const leader =
      inMeta
        .slice()
        .sort((a, b) => b.change.h1 * b.volume.h1 - a.change.h1 * a.volume.h1)[0] ||
      null;
    const key = `meta:${meta.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const lookalikes = inMeta
      .filter(
        (t) =>
          t.mint !== leader?.mint &&
          t.mcap <= 4_000_000 &&
          t.ageMin <= 60 * 36,
      )
      .sort((a, b) => a.ageMin - b.ageMin)
      .slice(0, 5);
    stories.push({
      headline: `${meta.name} is the live meta. ${lookalikes.length ? "these names are still early." : "watch for new names in this joke."}`,
      viral: meta.name,
      emoji: meta.emoji,
      heat: meta.heat,
      leader,
      lookalikes,
    });
  }

  return stories.sort((a, b) => b.heat - a.heat).slice(0, 4);
}
