"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { lock } from "@/lib/auth";
import { ageLabel, buyRatio, compact, dexLabel, pct, shortMint, usd } from "@/lib/format";
import { getScreener } from "@/lib/screener";
import type { Action, Meta, ScreenerResponse, Token, ViralStory } from "@/lib/types";

type Filter = "ALL" | Action | "WATCH";
type SortKey = "score" | "m5" | "h1" | "h24" | "vol" | "liq" | "age";

const WATCH_KEY = "sotired-watch";

export function Dashboard({
  initial,
  onLock,
}: {
  initial?: ScreenerResponse;
  onLock: () => void;
}) {
  const [data, setData] = useState<ScreenerResponse | null>(initial ?? null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!initial);
  const [now, setNow] = useState(() => new Date());
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [sort, setSort] = useState<SortKey>("score");
  const [watch, setWatch] = useState<string[]>([]);
  const [copied, setCopied] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    try {
      setWatch(JSON.parse(localStorage.getItem(WATCH_KEY) || "[]"));
    } catch {
      setWatch([]);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const json = await getScreener();
      if (!json.tokens.length && !json.fresh.length && !json.metas.length && !json.viral?.length) {
        throw new Error("screener down");
      }
      setData(json);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "screener down");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const a = setInterval(load, 20_000);
    const b = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [load]);

  function toggleWatch(mint: string) {
    setWatch((prev) => {
      const next = prev.includes(mint) ? prev.filter((x) => x !== mint) : [...prev, mint];
      localStorage.setItem(WATCH_KEY, JSON.stringify(next));
      return next;
    });
  }

  async function copy(mint: string) {
    await navigator.clipboard.writeText(mint);
    setCopied(mint);
    setTimeout(() => setCopied(""), 1200);
  }

  function logout() {
    lock();
    onLock();
  }

  const rows = useMemo(() => {
    if (!data) return [];
    let list = data.tokens;
    if (filter === "WATCH") list = list.filter((t) => watch.includes(t.mint));
    else if (filter !== "ALL") list = list.filter((t) => t.action === filter);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.symbol.toLowerCase().includes(s) ||
          t.name.toLowerCase().includes(s) ||
          t.mint.toLowerCase().includes(s),
      );
    }
    return [...list].sort((a, b) => {
      switch (sort) {
        case "m5":
          return b.change.m5 - a.change.m5;
        case "h1":
          return b.change.h1 - a.change.h1;
        case "h24":
          return b.change.h24 - a.change.h24;
        case "vol":
          return b.volume.h24 - a.volume.h24;
        case "liq":
          return b.liquidity - a.liquidity;
        case "age":
          return a.ageMin - b.ageMin;
        default:
          return b.score - a.score;
      }
    });
  }, [data, filter, q, sort, watch]);

  const book = useMemo(() => {
    if (!data || watch.length === 0) return [];
    const all = [...data.tokens, ...data.fresh];
    return watch
      .map((mint) => all.find((t) => t.mint === mint))
      .filter((t): t is Token => Boolean(t));
  }, [data, watch]);

  const utc = now.toISOString().slice(11, 19);

  return (
    <div className="min-h-screen pb-20">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-baseline gap-3">
            <h1 className="font-serif text-3xl leading-none text-cream">sotired</h1>
            <span className="hidden font-mono text-[10px] tracking-[0.22em] text-gold uppercase sm:inline">
              shitcoin desk
            </span>
          </div>
          <div className="flex items-center gap-4 font-mono text-[11px] text-mute">
            {data && (
              <div className="hidden items-center gap-2 sm:flex">
                <span className="text-gold">SOL</span>
                <span className="text-cream">{usd(data.sol.price)}</span>
                <Delta n={data.sol.change24h} />
              </div>
            )}
            <span className="hidden md:inline">{utc} utc</span>
            <span className="flex items-center gap-1.5 text-go">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-go" />
              live
            </span>
            <button onClick={logout} className="text-mute hover:text-cream">
              lock
            </button>
          </div>
        </div>
        {data && (
          <div className="overflow-hidden border-t border-line/60">
            <div className="ticker flex w-max gap-8 py-1.5 font-mono text-[11px] text-mute">
              {[...data.tokens, ...data.tokens].map((t, i) => (
                <span key={`${t.mint}-${i}`} className="flex items-center gap-2">
                  <span className="text-cream">${t.symbol}</span>
                  <Delta n={t.change.m5} />
                  <Badge action={t.action} tiny />
                </span>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-[1400px] px-4 pt-6 sm:px-6">
        {loading && !data ? (
          <p className="font-mono text-sm text-mute">pulling the tape…</p>
        ) : null}
        {error && !data ? (
          <div className="rounded-lg border border-stop/40 bg-stop/10 p-4 font-mono text-sm text-stop">
            {error}{" "}
            <button onClick={load} className="underline">
              retry
            </button>
          </div>
        ) : null}

        {data && (
          <>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Stat label="scanned" value={String(data.stats.scanned)} />
              <Stat label="buy / ape" value={String(data.stats.ape)} tone="go" />
              <Stat label="sell / fade" value={String(data.stats.sell)} tone="stop" />
              <Stat label="avoid" value={String(data.stats.avoid)} tone="warn" />
              <Stat label="hottest 5m" value={data.stats.hottest || "—"} />
            </section>
            {error ? (
              <p className="mt-3 font-mono text-[11px] text-warn">
                last refresh failed — showing stale tape. retrying.
              </p>
            ) : (
              <p className="mt-3 font-mono text-[11px] text-mute">
                refreshed {new Date(data.updatedAt).toISOString().slice(11, 19)} utc ·
                dexscreener tape · not financial advice, just a desk
              </p>
            )}

            {data.viral?.length > 0 && (
              <section className="mt-10">
                <h2 className="font-serif text-4xl text-cream">the meme</h2>
                <p className="mt-1 max-w-2xl text-sm text-mute">
                  Find the joke that&apos;s going nuclear. Then buy the cheaper names that sound
                  like it — not the wick that already ran.
                </p>
                <div className="mt-5 space-y-4">
                  {data.viral.map((story) => (
                    <ViralCard
                      key={story.viral}
                      story={story}
                      watch={watch}
                      copied={copied}
                      onWatch={toggleWatch}
                      onCopy={copy}
                    />
                  ))}
                </div>
              </section>
            )}

            {book.length > 0 && (
              <section className="mt-8">
                <h2 className="font-serif text-4xl text-cream">your book</h2>
                <p className="mt-1 text-sm text-mute">
                  Names you tracked. This is the sell tape — flatten when it says sell.
                </p>
                <div className="mt-4 space-y-2">
                  {book.map((t) => (
                    <div key={t.mint} className="rounded-lg border border-line bg-panel px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Avatar token={t} />
                          <div>
                            <div className="text-cream">${t.symbol}</div>
                            <div className="font-mono text-[10px] text-mute">
                              {compact(t.mcap)} · {ageLabel(t.ageMin)} · 5m <Delta n={t.change.m5} />
                            </div>
                          </div>
                        </div>
                        <Badge action={t.action} />
                      </div>
                      <p
                        className={`mt-2 text-sm leading-snug ${
                          t.action === "SELL" || t.action === "FADE" ? "text-stop" : "text-cream"
                        }`}
                      >
                        {t.sellPlan}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <h2 className="mt-10 font-serif text-4xl text-cream">the desk</h2>
            <p className="mt-1 max-w-xl text-sm text-mute">
              Early, low-cap names only (under ~$12M, under 2 days). Buy the left. Sell the middle.
              Track a name to put it in your book.
            </p>
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <DeskCol
                title="buy now"
                hint="early, still small, buyers in control"
                tone="go"
                empty="nothing early enough to buy"
                tokens={data.desk.ape}
                watch={watch}
                copied={copied}
                onWatch={toggleWatch}
                onCopy={copy}
                open={open}
                setOpen={setOpen}
                line="when"
              />
              <DeskCol
                title="sell now"
                hint="if you're in, flatten"
                tone="stop"
                empty="no obvious dumps on the board"
                tokens={data.desk.exit}
                watch={watch}
                copied={copied}
                onWatch={toggleWatch}
                onCopy={copy}
                open={open}
                setOpen={setOpen}
                line="sell"
              />
              <DeskCol
                title="too late"
                hint="thin, old, or already cooked"
                tone="warn"
                empty="filter is clean"
                tokens={data.desk.skip}
                watch={watch}
                copied={copied}
                onWatch={toggleWatch}
                onCopy={copy}
                open={open}
                setOpen={setOpen}
                line="when"
              />
            </div>

            <div className="mt-12 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-serif text-4xl text-cream">screener</h2>
                <p className="mt-1 text-sm text-mute">
                  Low-cap Solana only. Click a row for the buy and the sell.
                </p>
              </div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="search ticker / mint"
                className="w-full max-w-xs rounded-md border border-line bg-panel px-3 py-2 font-mono text-xs text-cream outline-none placeholder:text-mute focus:border-gold/50"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {(
                [
                  "ALL",
                  "APE",
                  "BUY",
                  "HOLD",
                  "SELL",
                  "FADE",
                  "AVOID",
                  "WATCH",
                ] as Filter[]
              ).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full border px-3 py-1 font-mono text-[10px] tracking-wider uppercase ${
                    filter === f
                      ? "border-gold bg-gold text-ink"
                      : "border-line text-mute hover:text-cream"
                  }`}
                >
                  {f === "WATCH" ? "BOOK" : f}
                </button>
              ))}
            </div>

            <div className="mt-4 hidden grid-cols-12 gap-2 px-3 font-mono text-[10px] tracking-wider text-mute uppercase md:grid">
              <SortBtn k="score" sort={sort} setSort={setSort} className="col-span-3">
                token
              </SortBtn>
              <span>call</span>
              <SortBtn k="m5" sort={sort} setSort={setSort}>
                5m
              </SortBtn>
              <SortBtn k="h1" sort={sort} setSort={setSort}>
                1h
              </SortBtn>
              <SortBtn k="h24" sort={sort} setSort={setSort}>
                24h
              </SortBtn>
              <SortBtn k="vol" sort={sort} setSort={setSort}>
                vol
              </SortBtn>
              <SortBtn k="liq" sort={sort} setSort={setSort}>
                liq
              </SortBtn>
              <SortBtn k="age" sort={sort} setSort={setSort}>
                age
              </SortBtn>
              <span>tape</span>
            </div>

            <div className="mt-2 space-y-2">
              {rows.length === 0 ? (
                <p className="px-3 py-8 font-mono text-sm text-mute">nothing matches.</p>
              ) : (
                rows.map((t) => (
                  <TokenRow
                    key={t.mint}
                    token={t}
                    watched={watch.includes(t.mint)}
                    copied={copied === t.mint}
                    open={open === t.mint}
                    onOpen={() => setOpen(open === t.mint ? null : t.mint)}
                    onWatch={() => toggleWatch(t.mint)}
                    onCopy={() => copy(t.mint)}
                  />
                ))
              )}
            </div>

            <h2 className="mt-14 font-serif text-4xl text-cream">fresh</h2>
            <p className="mt-1 text-sm text-mute">
              Under 90 minutes old. Most die. Only touch the ones with volume and a buy tape.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.fresh.length === 0 ? (
                <p className="font-mono text-sm text-mute">no fresh names with real flow.</p>
              ) : (
                data.fresh.map((t) => (
                  <MiniCard
                    key={t.mint}
                    token={t}
                    watched={watch.includes(t.mint)}
                    copied={copied === t.mint}
                    onWatch={() => toggleWatch(t.mint)}
                    onCopy={() => copy(t.mint)}
                  />
                ))
              )}
            </div>

            <h2 className="mt-14 font-serif text-4xl text-cream">narratives</h2>
            <p className="mt-1 text-sm text-mute">
              Dexscreener metas ranked by heat. Green 5m/1h means money is rotating in.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.metas.map((m) => (
                <MetaCard key={m.slug} meta={m} />
              ))}
            </div>

            <section className="mt-14 border-t border-line pt-10">
              <h2 className="font-serif text-4xl text-cream">when to press</h2>
              <div className="mt-6 grid gap-8 md:grid-cols-3">
                <Play
                  title="buy"
                  items={[
                    "First identify the viral meme. Then buy a cheaper name that rhymes with it.",
                    "Under ~$4M, 8 minutes to 3 hours, buyers on the 5m tape.",
                    "Do not chase the original after it's already 3x. That's the wick. The copies are the trade.",
                    "Track it so the sell call lands in your book.",
                  ]}
                />
                <Play
                  title="sell"
                  items={[
                    "Default exit: sell half at +80–120%. Trail the rest.",
                    "Full out if 5m closes red, or 5m tape drops under 45% buys.",
                    "Hard stop: 5m −12%. Don't negotiate with it.",
                    "If 24h already ran 3x+ and 5m rolls over, you're late. Flatten, don't dip-buy.",
                  ]}
                />
                <Play
                  title="skip"
                  items={[
                    "Over ~$12M or older than 2 days. That's not early.",
                    "Liq under $5k. You are the exit liquidity.",
                    "Brand new with no buyers. Sniper farm.",
                    "You already missed it and you're mad. That's how bags happen.",
                  ]}
                />
              </div>
              <p className="mt-10 max-w-2xl font-mono text-[11px] leading-relaxed text-mute">
                Signals are heuristics on public DEX data (GeckoTerminal + Dexscreener). They are
                not a crystal ball, not financial advice, and shitcoins can go to zero in a minute.
                This desk exists so you stop apeing blind — not so you ape bigger.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function ViralCard({
  story,
  watch,
  copied,
  onWatch,
  onCopy,
}: {
  story: ViralStory;
  watch: string[];
  copied: string;
  onWatch: (mint: string) => void;
  onCopy: (mint: string) => void;
}) {
  return (
    <div className="rounded-xl border border-gold/35 bg-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] tracking-[0.22em] text-gold uppercase">
            {story.emoji} {story.viral}
          </div>
          <h3 className="mt-1 max-w-xl font-serif text-2xl leading-tight text-cream">
            {story.headline}
          </h3>
        </div>
        {story.leader && (
          <div className="text-right">
            <div className="font-mono text-[10px] text-mute uppercase">already ripping</div>
            <div className="text-cream">${story.leader.symbol}</div>
            <div className="font-mono text-xs">
              <Delta n={story.leader.change.h1} /> 1h · {compact(story.leader.mcap)}
            </div>
          </div>
        )}
      </div>
      {story.lookalikes.length === 0 ? (
        <p className="mt-4 font-mono text-xs text-mute">
          no cheap rhyme on the tape yet — watch new names that sound like {story.viral}.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {story.lookalikes.map((t) => (
            <div key={t.mint} className="rounded-lg border border-line bg-ink/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-cream">${t.symbol}</div>
                  <div className="font-mono text-[10px] text-mute">
                    {compact(t.mcap)} · {ageLabel(t.ageMin)}
                  </div>
                </div>
                <Badge action={t.action} />
              </div>
              <p className="mt-2 line-clamp-3 text-[12px] leading-snug text-mute">
                {t.meme?.why || t.when}
              </p>
              <div className="mt-2">
                <Links
                  token={t}
                  watched={watch.includes(t.mint)}
                  copied={copied === t.mint}
                  onWatch={() => onWatch(t.mint)}
                  onCopy={() => onCopy(t.mint)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "go" | "stop" | "warn";
}) {
  const color =
    tone === "go" ? "text-go" : tone === "stop" ? "text-stop" : tone === "warn" ? "text-warn" : "text-cream";
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3">
      <div className="font-mono text-[10px] tracking-[0.18em] text-mute uppercase">{label}</div>
      <div className={`mt-1 font-serif text-2xl ${color}`}>{value}</div>
    </div>
  );
}

function DeskCol({
  title,
  hint,
  tone,
  empty,
  tokens,
  watch,
  copied,
  onWatch,
  onCopy,
  open,
  setOpen,
  line,
}: {
  title: string;
  hint: string;
  tone: "go" | "stop" | "warn";
  empty: string;
  tokens: Token[];
  watch: string[];
  copied: string;
  onWatch: (mint: string) => void;
  onCopy: (mint: string) => void;
  open: string | null;
  setOpen: (mint: string | null) => void;
  line: "when" | "sell";
}) {
  const border =
    tone === "go" ? "border-go/40" : tone === "stop" ? "border-stop/40" : "border-warn/40";
  const label =
    tone === "go" ? "text-go" : tone === "stop" ? "text-stop" : "text-warn";
  return (
    <div className={`rounded-xl border bg-panel ${border}`}>
      <div className="border-b border-line px-4 py-3">
        <div className={`font-mono text-[10px] tracking-[0.22em] uppercase ${label}`}>{title}</div>
        <div className="text-sm text-mute">{hint}</div>
      </div>
      <div className="divide-y divide-line">
        {tokens.length === 0 ? (
          <p className="px-4 py-8 font-mono text-xs text-mute">{empty}</p>
        ) : (
          tokens.map((t) => (
            <button
              key={t.mint}
              onClick={() => setOpen(open === t.mint ? null : t.mint)}
              className="block w-full px-4 py-3 text-left hover:bg-cream/[0.03]"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar token={t} />
                  <div className="min-w-0">
                    <div className="truncate font-medium text-cream">${t.symbol}</div>
                    <div className="truncate font-mono text-[10px] text-mute">
                      {compact(t.mcap)} · {ageLabel(t.ageMin)} · {compact(t.liquidity)} liq
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <Badge action={t.action} />
                  <div className="mt-1 font-mono text-[11px]">
                    <Delta n={t.change.m5} />
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[13px] leading-snug text-mute">
                {line === "sell" ? t.sellPlan : t.when}
              </p>
              {open === t.mint && (
                <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                  {line !== "sell" && (
                    <p className="mb-3 text-[12px] leading-snug text-gold">{t.sellPlan}</p>
                  )}
                  <Links
                    token={t}
                    watched={watch.includes(t.mint)}
                    copied={copied === t.mint}
                    onWatch={() => onWatch(t.mint)}
                    onCopy={() => onCopy(t.mint)}
                  />
                </div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function TokenRow({
  token: t,
  watched,
  copied,
  open,
  onOpen,
  onWatch,
  onCopy,
}: {
  token: Token;
  watched: boolean;
  copied: boolean;
  open: boolean;
  onOpen: () => void;
  onWatch: () => void;
  onCopy: () => void;
}) {
  const r = buyRatio(t.tx.m5.buys, t.tx.m5.sells);
  return (
    <div className="rounded-lg border border-line bg-panel">
      <button
        onClick={onOpen}
        className="grid w-full grid-cols-2 items-center gap-2 px-3 py-3 text-left md:grid-cols-12"
      >
        <div className="col-span-2 flex min-w-0 items-center gap-2 md:col-span-3">
          <Avatar token={t} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-cream">${t.symbol}</span>
              <span className="hidden font-mono text-[10px] text-mute sm:inline">
                {usd(t.price)}
              </span>
            </div>
            <div className="truncate font-mono text-[10px] text-mute">
              {t.name} · {compact(t.mcap)}
            </div>
          </div>
        </div>
        <div className="md:col-span-1">
          <Badge action={t.action} />
          <div className="mt-0.5 font-mono text-[10px] text-mute">{t.score}</div>
        </div>
        <div className="font-mono text-xs">
          <Delta n={t.change.m5} />
        </div>
        <div className="hidden font-mono text-xs md:block">
          <Delta n={t.change.h1} />
        </div>
        <div className="hidden font-mono text-xs md:block">
          <Delta n={t.change.h24} />
        </div>
        <div className="hidden font-mono text-xs text-cream md:block">
          {compact(t.volume.h24)}
        </div>
        <div className="hidden font-mono text-xs text-cream md:block">
          {compact(t.liquidity)}
        </div>
        <div className="hidden font-mono text-xs text-mute md:block">
          {ageLabel(t.ageMin)}
        </div>
        <div className="hidden md:block">
          <Tape ratio={r} />
        </div>
      </button>
      {open && (
        <div className="border-t border-line px-4 py-4">
          {t.meme && (
            <p className="mb-2 font-mono text-[11px] tracking-wide text-gold uppercase">
              {t.meme.relation === "lookalike" ? "rhyme" : "original"} · {t.meme.viral}
            </p>
          )}
          <p className="text-sm leading-relaxed text-cream">{t.when}</p>
          <p className="mt-2 text-sm leading-relaxed text-gold">{t.sellPlan}</p>
          <ul className="mt-2 space-y-1 font-mono text-[11px] text-mute">
            {t.reasons.map((r) => (
              <li key={r}>— {r}</li>
            ))}
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px] text-mute sm:grid-cols-4">
            <span>5m vol {compact(t.volume.m5)}</span>
            <span>
              5m tx {t.tx.m5.buys}b / {t.tx.m5.sells}s
            </span>
            <span>buyers {t.tx.h1.buyers} / sellers {t.tx.h1.sellers}</span>
            <span>
              {t.onCurve ? "on curve" : dexLabel(t.dex)} · size {t.size}
            </span>
          </div>
          <div className="mt-3">
            <Links token={t} watched={watched} copied={copied} onWatch={onWatch} onCopy={onCopy} />
          </div>
        </div>
      )}
    </div>
  );
}

function MiniCard({
  token: t,
  watched,
  copied,
  onWatch,
  onCopy,
}: {
  token: Token;
  watched: boolean;
  copied: boolean;
  onWatch: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar token={t} />
          <div className="min-w-0">
            <div className="truncate text-cream">${t.symbol}</div>
            <div className="font-mono text-[10px] text-mute">
              {compact(t.mcap)} · {ageLabel(t.ageMin)} · {compact(t.volume.m5)} vol
            </div>
          </div>
        </div>
        <Badge action={t.action} />
      </div>
      <div className="mt-3 flex items-center justify-between font-mono text-xs">
        <Delta n={t.change.m5} />
        <span className="text-mute">{compact(t.liquidity)} liq</span>
      </div>
      <p className="mt-2 line-clamp-3 text-[12px] leading-snug text-mute">{t.when}</p>
      <div className="mt-3">
        <Links token={t} watched={watched} copied={copied} onWatch={onWatch} onCopy={onCopy} />
      </div>
    </div>
  );
}

function MetaCard({ meta }: { meta: Meta }) {
  return (
    <a
      href={`https://dexscreener.com/solana/${meta.slug}`}
      target="_blank"
      rel="noreferrer"
      className="rounded-lg border border-line bg-panel p-4 hover:border-gold/40"
    >
      <div className="flex items-center justify-between">
        <div className="text-cream">
          <span className="mr-2">{meta.emoji}</span>
          {meta.name}
        </div>
        <span className="font-mono text-xs">
          5m <Delta n={meta.change.m5} /> · 1h <Delta n={meta.change.h1} />
        </span>
      </div>
      <p className="mt-1 text-[12px] text-mute">{meta.description}</p>
      <div className="mt-3 flex gap-4 font-mono text-[10px] text-mute">
        <span>mcap {compact(meta.marketCap)}</span>
        <span>vol {compact(meta.volume)}</span>
        <span>{meta.tokenCount} coins</span>
      </div>
    </a>
  );
}

function Play({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="font-mono text-[11px] tracking-[0.22em] text-gold uppercase">{title}</h3>
      <ul className="mt-3 space-y-3 text-sm leading-relaxed text-mute">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function Avatar({ token }: { token: Token }) {
  if (token.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={token.image}
        alt=""
        className="h-8 w-8 rounded-full border border-line object-cover"
      />
    );
  }
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-gold/30 bg-ink font-mono text-[10px] text-gold">
      {token.symbol.slice(0, 2)}
    </div>
  );
}

function Badge({ action, tiny }: { action: Action; tiny?: boolean }) {
  const map: Record<Action, string> = {
    APE: "bg-go/15 text-go border-go/30",
    BUY: "bg-go/10 text-go border-go/25",
    HOLD: "bg-cream/5 text-mute border-line",
    SELL: "bg-stop/10 text-stop border-stop/30",
    FADE: "bg-warn/10 text-warn border-warn/30",
    AVOID: "bg-mute/10 text-mute border-line",
  };
  return (
    <span
      className={`inline-flex rounded border font-mono uppercase ${map[action]} ${
        tiny ? "px-1 py-0 text-[9px]" : "px-1.5 py-0.5 text-[10px]"
      }`}
    >
      {action}
    </span>
  );
}

function Delta({ n }: { n: number }) {
  const v = Number.isFinite(n) ? n : 0;
  const color = v > 0.05 ? "text-go" : v < -0.05 ? "text-stop" : "text-mute";
  return <span className={color}>{pct(v)}</span>;
}

function Tape({ ratio }: { ratio: number }) {
  const pctBuy = Math.round(ratio * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-stop/40">
        <div className="h-full bg-go" style={{ width: `${pctBuy}%` }} />
      </div>
      <span className="font-mono text-[10px] text-mute">{pctBuy}%</span>
    </div>
  );
}

function Links({
  token,
  watched,
  copied,
  onWatch,
  onCopy,
}: {
  token: Token;
  watched: boolean;
  copied: boolean;
  onWatch: () => void;
  onCopy: () => void;
}) {
  const dex = `https://dexscreener.com/solana/${token.pool}`;
  const jup = `https://jup.ag/swap/SOL-${token.mint}`;
  const bird = `https://birdeye.so/token/${token.mint}?chain=solana`;
  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] tracking-wider uppercase">
      <button
        onClick={onCopy}
        className="rounded border border-line px-2 py-1 text-mute hover:text-cream"
      >
        {copied ? "copied" : shortMint(token.mint)}
      </button>
      <a href={dex} target="_blank" rel="noreferrer" className="rounded border border-line px-2 py-1 text-mute hover:text-cream">
        dex
      </a>
      <a href={jup} target="_blank" rel="noreferrer" className="rounded border border-line px-2 py-1 text-mute hover:text-cream">
        jup
      </a>
      <a href={bird} target="_blank" rel="noreferrer" className="rounded border border-line px-2 py-1 text-mute hover:text-cream">
        birdeye
      </a>
      <button
        onClick={onWatch}
        className={`rounded border px-2 py-1 ${
          watched ? "border-gold text-gold" : "border-line text-mute hover:text-cream"
        }`}
      >
        {watched ? "in book" : "track"}
      </button>
    </div>
  );
}

function SortBtn({
  k,
  sort,
  setSort,
  className,
  children,
}: {
  k: SortKey;
  sort: SortKey;
  setSort: (k: SortKey) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={() => setSort(k)}
      className={`text-left ${sort === k ? "text-gold" : ""} ${className || ""}`}
    >
      {children}
    </button>
  );
}
