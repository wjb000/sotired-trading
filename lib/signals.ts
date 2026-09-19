import { buyRatio, num } from "./format";
import type { Action, SizeHint, Token, TxWindow } from "./types";

type Input = Omit<Token, "score" | "action" | "reasons" | "when" | "sellPlan" | "size">;

export const MAX_SCREEN_MCAP = 12_000_000;
export const APE_MCAP = 4_000_000;
export const BUY_MCAP = 8_000_000;

function windowPressure(tx: TxWindow) {
  return buyRatio(tx.buys, tx.sells);
}

export function grade(
  token: Input,
): Pick<Token, "score" | "action" | "reasons" | "when" | "sellPlan" | "size"> {
  const reasons: string[] = [];
  let score = 50;

  const liq = token.liquidity;
  const mcap = token.mcap || 0;
  const age = token.ageMin;
  const c = token.change;
  const v = token.volume;
  const p5 = windowPressure(token.tx.m5);
  const p1 = windowPressure(token.tx.h1);
  const tx5 = token.tx.m5.buys + token.tx.m5.sells;
  const tx1 = token.tx.h1.buys + token.tx.h1.sells;
  const volMcap = mcap > 0 ? v.h24 / mcap : v.h24 > 0 ? 2 : 0;

  if (mcap > 0 && mcap <= 400_000) {
    score += 14;
    reasons.push(`microcap ${compactReason(mcap)} — this is the hunt`);
  } else if (mcap <= 2_000_000) {
    score += 10;
    reasons.push(`still early mcap ${compactReason(mcap)}`);
  } else if (mcap <= 8_000_000) {
    score += 3;
  } else if (mcap > 12_000_000) {
    score -= 28;
    reasons.push("too big — you missed the easy money");
  }

  if (age >= 8 && age <= 180) {
    score += 14;
    reasons.push("in the 8m–3h window. this is when you actually buy");
  } else if (age > 180 && age <= 360) {
    score += 8;
  } else if (age > 360 && age <= 60 * 18) {
    score += 2;
  } else if (age < 6) {
    score -= 5;
    reasons.push("brand new — snipers first, you second");
  } else if (age > 60 * 36) {
    score -= 14;
    reasons.push("old tape. not an early entry");
  }

  if (liq >= 10_000 && liq <= 350_000) {
    score += 10;
    reasons.push(`liq ${compactReason(liq)} is tradeable for a small size`);
  } else if (liq >= 7_000) {
    score += 4;
  } else if (liq < 5_000) {
    score -= 22;
    reasons.push("thin liquidity — you will not get a clean exit");
  }

  if (v.m5 >= 8_000) {
    score += 8;
    reasons.push("5m volume is real");
  } else if (v.h1 >= 25_000) {
    score += 6;
  } else if (v.h24 < 1_500 && age > 20) {
    score -= 12;
    reasons.push("volume is dead");
  }

  if (volMcap >= 1.5) score += 6;
  else if (volMcap >= 0.5) score += 3;

  if (p5 >= 0.6 && tx5 >= 6) {
    score += 10;
    reasons.push(`5m tape is ${Math.round(p5 * 100)}% buys`);
  } else if (p5 <= 0.38 && tx5 >= 6) {
    score -= 14;
    reasons.push(`5m tape is ${Math.round((1 - p5) * 100)}% sells — dump`);
  }

  if (p1 >= 0.55 && tx1 >= 12) score += 5;
  else if (p1 <= 0.4 && tx1 >= 12) score -= 8;

  if (c.m5 >= 2 && c.m5 <= 18) {
    score += 8;
    reasons.push("5m grinding up. buyable");
  } else if (c.m5 > 18 && c.m5 <= 40) {
    score += 1;
    reasons.push("5m already hot — wait a dip, don't chase");
  } else if (c.m5 > 45) {
    score -= 16;
    reasons.push("5m vertical. you are late to this candle");
  }

  if (c.h1 >= 5 && c.h1 <= 50) score += 6;
  else if (c.h1 > 90 && c.m5 < 0) {
    score -= 14;
    reasons.push("1h already ran, 5m rolling over. sell not buy");
  }

  if (c.h24 >= 150) {
    score -= 10;
    reasons.push("already extended on 24h");
  }
  if (c.h24 >= 400) score -= 8;

  if (c.m5 <= -12 && c.h1 <= -6) {
    score -= 16;
    reasons.push("5m and 1h dumping. flatten");
  } else if (c.m5 <= -10) {
    score -= 8;
  }

  if (token.onCurve) {
    score -= 4;
    reasons.push("still on the pump.fun curve — size extra tiny");
  }
  if (liq < 1 && !token.onCurve) {
    score -= 22;
    reasons.push("no reserves — dead or rugged");
  }

  if (token.sources.includes("5m")) score += 4;
  if (token.sources.includes("new") && v.m5 >= 3_000) score += 4;

  score = Math.max(0, Math.min(99, Math.round(score)));

  const early = age <= 18 * 60 && mcap <= APE_MCAP;
  const stillSmall = mcap <= BUY_MCAP && age <= 36 * 60;
  const parabolic = c.h1 >= 80 && c.m5 >= 16;
  const dumping = c.m5 <= -12 || (c.m5 <= -8 && (c.h1 < 0 || p5 < 0.42));
  const late = c.h24 >= 250 || (c.h1 >= 100 && c.m5 < 5);

  let action: Action = "HOLD";
  if (liq < 5_000 || (liq < 1 && !token.onCurve) || mcap > MAX_SCREEN_MCAP) {
    action = "AVOID";
  } else if (dumping) {
    action = "SELL";
  } else if (parabolic || late) {
    action = "FADE";
  } else if (
    early &&
    score >= 68 &&
    liq >= 8_000 &&
    c.m5 > -6 &&
    c.m5 < 22 &&
    c.h1 < 70 &&
    c.h24 < 180
  ) {
    action = "APE";
  } else if (stillSmall && score >= 56 && c.m5 > -10 && c.m5 < 35 && c.h24 < 220) {
    action = "BUY";
  } else if (score < 34) {
    action = "AVOID";
  }

  let size: SizeHint = "skip";
  if (action === "APE" || action === "BUY") {
    size = age < 90 || liq < 25_000 || token.onCurve || mcap < 250_000 ? "tiny" : "small";
  }

  const when = writeWhen(action, token, p5, age, liq, mcap);
  const sellPlan = writeSellPlan(action, token, p5);

  if (reasons.length === 0) reasons.push("no clean edge on this tape");

  return { score, action, reasons: reasons.slice(0, 4), when, sellPlan, size };
}

function compactReason(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

function writeWhen(
  action: Action,
  token: Input,
  p5: number,
  age: number,
  liq: number,
  mcap: number,
) {
  const sym = `$${token.symbol}`;
  const ageBit = age < 60 ? `${Math.round(age)}m old` : `${(age / 60).toFixed(1)}h old`;
  const capBit = compactReason(mcap || 0);
  switch (action) {
    case "APE":
      return `${sym} · ${ageBit} · ${capBit}. BUY NOW, ${liq < 25_000 || age < 90 ? "tiny" : "small"} size. If 5m is already ripping, wait a dip. Sell half at +80–120%, rest when 5m flips red.`;
    case "BUY":
      return `${sym} · ${ageBit} · ${capBit}. Buy a starter. Invalid if 5m closes red and stays there. Same exit: half at ~2x, flatten on a red 5m.`;
    case "HOLD":
      return `${sym}: no fresh entry. If you're already in, trail it. Sell if 5m and 1h are both red. If you're not in, skip.`;
    case "SELL":
      return `${sym}: SELL NOW if you're in. 5m is dumping (${token.change.m5.toFixed(0)}%, tape ${Math.round((1 - p5) * 100)}% sells). Do not buy the dip.`;
    case "FADE":
      return `${sym}: too late. Move already happened. If you're in, take profit / flatten. Do not open a bag here.`;
    case "AVOID":
      return `${sym}: skip. Too thin, too big, too old, or already dead.`;
  }
}

function writeSellPlan(action: Action, token: Input, p5: number) {
  const c = token.change;
  if (action === "SELL") {
    return "SELL NOW. Flatten the whole bag. 5m dumped. Don't wait for a bounce — that's how you bag it.";
  }
  if (action === "FADE") {
    if (c.m5 < 0) {
      return "IF YOU'RE IN: sell here. 24h already ran and 5m rolled over. IF YOU'RE NOT: do not chase.";
    }
    return "IF YOU'RE IN: sell at least half now, trail the rest. Full out if 5m goes red. Too late to open.";
  }
  if (action === "APE" || action === "BUY") {
    return "EXIT: sell 50% at +80–120%. Trail the rest. Full out if 5m closes red or buy-tape drops under 45%. Hard stop: 5m −12%. Don't hold overnight.";
  }
  if (action === "HOLD") {
    return "IF YOU'RE IN: trail. Sell if 5m and 1h print red together, or if 5m tape flips under 40% buys. IF NOT IN: skip.";
  }
  return "Don't open. Nothing to sell.";
}

export function deskPick(tokens: Token[]) {
  const ape = tokens
    .filter((t) => t.action === "APE" || t.action === "BUY")
    .sort((a, b) => earlyRank(b) - earlyRank(a))
    .slice(0, 5);
  const exit = tokens
    .filter((t) => t.action === "SELL" || t.action === "FADE")
    .sort((a, b) => a.change.m5 - b.change.m5)
    .slice(0, 5);
  const skip = tokens
    .filter((t) => t.action === "AVOID")
    .sort((a, b) => a.liquidity - b.liquidity)
    .slice(0, 4);
  return { ape, exit, skip };
}

function earlyRank(t: Token) {
  const mcapPenalty = Math.log10(Math.max(t.mcap, 2_000)) * 7;
  const agePenalty = (t.ageMin / 60) * 4;
  const buyBonus = t.action === "APE" ? 8 : 0;
  return t.score + buyBonus - mcapPenalty - agePenalty;
}

export function toTx(raw: unknown): TxWindow {
  const r = (raw || {}) as Record<string, unknown>;
  return {
    buys: num(r.buys),
    sells: num(r.sells),
    buyers: num(r.buyers),
    sellers: num(r.sellers),
  };
}
