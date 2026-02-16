import { loadMarkets } from "./loader";
import { runBacktest, printReport } from "./backtest";
import { BacktestConfig } from "./types";

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: npx ts-node src/index.ts <data-path> [options]");
    console.log("");
    console.log("  <data-path>   Path to a JSON file or directory with market data");
    console.log("");
    console.log("Core Options:");
    console.log("  --minGap=0.20       Minimum gap to trigger a trade");
    console.log("  --exitGap=0.05      Gap threshold for early exit");
    console.log("  --checkStart=0.15   Start scanning at this fraction of event duration");
    console.log("  --checkEnd=0.55     Stop scanning at this fraction of event duration");
    console.log("  --stakeSize=10      Dollar amount per trade");
    console.log("");
    console.log("Fees & Slippage:");
    console.log("  --feePct=0.02       Fee per transaction (0.02 = 2%)");
    console.log("  --slippagePct=0.01  Estimated slippage per transaction (0.01 = 1%)");
    console.log("");
    console.log("Safety Rails:");
    console.log("  --maxHoldMs=420000  Max hold time in ms (420000 = 7min). 0 = disabled");
    console.log("  --stopLossGap=0.35  Exit if gap widens beyond this. 0 = disabled");
    console.log("  --minDepth=5        Skip if order book depth < $X. 0 = disabled");
    console.log("  --maxSpread=0.10    Skip if spread > X. 0 = disabled");
    process.exit(1);
  }

  const dataPath = args[0];
  const configOverrides: Partial<BacktestConfig> = {};

  for (const arg of args.slice(1)) {
    const match = arg.match(/^--(\w+)=(.+)$/);
    if (match) {
      const [, key, value] = match;
      const num = parseFloat(value);
      if (isNaN(num)) {
        console.error(`Invalid value for --${key}: ${value}`);
        process.exit(1);
      }
      (configOverrides as Record<string, number>)[key] = num;
    }
  }

  console.log(`Loading data from: ${dataPath}`);
  const markets = loadMarkets(dataPath);
  console.log(`Total markets loaded: ${markets.length}`);

  const btcCount = markets.filter((m) => m.asset === "BTC").length;
  const altCount = markets.filter((m) => m.asset !== "BTC").length;
  console.log(`  BTC markets: ${btcCount}`);
  console.log(`  Alt markets: ${altCount}`);

  if (btcCount === 0) {
    console.error("No BTC markets found. Cannot form pairs.");
    process.exit(1);
  }
  if (altCount === 0) {
    console.error("No Alt markets found. Cannot form pairs.");
    process.exit(1);
  }

  const result = runBacktest(markets, configOverrides);
  printReport(result, configOverrides);
}

main();
