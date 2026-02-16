import { Market } from "./types";
import { runBacktest, printReport } from "./backtest";

/**
 * Self-test with synthetic data to verify strategy logic.
 * This uses the exact example from the specification:
 *
 *   BTC YES: 72¢  ETH YES: 48¢  → Gap = 24¢ ≥ 20¢ → TRIGGER
 *   Entry: Buy ETH YES at 48¢
 *   Later: BTC YES: 68¢  ETH YES: 64¢  → Gap = 4¢ ≤ 5¢ → EARLY EXIT
 *   PnL = ((0.64 - 0.48) / 0.48) * 10 = $3.33
 */
function testEarlyExit(): void {
  console.log("═══ Test 1: Early Exit (spec example) ═══\n");

  const startTime = 1000000;
  const endTime = startTime + 900000; // 15 min = 900s = 900000ms
  const duration = endTime - startTime;

  // Scan window: 15% to 55% → 135000ms to 495000ms after start
  const scanMid = startTime + duration * 0.30; // 270000ms in → inside window
  const laterTime = startTime + duration * 0.50; // 450000ms in → still inside

  const btcMarket: Market = {
    id: "btc-1",
    asset: "BTC",
    direction: "Trump wins",
    startTime,
    endTime,
    outcome: "YES",
    ticks: [
      { timestamp: scanMid, yesPrice: 0.72, noPrice: 0.28 },
      { timestamp: laterTime, yesPrice: 0.68, noPrice: 0.32 },
    ],
  };

  const ethMarket: Market = {
    id: "eth-1",
    asset: "ETH",
    direction: "Trump wins",
    startTime,
    endTime,
    outcome: "YES",
    ticks: [
      { timestamp: scanMid, yesPrice: 0.48, noPrice: 0.52 },
      { timestamp: laterTime, yesPrice: 0.64, noPrice: 0.36 },
    ],
  };

  const result = runBacktest([btcMarket, ethMarket]);

  console.assert(result.totalTrades === 1, `Expected 1 trade, got ${result.totalTrades}`);
  console.assert(result.trades[0].exitType === "EARLY_EXIT", `Expected EARLY_EXIT, got ${result.trades[0]?.exitType}`);
  console.assert(result.trades[0].side === "YES", `Expected YES side, got ${result.trades[0]?.side}`);

  const expectedPnl = ((0.64 - 0.48) / 0.48) * 10;
  const actualPnl = result.trades[0].pnl;
  console.assert(
    Math.abs(actualPnl - expectedPnl) < 0.01,
    `Expected PnL ~${expectedPnl.toFixed(2)}, got ${actualPnl.toFixed(2)}`
  );

  console.log(`  Trade: ${result.trades[0].asset} ${result.trades[0].side}`);
  console.log(`  Entry: ${result.trades[0].entryPrice}, Exit: ${result.trades[0].exitPrice}`);
  console.log(`  PnL: $${actualPnl.toFixed(2)} (expected: $${expectedPnl.toFixed(2)})`);
  console.log(`  Exit Type: ${result.trades[0].exitType}`);
  console.log("  ✓ PASSED\n");
}

function testHoldToResolutionWin(): void {
  console.log("═══ Test 2: Hold to Resolution — WIN ═══\n");

  const startTime = 2000000;
  const endTime = startTime + 900000;
  const duration = endTime - startTime;
  const scanMid = startTime + duration * 0.30;

  const btcMarket: Market = {
    id: "btc-2",
    asset: "BTC",
    direction: "Trump wins",
    startTime,
    endTime,
    outcome: "YES",
    ticks: [
      { timestamp: scanMid, yesPrice: 0.75, noPrice: 0.25 },
      // No later tick where gap closes
      { timestamp: startTime + duration * 0.80, yesPrice: 0.70, noPrice: 0.30 },
    ],
  };

  const solMarket: Market = {
    id: "sol-2",
    asset: "SOL",
    direction: "Trump wins",
    startTime,
    endTime,
    outcome: "YES", // SOL also resolves YES → we win
    ticks: [
      { timestamp: scanMid, yesPrice: 0.50, noPrice: 0.50 },
      // Gap stays large
      { timestamp: startTime + duration * 0.80, yesPrice: 0.48, noPrice: 0.52 },
    ],
  };

  const result = runBacktest([btcMarket, solMarket]);

  console.assert(result.totalTrades === 1, `Expected 1 trade, got ${result.totalTrades}`);
  console.assert(result.trades[0].exitType === "HOLD_TO_RESOLUTION", `Expected HOLD, got ${result.trades[0]?.exitType}`);

  const expectedPnl = ((1 - 0.50) / 0.50) * 10; // $10
  const actualPnl = result.trades[0].pnl;
  console.assert(
    Math.abs(actualPnl - expectedPnl) < 0.01,
    `Expected PnL ~${expectedPnl.toFixed(2)}, got ${actualPnl.toFixed(2)}`
  );

  console.log(`  Trade: ${result.trades[0].asset} ${result.trades[0].side}`);
  console.log(`  PnL: $${actualPnl.toFixed(2)} (expected: $${expectedPnl.toFixed(2)})`);
  console.log("  ✓ PASSED\n");
}

function testHoldToResolutionLoss(): void {
  console.log("═══ Test 3: Hold to Resolution — LOSS ═══\n");

  const startTime = 3000000;
  const endTime = startTime + 900000;
  const duration = endTime - startTime;
  const scanMid = startTime + duration * 0.30;

  const btcMarket: Market = {
    id: "btc-3",
    asset: "BTC",
    direction: "Trump wins",
    startTime,
    endTime,
    outcome: "NO",
    ticks: [
      { timestamp: scanMid, yesPrice: 0.70, noPrice: 0.30 },
      { timestamp: startTime + duration * 0.80, yesPrice: 0.65, noPrice: 0.35 },
    ],
  };

  const xrpMarket: Market = {
    id: "xrp-3",
    asset: "XRP",
    direction: "Trump wins",
    startTime,
    endTime,
    outcome: "NO", // Outcome is NO, but we bought YES → we lose
    ticks: [
      { timestamp: scanMid, yesPrice: 0.45, noPrice: 0.55 },
      { timestamp: startTime + duration * 0.80, yesPrice: 0.40, noPrice: 0.60 },
    ],
  };

  const result = runBacktest([btcMarket, xrpMarket]);

  console.assert(result.totalTrades === 1, `Expected 1 trade, got ${result.totalTrades}`);
  console.assert(result.trades[0].side === "YES", `Expected YES side`);
  console.assert(result.trades[0].pnl === -10, `Expected PnL -$10, got $${result.trades[0].pnl}`);

  console.log(`  Trade: ${result.trades[0].asset} ${result.trades[0].side}`);
  console.log(`  PnL: $${result.trades[0].pnl.toFixed(2)} (expected: -$10.00)`);
  console.log("  ✓ PASSED\n");
}

function testNoGapNoTrade(): void {
  console.log("═══ Test 4: No Gap → No Trade ═══\n");

  const startTime = 4000000;
  const endTime = startTime + 900000;
  const duration = endTime - startTime;
  const scanMid = startTime + duration * 0.30;

  const btcMarket: Market = {
    id: "btc-4",
    asset: "BTC",
    direction: "Trump wins",
    startTime,
    endTime,
    outcome: "YES",
    ticks: [
      { timestamp: scanMid, yesPrice: 0.55, noPrice: 0.45 },
    ],
  };

  const ethMarket: Market = {
    id: "eth-4",
    asset: "ETH",
    direction: "Trump wins",
    startTime,
    endTime,
    outcome: "YES",
    ticks: [
      { timestamp: scanMid, yesPrice: 0.50, noPrice: 0.50 },
    ],
  };

  const result = runBacktest([btcMarket, ethMarket]);
  console.assert(result.totalTrades === 0, `Expected 0 trades, got ${result.totalTrades}`);
  console.log("  No gap found → no trade triggered");
  console.log("  ✓ PASSED\n");
}

function testTickOutsideWindow(): void {
  console.log("═══ Test 5: Ticks Outside Scan Window → No Trade ═══\n");

  const startTime = 5000000;
  const endTime = startTime + 900000;
  const duration = endTime - startTime;

  // Ticks at 5% and 80% — both outside the 15%-55% window
  const earlyTick = startTime + duration * 0.05;
  const lateTick = startTime + duration * 0.80;

  const btcMarket: Market = {
    id: "btc-5",
    asset: "BTC",
    direction: "Trump wins",
    startTime,
    endTime,
    outcome: "YES",
    ticks: [
      { timestamp: earlyTick, yesPrice: 0.90, noPrice: 0.10 },
      { timestamp: lateTick, yesPrice: 0.90, noPrice: 0.10 },
    ],
  };

  const ethMarket: Market = {
    id: "eth-5",
    asset: "ETH",
    direction: "Trump wins",
    startTime,
    endTime,
    outcome: "YES",
    ticks: [
      { timestamp: earlyTick, yesPrice: 0.40, noPrice: 0.60 },
      { timestamp: lateTick, yesPrice: 0.40, noPrice: 0.60 },
    ],
  };

  const result = runBacktest([btcMarket, ethMarket]);
  console.assert(result.totalTrades === 0, `Expected 0 trades, got ${result.totalTrades}`);
  console.log("  Gap exists but ticks are outside scan window → no trade");
  console.log("  ✓ PASSED\n");
}

function testNOSide(): void {
  console.log("═══ Test 6: Gap on NO Side ═══\n");

  const startTime = 6000000;
  const endTime = startTime + 900000;
  const duration = endTime - startTime;
  const scanMid = startTime + duration * 0.30;

  const btcMarket: Market = {
    id: "btc-6",
    asset: "BTC",
    direction: "Trump wins",
    startTime,
    endTime,
    outcome: "NO",
    ticks: [
      // YES prices are close, but NO prices have a gap
      { timestamp: scanMid, yesPrice: 0.40, noPrice: 0.60 },
      { timestamp: startTime + duration * 0.50, yesPrice: 0.38, noPrice: 0.62 },
    ],
  };

  const ethMarket: Market = {
    id: "eth-6",
    asset: "ETH",
    direction: "Trump wins",
    startTime,
    endTime,
    outcome: "NO", // matches our NO side → WIN
    ticks: [
      { timestamp: scanMid, yesPrice: 0.42, noPrice: 0.38 }, // noGap = 0.60 - 0.38 = 0.22
      { timestamp: startTime + duration * 0.50, yesPrice: 0.40, noPrice: 0.57 }, // noGap = 0.62 - 0.57 = 0.05 → exit
    ],
  };

  const result = runBacktest([btcMarket, ethMarket]);
  console.assert(result.totalTrades === 1, `Expected 1 trade, got ${result.totalTrades}`);
  console.assert(result.trades[0].side === "NO", `Expected NO side, got ${result.trades[0]?.side}`);
  console.assert(result.trades[0].exitType === "EARLY_EXIT", `Expected EARLY_EXIT`);

  const expectedPnl = ((0.57 - 0.38) / 0.38) * 10;
  console.log(`  Trade: ${result.trades[0].asset} ${result.trades[0].side}`);
  console.log(`  PnL: $${result.trades[0].pnl.toFixed(2)} (expected: $${expectedPnl.toFixed(2)})`);
  console.log("  ✓ PASSED\n");
}

// Run all tests
console.log("\n🔬 Running Self-Tests...\n");
testEarlyExit();
testHoldToResolutionWin();
testHoldToResolutionLoss();
testNoGapNoTrade();
testTickOutsideWindow();
testNOSide();
console.log("═══ All tests passed! ═══\n");
