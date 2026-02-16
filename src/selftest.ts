import { Market, Tick } from "./types";
import { runBacktest } from "./backtest";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    console.error(`  FAIL: ${msg}`);
    failed++;
  }
}

function assertClose(actual: number, expected: number, tolerance: number, label: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    console.error(`  FAIL: ${label} — expected ${expected.toFixed(4)}, got ${actual.toFixed(4)}`);
    failed++;
  }
}

// ── Helper to build ticks without order book data (backward compat) ──
function simpleTick(timestamp: number, yesPrice: number, noPrice: number): Tick {
  return { timestamp, yesPrice, noPrice };
}

// ── Helper to build ticks WITH order book data ──
function obTick(
  timestamp: number,
  yesPrice: number, noPrice: number,
  bestYesBid: number, bestYesAsk: number,
  bestNoBid: number, bestNoAsk: number,
  yesDepth: number, noDepth: number,
): Tick {
  return { timestamp, yesPrice, noPrice, bestYesBid, bestYesAsk, bestNoBid, bestNoAsk, yesDepth, noDepth };
}

// ════════════════════════════════════════════════════════════
// Test 1: Early Exit (spec example, no fees)
// ════════════════════════════════════════════════════════════
function testEarlyExit(): void {
  console.log("═══ Test 1: Early Exit (spec example, no fees) ═══\n");
  const startTime = 1000000;
  const endTime = startTime + 900000;
  const d = endTime - startTime;
  const t1 = startTime + d * 0.30;
  const t2 = startTime + d * 0.50;

  const btc: Market = {
    id: "btc-1", asset: "BTC", direction: "Trump wins", startTime, endTime, outcome: "YES",
    ticks: [simpleTick(t1, 0.72, 0.28), simpleTick(t2, 0.68, 0.32)],
  };
  const eth: Market = {
    id: "eth-1", asset: "ETH", direction: "Trump wins", startTime, endTime, outcome: "YES",
    ticks: [simpleTick(t1, 0.48, 0.52), simpleTick(t2, 0.64, 0.36)],
  };

  const r = runBacktest([btc, eth]);
  assert(r.totalTrades === 1, `Expected 1 trade, got ${r.totalTrades}`);
  assert(r.trades[0].exitType === "EARLY_EXIT", `Expected EARLY_EXIT`);
  assert(r.trades[0].side === "YES", `Expected YES side`);
  assertClose(r.trades[0].grossPnl, 3.33, 0.01, "grossPnl");
  assertClose(r.trades[0].pnl, 3.33, 0.01, "netPnl (no fees)");
  console.log(`  PnL: $${r.trades[0].pnl.toFixed(2)} | PASSED\n`);
  passed++;
}

// ════════════════════════════════════════════════════════════
// Test 2: Hold to Resolution — WIN
// ════════════════════════════════════════════════════════════
function testHoldWin(): void {
  console.log("═══ Test 2: Hold to Resolution — WIN ═══\n");
  const startTime = 2000000;
  const endTime = startTime + 900000;
  const d = endTime - startTime;

  const btc: Market = {
    id: "btc-2", asset: "BTC", direction: "Trump wins", startTime, endTime, outcome: "YES",
    ticks: [simpleTick(startTime + d * 0.30, 0.75, 0.25), simpleTick(startTime + d * 0.80, 0.70, 0.30)],
  };
  const sol: Market = {
    id: "sol-2", asset: "SOL", direction: "Trump wins", startTime, endTime, outcome: "YES",
    ticks: [simpleTick(startTime + d * 0.30, 0.50, 0.50), simpleTick(startTime + d * 0.80, 0.48, 0.52)],
  };

  const r = runBacktest([btc, sol]);
  assert(r.totalTrades === 1, `Expected 1 trade`);
  assert(r.trades[0].exitType === "HOLD_TO_RESOLUTION", `Expected HOLD`);
  assertClose(r.trades[0].grossPnl, 10.0, 0.01, "grossPnl");
  console.log(`  PnL: $${r.trades[0].pnl.toFixed(2)} | PASSED\n`);
  passed++;
}

// ════════════════════════════════════════════════════════════
// Test 3: Hold to Resolution — LOSS
// ════════════════════════════════════════════════════════════
function testHoldLoss(): void {
  console.log("═══ Test 3: Hold to Resolution — LOSS ═══\n");
  const startTime = 3000000;
  const endTime = startTime + 900000;
  const d = endTime - startTime;

  const btc: Market = {
    id: "btc-3", asset: "BTC", direction: "Trump wins", startTime, endTime, outcome: "NO",
    ticks: [simpleTick(startTime + d * 0.30, 0.70, 0.30), simpleTick(startTime + d * 0.80, 0.65, 0.35)],
  };
  const xrp: Market = {
    id: "xrp-3", asset: "XRP", direction: "Trump wins", startTime, endTime, outcome: "NO",
    ticks: [simpleTick(startTime + d * 0.30, 0.45, 0.55), simpleTick(startTime + d * 0.80, 0.40, 0.60)],
  };

  const r = runBacktest([btc, xrp]);
  assert(r.totalTrades === 1, `Expected 1 trade`);
  assert(r.trades[0].side === "YES", `Expected YES`);
  assertClose(r.trades[0].grossPnl, -10, 0.01, "grossPnl");
  console.log(`  PnL: $${r.trades[0].pnl.toFixed(2)} | PASSED\n`);
  passed++;
}

// ════════════════════════════════════════════════════════════
// Test 4: No Gap → No Trade
// ════════════════════════════════════════════════════════════
function testNoGap(): void {
  console.log("═══ Test 4: No Gap → No Trade ═══\n");
  const startTime = 4000000;
  const endTime = startTime + 900000;
  const d = endTime - startTime;

  const btc: Market = {
    id: "btc-4", asset: "BTC", direction: "Trump wins", startTime, endTime, outcome: "YES",
    ticks: [simpleTick(startTime + d * 0.30, 0.55, 0.45)],
  };
  const eth: Market = {
    id: "eth-4", asset: "ETH", direction: "Trump wins", startTime, endTime, outcome: "YES",
    ticks: [simpleTick(startTime + d * 0.30, 0.50, 0.50)],
  };

  const r = runBacktest([btc, eth]);
  assert(r.totalTrades === 0, `Expected 0 trades`);
  console.log("  No trade | PASSED\n");
  passed++;
}

// ════════════════════════════════════════════════════════════
// Test 5: Ticks Outside Window → No Trade
// ════════════════════════════════════════════════════════════
function testOutsideWindow(): void {
  console.log("═══ Test 5: Ticks Outside Scan Window → No Trade ═══\n");
  const startTime = 5000000;
  const endTime = startTime + 900000;
  const d = endTime - startTime;

  const btc: Market = {
    id: "btc-5", asset: "BTC", direction: "Trump wins", startTime, endTime, outcome: "YES",
    ticks: [simpleTick(startTime + d * 0.05, 0.90, 0.10), simpleTick(startTime + d * 0.80, 0.90, 0.10)],
  };
  const eth: Market = {
    id: "eth-5", asset: "ETH", direction: "Trump wins", startTime, endTime, outcome: "YES",
    ticks: [simpleTick(startTime + d * 0.05, 0.40, 0.60), simpleTick(startTime + d * 0.80, 0.40, 0.60)],
  };

  const r = runBacktest([btc, eth]);
  assert(r.totalTrades === 0, `Expected 0 trades`);
  console.log("  No trade | PASSED\n");
  passed++;
}

// ════════════════════════════════════════════════════════════
// Test 6: Gap on NO Side
// ════════════════════════════════════════════════════════════
function testNOSide(): void {
  console.log("═══ Test 6: Gap on NO Side ═══\n");
  const startTime = 6000000;
  const endTime = startTime + 900000;
  const d = endTime - startTime;

  const btc: Market = {
    id: "btc-6", asset: "BTC", direction: "Trump wins", startTime, endTime, outcome: "NO",
    ticks: [
      simpleTick(startTime + d * 0.30, 0.40, 0.60),
      simpleTick(startTime + d * 0.50, 0.38, 0.62),
    ],
  };
  const eth: Market = {
    id: "eth-6", asset: "ETH", direction: "Trump wins", startTime, endTime, outcome: "NO",
    ticks: [
      simpleTick(startTime + d * 0.30, 0.42, 0.38),
      simpleTick(startTime + d * 0.50, 0.40, 0.57),
    ],
  };

  const r = runBacktest([btc, eth]);
  assert(r.totalTrades === 1, `Expected 1 trade`);
  assert(r.trades[0].side === "NO", `Expected NO side`);
  assert(r.trades[0].exitType === "EARLY_EXIT", `Expected EARLY_EXIT`);
  console.log(`  ${r.trades[0].asset} ${r.trades[0].side} PnL: $${r.trades[0].pnl.toFixed(2)} | PASSED\n`);
  passed++;
}

// ════════════════════════════════════════════════════════════
// Test 7: Order Book Prices — entry at ask, exit at bid
// ════════════════════════════════════════════════════════════
function testOrderBookPrices(): void {
  console.log("═══ Test 7: Order Book Prices (ask entry, bid exit) ═══\n");
  const startTime = 7000000;
  const endTime = startTime + 900000;
  const d = endTime - startTime;

  // BTC has mid prices only (we use mid as reference)
  const btc: Market = {
    id: "btc-7", asset: "BTC", direction: "Trump wins", startTime, endTime, outcome: "YES",
    ticks: [
      simpleTick(startTime + d * 0.30, 0.72, 0.28),
      simpleTick(startTime + d * 0.50, 0.68, 0.32),
    ],
  };

  // ETH has order book: mid=0.48, but ask=0.50 (we pay more to enter)
  // Later: mid=0.64, but bid=0.62 (we get less on exit)
  const eth: Market = {
    id: "eth-7", asset: "ETH", direction: "Trump wins", startTime, endTime, outcome: "YES",
    ticks: [
      obTick(startTime + d * 0.30, 0.48, 0.52, 0.46, 0.50, 0.50, 0.54, 20, 20),
      // Gap check: btcMid(0.68) - altBid(0.62) = 0.06 > exitGap(0.05) ... hmm no,
      // actually gap = btcMid - altBid for exit. 0.68 - 0.62 = 0.06 > 0.05, so no early exit.
      // Let's make the bid higher so gap closes:
      obTick(startTime + d * 0.50, 0.64, 0.36, 0.63, 0.65, 0.34, 0.38, 20, 20),
    ],
  };

  // Entry gap = btcMid(0.72) - altAsk(0.50) = 0.22 >= 0.20 → trigger
  // Entry price = altAsk = 0.50
  // Exit: btcMid(0.68) - altBid(0.63) = 0.05 <= 0.05 → early exit
  // Exit price = altBid = 0.63
  // grossPnl = ((0.63 - 0.50) / 0.50) * 10 = 2.60

  const r = runBacktest([btc, eth]);
  assert(r.totalTrades === 1, `Expected 1 trade, got ${r.totalTrades}`);
  assert(r.trades[0].exitType === "EARLY_EXIT", `Expected EARLY_EXIT, got ${r.trades[0]?.exitType}`);
  assertClose(r.trades[0].entryPrice, 0.50, 0.001, "entryPrice = ask");
  assertClose(r.trades[0].exitPrice, 0.63, 0.001, "exitPrice = bid");
  assertClose(r.trades[0].grossPnl, 2.60, 0.01, "grossPnl");
  assert(r.trades[0].entrySpread != null, "entrySpread should be set");
  assertClose(r.trades[0].entrySpread!, 0.04, 0.001, "entrySpread");
  console.log(`  Entry: ${r.trades[0].entryPrice} (ask), Exit: ${r.trades[0].exitPrice} (bid)`);
  console.log(`  Spread at entry: ${r.trades[0].entrySpread?.toFixed(3)}`);
  console.log(`  PnL: $${r.trades[0].pnl.toFixed(2)} | PASSED\n`);
  passed++;
}

// ════════════════════════════════════════════════════════════
// Test 8: Fees & Slippage reduce PnL
// ════════════════════════════════════════════════════════════
function testFeesSlippage(): void {
  console.log("═══ Test 8: Fees & Slippage ═══\n");
  const startTime = 8000000;
  const endTime = startTime + 900000;
  const d = endTime - startTime;

  const btc: Market = {
    id: "btc-8", asset: "BTC", direction: "Trump wins", startTime, endTime, outcome: "YES",
    ticks: [simpleTick(startTime + d * 0.30, 0.72, 0.28), simpleTick(startTime + d * 0.50, 0.68, 0.32)],
  };
  const eth: Market = {
    id: "eth-8", asset: "ETH", direction: "Trump wins", startTime, endTime, outcome: "YES",
    ticks: [simpleTick(startTime + d * 0.30, 0.48, 0.52), simpleTick(startTime + d * 0.50, 0.64, 0.36)],
  };

  // No fees
  const r0 = runBacktest([btc, eth]);
  // With 2% fee + 1% slippage
  const r1 = runBacktest([btc, eth], { feePct: 0.02, slippagePct: 0.01 });

  assert(r1.totalTrades === 1, `Expected 1 trade`);
  assert(r1.trades[0].grossPnl === r0.trades[0].grossPnl, "Gross PnL should be same");
  assert(r1.trades[0].fees > 0, "Fees should be > 0");
  assert(r1.trades[0].slippage > 0, "Slippage should be > 0");
  assert(r1.trades[0].pnl < r0.trades[0].pnl, "Net PnL should be less with fees");

  console.log(`  Without fees: $${r0.trades[0].pnl.toFixed(2)}`);
  console.log(`  With fees:    $${r1.trades[0].pnl.toFixed(2)} (fees: $${r1.trades[0].fees.toFixed(2)}, slip: $${r1.trades[0].slippage.toFixed(2)})`);
  console.log(`  | PASSED\n`);
  passed++;
}

// ════════════════════════════════════════════════════════════
// Test 9: Max Hold — forced exit before resolution
// ════════════════════════════════════════════════════════════
function testMaxHold(): void {
  console.log("═══ Test 9: Max Hold Exit ═══\n");
  const startTime = 9000000;
  const endTime = startTime + 900000;
  const d = endTime - startTime;

  const btc: Market = {
    id: "btc-9", asset: "BTC", direction: "Trump wins", startTime, endTime, outcome: "YES",
    ticks: [
      simpleTick(startTime + d * 0.20, 0.75, 0.25),
      simpleTick(startTime + d * 0.60, 0.72, 0.28),
      simpleTick(startTime + d * 0.80, 0.70, 0.30),
    ],
  };
  const sol: Market = {
    id: "sol-9", asset: "SOL", direction: "Trump wins", startTime, endTime, outcome: "YES",
    ticks: [
      simpleTick(startTime + d * 0.20, 0.50, 0.50), // gap=0.25, entry here
      simpleTick(startTime + d * 0.60, 0.52, 0.48), // gap=0.20, still open. hold=0.40*d
      simpleTick(startTime + d * 0.80, 0.55, 0.45), // gap=0.15, still open. hold=0.60*d
    ],
  };

  // maxHoldMs = 50% of duration → entry at 0.20, exit forced at 0.60 (holdDuration=0.40*d < 0.50*d)
  // Actually 0.60-0.20=0.40 which is < 0.50. Let's use maxHoldMs = 0.35*d so it triggers at 0.60.
  const maxHold = d * 0.35; // entry at 0.20, 0.20+0.35=0.55, so tick at 0.60 exceeds it

  const r = runBacktest([btc, sol], { maxHoldMs: maxHold });
  assert(r.totalTrades === 1, `Expected 1 trade, got ${r.totalTrades}`);
  assert(r.trades[0].exitType === "MAX_HOLD", `Expected MAX_HOLD, got ${r.trades[0]?.exitType}`);
  assertClose(r.trades[0].exitPrice, 0.52, 0.001, "exitPrice at forced exit");
  console.log(`  Exit type: ${r.trades[0].exitType} at price ${r.trades[0].exitPrice}`);
  console.log(`  PnL: $${r.trades[0].pnl.toFixed(2)} | PASSED\n`);
  passed++;
}

// ════════════════════════════════════════════════════════════
// Test 10: Stop Loss — gap widens too far
// ════════════════════════════════════════════════════════════
function testStopLoss(): void {
  console.log("═══ Test 10: Stop Loss Exit ═══\n");
  const startTime = 10000000;
  const endTime = startTime + 900000;
  const d = endTime - startTime;

  const btc: Market = {
    id: "btc-10", asset: "BTC", direction: "Trump wins", startTime, endTime, outcome: "YES",
    ticks: [
      simpleTick(startTime + d * 0.30, 0.70, 0.30),
      simpleTick(startTime + d * 0.50, 0.80, 0.20), // BTC rises → gap widens
    ],
  };
  const eth: Market = {
    id: "eth-10", asset: "ETH", direction: "Trump wins", startTime, endTime, outcome: "YES",
    ticks: [
      simpleTick(startTime + d * 0.30, 0.48, 0.52), // gap=0.22, entry
      simpleTick(startTime + d * 0.50, 0.42, 0.58), // gap=0.80-0.42=0.38, exceeds stopLoss=0.35
    ],
  };

  const r = runBacktest([btc, eth], { stopLossGap: 0.35 });
  assert(r.totalTrades === 1, `Expected 1 trade`);
  assert(r.trades[0].exitType === "STOP_LOSS", `Expected STOP_LOSS, got ${r.trades[0]?.exitType}`);
  assert(r.trades[0].pnl < 0, "Should be a loss");
  console.log(`  Exit type: ${r.trades[0].exitType}`);
  console.log(`  PnL: $${r.trades[0].pnl.toFixed(2)} | PASSED\n`);
  passed++;
}

// ════════════════════════════════════════════════════════════
// Test 11: Liquidity Guard — spread too wide → skip
// ════════════════════════════════════════════════════════════
function testMaxSpreadSkip(): void {
  console.log("═══ Test 11: Max Spread → Skip ═══\n");
  const startTime = 11000000;
  const endTime = startTime + 900000;
  const d = endTime - startTime;

  const btc: Market = {
    id: "btc-11", asset: "BTC", direction: "Trump wins", startTime, endTime, outcome: "YES",
    ticks: [simpleTick(startTime + d * 0.30, 0.72, 0.28)],
  };
  // ETH has wide spread: ask=0.52, bid=0.38 → spread=0.14 > maxSpread=0.10
  const eth: Market = {
    id: "eth-11", asset: "ETH", direction: "Trump wins", startTime, endTime, outcome: "YES",
    ticks: [
      obTick(startTime + d * 0.30, 0.45, 0.55, 0.38, 0.52, 0.48, 0.62, 20, 20),
    ],
  };

  // Gap = btcMid(0.72) - altAsk(0.52) = 0.20 → would trigger, but spread=0.14 > 0.10
  const r = runBacktest([btc, eth], { maxSpread: 0.10 });
  assert(r.totalTrades === 0, `Expected 0 trades`);
  assert(r.skips.length === 1, `Expected 1 skip`);
  assert(r.skippedLiquidity === 1, `Expected skippedLiquidity=1`);
  console.log(`  Skipped: ${r.skips[0]?.reason}`);
  console.log(`  | PASSED\n`);
  passed++;
}

// ════════════════════════════════════════════════════════════
// Test 12: Liquidity Guard — depth too low → skip
// ════════════════════════════════════════════════════════════
function testMinDepthSkip(): void {
  console.log("═══ Test 12: Min Depth → Skip ═══\n");
  const startTime = 12000000;
  const endTime = startTime + 900000;
  const d = endTime - startTime;

  const btc: Market = {
    id: "btc-12", asset: "BTC", direction: "Trump wins", startTime, endTime, outcome: "YES",
    ticks: [simpleTick(startTime + d * 0.30, 0.72, 0.28)],
  };
  // ETH has good spread but low depth ($3 < minDepth $5)
  const eth: Market = {
    id: "eth-12", asset: "ETH", direction: "Trump wins", startTime, endTime, outcome: "YES",
    ticks: [
      obTick(startTime + d * 0.30, 0.48, 0.52, 0.47, 0.49, 0.51, 0.53, 3, 3),
    ],
  };

  const r = runBacktest([btc, eth], { minDepth: 5 });
  assert(r.totalTrades === 0, `Expected 0 trades`);
  assert(r.skips.length === 1, `Expected 1 skip`);
  console.log(`  Skipped: ${r.skips[0]?.reason}`);
  console.log(`  | PASSED\n`);
  passed++;
}

// ════════════════════════════════════════════════════════════
// Test 13: Stop loss checked BEFORE early exit
// ════════════════════════════════════════════════════════════
function testStopLossPriority(): void {
  console.log("═══ Test 13: Stop Loss has priority over Max Hold ═══\n");
  const startTime = 13000000;
  const endTime = startTime + 900000;
  const d = endTime - startTime;

  const btc: Market = {
    id: "btc-13", asset: "BTC", direction: "Trump wins", startTime, endTime, outcome: "YES",
    ticks: [
      simpleTick(startTime + d * 0.25, 0.70, 0.30),
      simpleTick(startTime + d * 0.70, 0.85, 0.15), // gap explodes
    ],
  };
  const eth: Market = {
    id: "eth-13", asset: "ETH", direction: "Trump wins", startTime, endTime, outcome: "YES",
    ticks: [
      simpleTick(startTime + d * 0.25, 0.48, 0.52), // gap=0.22, entry
      simpleTick(startTime + d * 0.70, 0.40, 0.60), // gap=0.85-0.40=0.45
    ],
  };

  // Both maxHold and stopLoss would trigger at the same tick.
  // stopLoss is checked first in code.
  const r = runBacktest([btc, eth], {
    maxHoldMs: d * 0.40, // would trigger at 0.70 (hold=0.45*d > 0.40*d)
    stopLossGap: 0.35,    // gap=0.45 > 0.35, also triggers
  });
  assert(r.totalTrades === 1, `Expected 1 trade`);
  assert(r.trades[0].exitType === "STOP_LOSS", `Expected STOP_LOSS (priority), got ${r.trades[0]?.exitType}`);
  console.log(`  Exit type: ${r.trades[0].exitType} | PASSED\n`);
  passed++;
}

// ════════════════════════════════════════════════════════════
// Run all
// ════════════════════════════════════════════════════════════
console.log("\nRunning Self-Tests...\n");
testEarlyExit();
testHoldWin();
testHoldLoss();
testNoGap();
testOutsideWindow();
testNOSide();
testOrderBookPrices();
testFeesSlippage();
testMaxHold();
testStopLoss();
testMaxSpreadSkip();
testMinDepthSkip();
testStopLossPriority();

console.log("════════════════════════════════════════════════════");
if (failed > 0) {
  console.log(`  ${passed} passed, ${failed} FAILED`);
  process.exit(1);
} else {
  console.log(`  All ${passed} tests passed!`);
}
console.log("════════════════════════════════════════════════════\n");
