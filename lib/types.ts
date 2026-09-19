export type Action = "APE" | "BUY" | "HOLD" | "SELL" | "FADE" | "AVOID";

export type SizeHint = "tiny" | "small" | "skip";

export type TxWindow = {
  buys: number;
  sells: number;
  buyers: number;
  sellers: number;
};

export type Token = {
  mint: string;
  pool: string;
  symbol: string;
  name: string;
  image: string | null;
  dex: string;
  price: number;
  mcap: number;
  liquidity: number;
  ageMin: number;
  createdAt: string;
  change: { m5: number; m15: number; h1: number; h6: number; h24: number };
  volume: { m5: number; h1: number; h6: number; h24: number };
  tx: { m5: TxWindow; h1: TxWindow; h24: TxWindow };
  sources: string[];
  onCurve: boolean;
  score: number;
  action: Action;
  reasons: string[];
  when: string;
  size: SizeHint;
};

export type Meta = {
  name: string;
  slug: string;
  description: string;
  emoji: string;
  marketCap: number;
  volume: number;
  tokenCount: number;
  change: { m5: number; h1: number; h6: number; h24: number };
};

export type ScreenerResponse = {
  updatedAt: string;
  sol: { price: number; change24h: number };
  tokens: Token[];
  fresh: Token[];
  metas: Meta[];
  desk: {
    ape: Token[];
    exit: Token[];
    skip: Token[];
  };
  stats: {
    scanned: number;
    ape: number;
    sell: number;
    avoid: number;
    hottest: string | null;
  };
};
