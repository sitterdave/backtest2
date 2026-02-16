import { Market, BacktestConfig, BacktestResult, Trade, SkipReason } from "./types";
import { formPairs } from "./pairs";
import { processPair } from "./strategy";

export const DEFAULT_CONFIG: BacktestConfig = {
  // Core
  minGap: 0.20,
  exitGap: 0.05,
  checkStart: 0.15,
  checkEnd: 0.55,
  stakeSize: 10,
  // Fees & Slippage
  feePct: 0,
  slippagePct: 0,
  // Safety Rails (0 = disabled)
  maxHoldMs: 0,
  stopLossGap: 0,
  minDepth: 0,
  maxSpread: 0,
};

export function runBacktest(
  markets: Market[],
  configOverrides: Partial<BacktestConfig> = {}
): BacktestResult {
  const config: BacktestConfig = { ...DEFAULT_CONFIG, ...configOverrides };

  const pairs = formPairs(markets);

  const trades: Trade[] = [];
  const skips: SkipReason[] = [];

  for (const pair of pairs) {
    const result = processPair(pair, config);
    if (result.trade) trades.push(result.trade);
    if (result.skip) skips.push(result.skip);
  }

  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.filter((t) => t.pnl <= 0).length;
  const winRate = totalTrades > 0 ? wins / totalTrades : 0;
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const totalGrossPnl = trades.reduce((s, t) => s + t.grossPnl, 0);
  const totalFees = trades.reduce((s, t) => s + t.fees, 0);
  const totalSlippage = trades.reduce((s, t) => s + t.slippage, 0);
  const avgPnlPerTrade = totalTrades > 0 ? totalPnl / totalTrades : 0;
  const earlyExitCount = trades.filter((t) => t.exitType === "EARLY_EXIT").length;
  const earlyExitRate = totalTrades > 0 ? earlyExitCount / totalTrades : 0;
  const holdToResolutionCount = trades.filter((t) => t.exitType === "HOLD_TO_RESOLUTION").length;
  const maxHoldExitCount = trades.filter((t) => t.exitType === "MAX_HOLD").length;
  const stopLossExitCount = trades.filter((t) => t.exitType === "STOP_LOSS").length;
  const convergenceRate = earlyExitRate;
  const skippedLiquidity = skips.length;

  return {
    trades,
    skips,
    totalTrades,
    wins,
    losses,
    winRate,
    totalPnl,
    totalGrossPnl,
    totalFees,
    totalSlippage,
    avgPnlPerTrade,
    earlyExitCount,
    earlyExitRate,
    holdToResolutionCount,
    maxHoldExitCount,
    stopLossExitCount,
    convergenceRate,
    skippedLiquidity,
  };
}

export function printReport(result: BacktestResult, config?: Partial<BacktestConfig>): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  CORRELATION GAP STRATEGY — BACKTEST REPORT");
  console.log("════════════════════════════════════════════════════════════\n");

  console.log("Parameters:");
  console.log(`  minGap:       ${cfg.minGap}`);
  console.log(`  exitGap:      ${cfg.exitGap}`);
  console.log(`  checkStart:   ${cfg.checkStart} (${(cfg.checkStart * 100).toFixed(0)}%)`);
  console.log(`  checkEnd:     ${cfg.checkEnd} (${(cfg.checkEnd * 100).toFixed(0)}%)`);
  console.log(`  stakeSize:    $${cfg.stakeSize}`);
  console.log(`  feePct:       ${(cfg.feePct * 100).toFixed(2)}%`);
  console.log(`  slippagePct:  ${(cfg.slippagePct * 100).toFixed(2)}%`);
  if (cfg.maxHoldMs > 0) console.log(`  maxHoldMs:    ${cfg.maxHoldMs} (${(cfg.maxHoldMs / 60000).toFixed(1)} min)`);
  if (cfg.stopLossGap > 0) console.log(`  stopLossGap:  ${cfg.stopLossGap}`);
  if (cfg.minDepth > 0) console.log(`  minDepth:     $${cfg.minDepth}`);
  if (cfg.maxSpread > 0) console.log(`  maxSpread:    ${cfg.maxSpread}`);
  console.log("");

  console.log("Results:");
  console.log(`  Total Trades:          ${result.totalTrades}`);
  console.log(`  Wins:                  ${result.wins}`);
  console.log(`  Losses:                ${result.losses}`);
  console.log(`  Win Rate:              ${(result.winRate * 100).toFixed(1)}%`);
  console.log(`  Gross PnL:             $${result.totalGrossPnl.toFixed(2)}`);
  console.log(`  Total Fees:            -$${result.totalFees.toFixed(2)}`);
  console.log(`  Total Slippage:        -$${result.totalSlippage.toFixed(2)}`);
  console.log(`  Net PnL:               $${result.totalPnl.toFixed(2)}`);
  console.log(`  Avg Net PnL/Trade:     $${result.avgPnlPerTrade.toFixed(2)}`);
  console.log("");

  console.log("Exit Breakdown:");
  console.log(`  Early Exit:            ${result.earlyExitCount} (${(result.earlyExitRate * 100).toFixed(1)}%)`);
  console.log(`  Hold to Resolution:    ${result.holdToResolutionCount}`);
  if (result.maxHoldExitCount > 0)
    console.log(`  Max Hold Exit:         ${result.maxHoldExitCount}`);
  if (result.stopLossExitCount > 0)
    console.log(`  Stop Loss Exit:        ${result.stopLossExitCount}`);
  console.log(`  Convergence Rate:      ${(result.convergenceRate * 100).toFixed(1)}%`);
  if (result.skippedLiquidity > 0)
    console.log(`  Skipped (Liquidity):   ${result.skippedLiquidity}`);
  console.log("");

  // Per-asset breakdown
  const assets = [...new Set(result.trades.map((t) => t.asset))];
  if (assets.length > 0) {
    console.log("Per-Asset Breakdown:");
    console.log("──────────────────────────────────────────────────────────────────────────");
    console.log(
      "  Asset   Trades   Wins  Losses  WinRate   GrossPnL    Fees    Slippage   NetPnL     EarlyExit%"
    );
    for (const asset of assets) {
      const at = result.trades.filter((t) => t.asset === asset);
      const w = at.filter((t) => t.pnl > 0).length;
      const l = at.filter((t) => t.pnl <= 0).length;
      const wr = at.length > 0 ? w / at.length : 0;
      const gp = at.reduce((s, t) => s + t.grossPnl, 0);
      const fe = at.reduce((s, t) => s + t.fees, 0);
      const sl = at.reduce((s, t) => s + t.slippage, 0);
      const np = at.reduce((s, t) => s + t.pnl, 0);
      const ee = at.filter((t) => t.exitType === "EARLY_EXIT").length;
      const eer = at.length > 0 ? ee / at.length : 0;

      console.log(
        `  ${asset.padEnd(6)} ${String(at.length).padStart(6)}   ${String(w).padStart(4)}  ${String(l).padStart(6)}  ${(wr * 100).toFixed(1).padStart(6)}%   $${gp.toFixed(2).padStart(8)}  $${fe.toFixed(2).padStart(6)}  $${sl.toFixed(2).padStart(8)}   $${np.toFixed(2).padStart(8)}   ${(eer * 100).toFixed(1).padStart(9)}%`
      );
    }
    console.log("");
  }

  // Skips log
  if (result.skips.length > 0) {
    console.log(`Skipped Trades (${result.skips.length}):`);
    console.log("─────────────────────────────────────────────────────────");
    for (const s of result.skips) {
      const date = new Date(s.timestamp).toISOString();
      console.log(`  ${s.pair.altAsset} @ ${date} — ${s.reason}`);
    }
    console.log("");
  }

  // Trade log
  if (result.trades.length > 0) {
    console.log("Trade Log:");
    console.log("──────────────────────────────────────────────────────────────────────────");
    for (let i = 0; i < result.trades.length; i++) {
      const t = result.trades[i];
      const entryDate = new Date(t.entryTimestamp).toISOString();
      const exitDate = new Date(t.exitTimestamp).toISOString();
      const spreadStr = t.entrySpread != null ? ` spr:${t.entrySpread.toFixed(3)}` : "";
      const depthStr = t.entryDepth != null ? ` dep:$${t.entryDepth.toFixed(0)}` : "";
      console.log(
        `  #${String(i + 1).padStart(3)} | ${t.asset.padEnd(4)} ${t.side.padEnd(3)} | ` +
          `Entry: ${t.entryPrice.toFixed(3)} @ ${entryDate}${spreadStr}${depthStr} | ` +
          `Gap: ${t.gapAtEntry.toFixed(3)} | ` +
          `Exit: ${t.exitPrice.toFixed(3)} (${t.exitType}) @ ${exitDate} | ` +
          `Gross: $${t.grossPnl.toFixed(2)} Fee: -$${t.fees.toFixed(2)} Slip: -$${t.slippage.toFixed(2)} | ` +
          `Net: $${t.pnl.toFixed(2)}`
      );
    }
  }

  console.log("\n════════════════════════════════════════════════════════════\n");
}
