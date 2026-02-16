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
    console.log("Options:");
    console.log("  --minGap=0.20       Minimum gap to trigger a trade");
    console.log("  --exitGap=0.05      Gap threshold for early exit");
    console.log("  --checkStart=0.15   Start scanning at this fraction of event duration");
    console.log("  --checkEnd=0.55     Stop scanning at this fraction of event duration");
    console.log("  --stakeSize=10      Dollar amount per trade");
    process.exit(1);
  }

  const dataPath = args[0];
  const configOverrides: Partial<BacktestConfig> = {};

  // Parse CLI flags
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

  // Load data
  console.log(`Loading data from: ${dataPath}`);
  const markets = loadMarkets(dataPath);
  console.log(`Total markets loaded: ${markets.length}`);

  // Validate we have what we need
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

  // Run backtest
  const result = runBacktest(markets, configOverrides);

  // Print report
  printReport(result, configOverrides);
}

main();
