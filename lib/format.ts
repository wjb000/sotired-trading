export function num(value: unknown) {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export function compact(n: number, digits = 1) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(digits)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(digits)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(digits)}K`;
  if (abs >= 100) return `${sign}$${abs.toFixed(0)}`;
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function usd(n: number) {
  if (n === 0) return "$0";
  if (n >= 1) {
    return n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: n >= 100 ? 2 : 4,
    });
  }
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  const s = n.toPrecision(3);
  return `$${s}`;
}

export function pct(n: number, digits = 1) {
  const v = Number.isFinite(n) ? n : 0;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
}

export function ageLabel(min: number) {
  if (min < 1) return `${Math.max(1, Math.round(min * 60))}s`;
  if (min < 60) return `${Math.round(min)}m`;
  if (min < 60 * 24) {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(min / (60 * 24));
  return `${d}d`;
}

export function buyRatio(buys: number, sells: number) {
  const t = buys + sells;
  return t === 0 ? 0.5 : buys / t;
}

export function shortMint(mint: string) {
  if (mint.length < 10) return mint;
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

export function dexLabel(dex: string) {
  const map: Record<string, string> = {
    "pump-fun": "pump.fun",
    pumpswap: "PumpSwap",
    "raydium-launchlab": "LaunchLab",
    "raydium-clmm": "Raydium CLMM",
    raydium: "Raydium",
    meteora: "Meteora",
    "meteora-dbc": "Meteora DBC",
    "meteora-damm-v2": "Meteora",
    orca: "Orca",
  };
  return map[dex] || dex;
}
