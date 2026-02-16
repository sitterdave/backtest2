// ── Data Types (matching the raw market data) ──

export type Asset = "BTC" | "ETH" | "XRP" | "SOL";
export type Outcome = "YES" | "NO" | "UNKNOWN";
export type TradeSide = "YES" | "NO";
export type ExitType = "EARLY_EXIT" | "HOLD_TO_RESOLUTION";

export interface Tick {
  timestamp: number; // unix ms
  yesPrice: number;  // 0..1 (e.g. 0.72 = 72¢)
  noPrice: number;
}

export interface Market {
  id: string;
  asset: Asset;
  direction: string;   // e.g. "Trump wins"
  startTime: number;   // unix ms
  endTime: number;     // unix ms
  ticks: Tick[];
  outcome: Outcome;
}

// ── Strategy Types ──

export interface Pair {
  btcMarket: Market;
  altMarket: Market;
}

export interface Trade {
  asset: Asset;
  direction: string;
  side: TradeSide;
  entryPrice: number;
  entryTimestamp: number;
  gapAtEntry: number;
  exitType: ExitType;
  exitPrice: number;
  exitTimestamp: number;
  pnl: number;
}

export interface BacktestConfig {
  minGap: number;       // minimum gap to trigger (e.g. 0.20)
  exitGap: number;      // gap considered closed (e.g. 0.05)
  checkStart: number;   // fraction of event duration to start scanning (e.g. 0.15)
  checkEnd: number;     // fraction of event duration to stop scanning (e.g. 0.55)
  stakeSize: number;    // dollars per trade (e.g. 10)
}

export interface BacktestResult {
  trades: Trade[];
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPnlPerTrade: number;
  earlyExitCount: number;
  earlyExitRate: number;
  holdToResolutionCount: number;
  convergenceRate: number; // how often gap closed (early exit = converged)
}
