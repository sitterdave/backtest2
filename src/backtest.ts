import { Market, BacktestConfig, BacktestResult, Trade } from "./types";
import { formPairs } from "./pairs";
import { processPair } from "./strategy";

const DEFAULT_CONFIG: BacktestConfig = {
  minGap: 0.20,
  exitGap: 0.05,
  checkStart: 0.15,
  checkEnd: 0.55,
  stakeSize: 10,
};

/**
 * Run the full backtest on a set of markets with the given config.
 */
export function runBacktest(
  markets: Market[],
  configOverrides: Partial<BacktestConfig> = {}
): BacktestResult {
  const config: BacktestConfig = { ...DEFAULT_CONFIG, ...configOverrides };

  // Step 1: form pairs
  const pairs = formPairs(markets);

  // Step 2+3+4: process each pair
  const trades: Trade[] = [];
  for (const pair of pairs) {
    const trade = processPair(pair, config);
    if (trade) {
      trades.push(trade);
    }
  }

  // Aggregate results
  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.filter((t) => t.pnl <= 0).length;
  const winRate = totalTrades > 0 ? wins / totalTrades : 0;
  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const avgPnlPerTrade = totalTrades > 0 ? totalPnl / totalTrades : 0;
  const earlyExitCount = trades.filter((t) => t.exitType === "EARLY_EXIT").length;
  const earlyExitRate = totalTrades > 0 ? earlyExitCount / totalTrades : 0;
  const holdToResolutionCount = trades.filter(
    (t) => t.exitType === "HOLD_TO_RESOLUTION"
  ).length;
  const convergenceRate = earlyExitRate; // early exit = gap converged

  return {
    trades,
    totalTrades,
    wins,
    losses,
    winRate,
    totalPnl,
    avgPnlPerTrade,
    earlyExitCount,
    earlyExitRate,
    holdToResolutionCount,
    convergenceRate,
  };
}

/**
 * Print a formatted report of backtest results to stdout.
 */
export function printReport(result: BacktestResult, config?: Partial<BacktestConfig>): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  CORRELATION GAP STRATEGY — BACKTEST REPORT");
  console.log("════════════════════════════════════════════════════════════\n");

  console.log("Parameters:");
  console.log(`  minGap:     ${cfg.minGap}`);
  console.log(`  exitGap:    ${cfg.exitGap}`);
  console.log(`  checkStart: ${cfg.checkStart} (${(cfg.checkStart * 100).toFixed(0)}% of event duration)`);
  console.log(`  checkEnd:   ${cfg.checkEnd} (${(cfg.checkEnd * 100).toFixed(0)}% of event duration)`);
  console.log(`  stakeSize:  $${cfg.stakeSize}`);
  console.log("");

  console.log("Results:");
  console.log(`  Total Trades:          ${result.totalTrades}`);
  console.log(`  Wins:                  ${result.wins}`);
  console.log(`  Losses:                ${result.losses}`);
  console.log(`  Win Rate:              ${(result.winRate * 100).toFixed(1)}%`);
  console.log(`  Total PnL:             $${result.totalPnl.toFixed(2)}`);
  console.log(`  Avg PnL/Trade:         $${result.avgPnlPerTrade.toFixed(2)}`);
  console.log(`  Early Exits:           ${result.earlyExitCount} (${(result.earlyExitRate * 100).toFixed(1)}%)`);
  console.log(`  Hold to Resolution:    ${result.holdToResolutionCount}`);
  console.log(`  Convergence Rate:      ${(result.convergenceRate * 100).toFixed(1)}%`);
  console.log("");

  // Per-asset breakdown
  const assets = [...new Set(result.trades.map((t) => t.asset))];
  if (assets.length > 0) {
    console.log("Per-Asset Breakdown:");
    console.log("─────────────────────────────────────────────────────────");
    console.log(
      "  Asset   Trades   Wins   Losses   WinRate   PnL        EarlyExit%"
    );
    for (const asset of assets) {
      const assetTrades = result.trades.filter((t) => t.asset === asset);
      const assetWins = assetTrades.filter((t) => t.pnl > 0).length;
      const assetLosses = assetTrades.filter((t) => t.pnl <= 0).length;
      const assetWr = assetTrades.length > 0 ? assetWins / assetTrades.length : 0;
      const assetPnl = assetTrades.reduce((s, t) => s + t.pnl, 0);
      const assetEarly = assetTrades.filter(
        (t) => t.exitType === "EARLY_EXIT"
      ).length;
      const assetEarlyRate =
        assetTrades.length > 0 ? assetEarly / assetTrades.length : 0;

      console.log(
        `  ${asset.padEnd(6)} ${String(assetTrades.length).padStart(6)}   ${String(assetWins).padStart(4)}   ${String(assetLosses).padStart(6)}   ${(assetWr * 100).toFixed(1).padStart(6)}%   $${assetPnl.toFixed(2).padStart(8)}   ${(assetEarlyRate * 100).toFixed(1).padStart(9)}%`
      );
    }
    console.log("");
  }

  // Trade log
  if (result.trades.length > 0) {
    console.log("Trade Log:");
    console.log("─────────────────────────────────────────────────────────");
    for (let i = 0; i < result.trades.length; i++) {
      const t = result.trades[i];
      const entryDate = new Date(t.entryTimestamp).toISOString();
      const exitDate = new Date(t.exitTimestamp).toISOString();
      console.log(
        `  #${String(i + 1).padStart(3)} | ${t.asset.padEnd(4)} ${t.side.padEnd(3)} | ` +
          `Entry: ${t.entryPrice.toFixed(2)} @ ${entryDate} | ` +
          `Gap: ${t.gapAtEntry.toFixed(2)} | ` +
          `Exit: ${t.exitPrice.toFixed(2)} (${t.exitType}) @ ${exitDate} | ` +
          `PnL: $${t.pnl.toFixed(2)}`
      );
    }
  }

  console.log("\n════════════════════════════════════════════════════════════\n");
}
