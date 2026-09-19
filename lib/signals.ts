import { buyRatio, num } from "./format";
import type { Action, SizeHint, Token, TxWindow } from "./types";

type Input = Omit<Token, "score" | "action" | "reasons" | "when" | "size">;

function windowPressure(tx: TxWindow) {
  return buyRatio(tx.buys, tx.sells);
}

export function grade(token: Input): Pick<Token, "score" | "action" | "reasons" | "when" | "size"> {
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
  const uniqueBuy = token.tx.h1.buyers >= token.tx.h1.sellers;

  if (liq >= 40_000 && liq <= 2_500_000) {
    score += 10;
    reasons.push(`liq ${compactReason(liq)} is tradeable`);
  } else if (liq >= 15_000) {
    score += 4;
  } else if (liq < 8_000) {
    score -= 22;
    reasons.push("thin liquidity — exit is a prayer");
  }

  if (v.h1 >= 200_000) {
    score += 10;
    reasons.push("real 1h volume");
  } else if (v.h1 >= 40_000) {
    score += 6;
  } else if (v.m5 >= 8_000) {
    score += 5;
  } else if (v.h24 < 2_000 && age > 20) {
    score -= 12;
    reasons.push("volume is dead");
  }

  if (volMcap >= 1.2) {
    score += 8;
    reasons.push("turnover is high — people are actually trading it");
  } else if (volMcap >= 0.4) {
    score += 4;
  }

  if (p5 >= 0.62 && tx5 >= 8) {
    score += 10;
    reasons.push(`5m tape is ${Math.round(p5 * 100)}% buys`);
  } else if (p5 <= 0.38 && tx5 >= 8) {
    score -= 12;
    reasons.push(`5m tape is ${Math.round((1 - p5) * 100)}% sells`);
  }

  if (p1 >= 0.56 && tx1 >= 20) {
    score += 6;
  } else if (p1 <= 0.42 && tx1 >= 20) {
    score -= 8;
  }

  if (uniqueBuy && token.tx.h1.buyers >= 20) {
    score += 4;
  }

  if (age >= 15 && age <= 360) {
    score += 10;
    reasons.push("in the 15m–6h window where memes actually run");
  } else if (age > 360 && age <= 60 * 36) {
    score += 5;
  } else if (age < 8) {
    score -= 6;
    reasons.push("brand new — snipers and rugs live here");
  } else if (age > 60 * 24 * 21 && Math.abs(c.h24) < 8) {
    score -= 6;
  }

  if (c.m5 >= 3 && c.m5 <= 22) {
    score += 8;
    reasons.push("5m is grinding up, not vertical");
  } else if (c.m5 > 22 && c.m5 <= 55) {
    score += 2;
    reasons.push("hot 5m — don't chase the wick");
  } else if (c.m5 > 70) {
    score -= 14;
    reasons.push("5m already vertical. you are late to this candle");
  }

  if (c.h1 >= 6 && c.h1 <= 45) {
    score += 8;
  } else if (c.h1 > 80 && c.m5 < 0) {
    score -= 14;
    reasons.push("1h ran, 5m rolling over");
  }

  if (c.h24 >= 200 && c.h1 < 0) {
    score -= 12;
    reasons.push("24h already cooked and 1h is red");
  }
  if (c.h24 >= 800) {
    score -= 8;
    reasons.push("parabolic 24h — bag-maker territory");
  }
  if (c.h1 >= 100 && c.m5 >= 20) {
    score -= 16;
    reasons.push("already vertical this hour — chasing");
  }
  if (c.h24 >= 150 && c.h24 < 400 && c.m5 < 12 && c.h1 > 0) {
    reasons.push("extended runner — dip only, not a fresh ape");
  }
  if (mcap > 80_000_000) {
    score -= 8;
    reasons.push("too big to be a shitcoin sniper");
  }

  if (c.m5 <= -12 && c.h1 <= -8) {
    score -= 14;
    reasons.push("both 5m and 1h are dumping");
  } else if (c.m5 <= -8) {
    score -= 6;
  }

  if (token.onCurve) {
    score -= 6;
    reasons.push("still on the pump.fun curve");
  }
  if (liq < 1 && !token.onCurve) {
    score -= 20;
    reasons.push("no reserves — dead or rugged");
  }

  if (token.sources.includes("5m") && token.sources.includes("1h")) {
    score += 6;
    reasons.push("showing up on both 5m and 1h trend");
  } else if (token.sources.includes("5m")) {
    score += 3;
  }

  score = Math.max(0, Math.min(99, Math.round(score)));

  let action: Action = "HOLD";
  const tooBig = mcap > 80_000_000;
  const parabolic = c.h1 >= 100 && c.m5 >= 18;
  if (liq < 8_000 || (liq < 1 && !token.onCurve) || (score < 28 && c.m5 <= 0)) {
    action = "AVOID";
  } else if (parabolic || (c.h24 >= 180 && c.m5 < 0 && c.h1 < 8) || (c.h24 >= 400 && c.m5 > 25)) {
    action = "FADE";
  } else if (
    c.m5 <= -18 ||
    (c.m5 <= -8 && (c.h1 < 0 || p5 < 0.42)) ||
    (score < 38 && c.m5 < 0 && p5 < 0.45)
  ) {
    action = "SELL";
  } else if (
    !tooBig &&
    score >= 72 &&
    liq >= 15_000 &&
    c.m5 > -5 &&
    c.m5 < 25 &&
    c.h1 < 55 &&
    c.h24 < 150
  ) {
    action = "APE";
  } else if (!tooBig && score >= 58 && c.m5 > -12 && c.m5 < 40 && c.h24 < 400) {
    action = "BUY";
  } else if (score < 36) {
    action = "AVOID";
  }

  if (c.h24 >= 500 && action !== "SELL" && action !== "AVOID") {
    action = "FADE";
  }

  let size: SizeHint = "skip";
  if (action === "APE") size = age < 90 || liq < 40_000 ? "tiny" : "small";
  else if (action === "BUY") size = "small";

  const when = writeWhen(action, token, p5, age, liq);

  if (reasons.length === 0) {
    reasons.push("no clean edge on this tape");
  }

  return { score, action, reasons: reasons.slice(0, 4), when, size };
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
) {
  const sym = `$${token.symbol}`;
  switch (action) {
    case "APE":
      return liq < 40_000 || age < 90
        ? `${sym}: size tiny. buyers have the tape. if 5m flips red and stays there, you're out.`
        : `${sym}: small size. wait a 5m dip if you can — don't market-buy a green wick. trail if it holds.`;
    case "BUY":
      return `${sym}: momentum is there, not a slam dunk. scale in. invalid if 5m closes worse than ${token.change.m5.toFixed(0)}% and sellers take over.`;
    case "HOLD":
      return `${sym}: no clean edge. if you're in, trail. if you're not, skip and hunt a cleaner tape.`;
    case "SELL":
      return `${sym}: sellers have it. if you're up, take it. if you're not in, do not catch this knife.`;
    case "FADE":
      return `${sym}: the move already happened. chasing here is how bags get made. take profit if you're in.`;
    case "AVOID":
      return p5 < 0.4
        ? `${sym}: skip. tape is ugly and there's nothing to do.`
        : `${sym}: skip. too thin, too new, or already dead. next chart.`;
  }
}

export function deskPick(tokens: Token[]) {
  const ape = tokens
    .filter((t) => t.action === "APE" || t.action === "BUY")
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  const exit = tokens
    .filter((t) => t.action === "SELL" || t.action === "FADE")
    .sort((a, b) => a.score - b.score)
    .slice(0, 4);
  const skip = tokens
    .filter((t) => t.action === "AVOID")
    .sort((a, b) => a.liquidity - b.liquidity)
    .slice(0, 4);
  return { ape, exit, skip };
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
