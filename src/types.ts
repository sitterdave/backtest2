// ── Data Types (matching the raw market data) ──

export type Asset = "BTC" | "ETH" | "XRP" | "SOL";
export type Outcome = "YES" | "NO" | "UNKNOWN";
export type TradeSide = "YES" | "NO";
export type ExitType =
  | "EARLY_EXIT"         // gap closed to exitGap
  | "HOLD_TO_RESOLUTION" // held until event ended
  | "MAX_HOLD"           // forced exit after maxHoldMs
  | "STOP_LOSS";         // gap widened beyond stopLossGap

export interface Tick {
  timestamp: number; // unix ms

  // Legacy/simple prices (mid or last traded) — always required
  yesPrice: number;  // 0..1 (e.g. 0.72 = 72¢)
  noPrice: number;

  // Order book fields — optional, used for realistic execution if present
  bestYesBid?: number;  // best bid for YES shares
  bestYesAsk?: number;  // best ask for YES shares
  bestNoBid?: number;   // best bid for NO shares
  bestNoAsk?: number;   // best ask for NO shares
  yesDepth?: number;    // depth at top of YES book (in $)
  noDepth?: number;     // depth at top of NO book (in $)
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

export interface SkipReason {
  pair: { btcId: string; altId: string; altAsset: Asset };
  reason: string;
  timestamp: number;
}

export interface Trade {
  asset: Asset;
  direction: string;
  side: TradeSide;
  entryPrice: number;       // actual execution price (ask if order book available)
  entryTimestamp: number;
  gapAtEntry: number;
  exitType: ExitType;
  exitPrice: number;        // actual execution price (bid if order book available)
  exitTimestamp: number;
  grossPnl: number;         // PnL before fees/slippage
  fees: number;             // total fees (entry + exit)
  slippage: number;         // total estimated slippage
  pnl: number;              // net PnL = grossPnl - fees - slippage
  entrySpread?: number;     // spread at entry (if order book data)
  entryDepth?: number;      // depth at entry (if order book data)
}

export interface BacktestConfig {
  // ── Core strategy params ──
  minGap: number;       // minimum gap to trigger (e.g. 0.20)
  exitGap: number;      // gap considered closed (e.g. 0.05)
  checkStart: number;   // fraction of event duration to start scanning (e.g. 0.15)
  checkEnd: number;     // fraction of event duration to stop scanning (e.g. 0.55)
  stakeSize: number;    // dollars per trade (e.g. 10)

  // ── Fees & Slippage ──
  feePct: number;       // fee per transaction as fraction (e.g. 0.02 = 2%)
  slippagePct: number;  // estimated slippage per transaction as fraction (e.g. 0.01 = 1%)

  // ── Safety Rails ──
  maxHoldMs: number;      // max hold time in ms (0 = disabled). e.g. 420000 = 7 min
  stopLossGap: number;    // exit if gap widens beyond this (0 = disabled). e.g. 0.35
  minDepth: number;       // skip if depth at top < this in $ (0 = disabled). e.g. 5
  maxSpread: number;      // skip if spread > this (0 = disabled). e.g. 0.10
}

export interface BacktestResult {
  trades: Trade[];
  skips: SkipReason[];
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  totalGrossPnl: number;
  totalFees: number;
  totalSlippage: number;
  avgPnlPerTrade: number;
  earlyExitCount: number;
  earlyExitRate: number;
  holdToResolutionCount: number;
  maxHoldExitCount: number;
  stopLossExitCount: number;
  convergenceRate: number;
  skippedLiquidity: number;
}
