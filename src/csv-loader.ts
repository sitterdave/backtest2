import * as fs from "fs";
import * as path from "path";
import { Asset, Market, Outcome, Tick } from "./types";

const VALID_ASSETS: Asset[] = ["BTC", "ETH", "XRP", "SOL"];

/**
 * Load markets from the market_Self folder structure.
 *
 * Expected layout:
 *   market_Self/
 *     26_02_07_07_30_07_45/   ← time window folder (YY_MM_DD_HH_MM_HH_MM)
 *       BTC.csv
 *       ETH.csv
 *       XRP.csv
 *       SOL.csv
 *     26_02_07_07_45_08_00/
 *       ...
 *
 * CSV format (tab-separated):
 *   timestamp  elapsed_ms  up_bid  up_ask  up_mid  down_bid  down_ask  down_mid
 *   2026-02-07T07:42:35.415Z  755415  0  1  64.5  99  100  99.5
 *
 * Prices are in CENTS (0-100). We convert to fractions (0-1).
 * Outcome derived from last tick: up_mid >= 50 → YES, < 50 → NO.
 */
export function loadMarketsFromCsvFolders(basePath: string): Market[] {
  const resolved = path.resolve(basePath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Path does not exist: ${resolved}`);
  }

  const stat = fs.statSync(resolved);

  // If it's a single time-window folder (contains CSV files directly)
  if (stat.isDirectory() && hasCSVFiles(resolved)) {
    const parentName = path.basename(path.dirname(resolved));
    if (parentName.startsWith("market_")) {
      // It's a single time window folder inside market_Self
      return loadTimeWindow(resolved);
    }
    // Could be the base folder itself, or a time-window folder
    const entries = fs.readdirSync(resolved);
    const subdirs = entries.filter((e) =>
      fs.statSync(path.join(resolved, e)).isDirectory()
    );
    if (subdirs.length > 0 && subdirs.some((d) => hasCSVFiles(path.join(resolved, d)))) {
      // This is the base folder (market_Self), load all subfolders
      return loadAllTimeWindows(resolved);
    }
    // It's a single time-window folder
    return loadTimeWindow(resolved);
  }

  if (stat.isDirectory()) {
    return loadAllTimeWindows(resolved);
  }

  throw new Error(`Expected a directory, got: ${resolved}`);
}

function hasCSVFiles(dirPath: string): boolean {
  return fs.readdirSync(dirPath).some((f) => f.endsWith(".csv"));
}

function loadAllTimeWindows(basePath: string): Market[] {
  const entries = fs.readdirSync(basePath).sort();
  const allMarkets: Market[] = [];

  for (const entry of entries) {
    const fullPath = path.join(basePath, entry);
    if (!fs.statSync(fullPath).isDirectory()) continue;
    if (!hasCSVFiles(fullPath)) continue;

    const markets = loadTimeWindow(fullPath);
    allMarkets.push(...markets);
  }

  if (allMarkets.length === 0) {
    throw new Error(`No market data found in: ${basePath}`);
  }

  console.log(
    `Loaded ${allMarkets.length} markets from ${entries.length} time windows in ${basePath}`
  );
  return allMarkets;
}

/**
 * Parse a time-window folder name like "26_02_07_07_30_07_45"
 * → { startTime: Date(2026-02-07T07:30:00Z), endTime: Date(2026-02-07T07:45:00Z) }
 */
function parseTimeWindow(folderName: string): { startTime: number; endTime: number } | null {
  // Match YY_MM_DD_HH_MM_HH_MM
  const match = folderName.match(
    /^(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})$/
  );
  if (!match) return null;

  const [, yy, mm, dd, startHH, startMM, endHH, endMM] = match;
  const year = 2000 + parseInt(yy, 10);
  const month = parseInt(mm, 10) - 1; // JS months are 0-based
  const day = parseInt(dd, 10);

  const startTime = Date.UTC(year, month, day, parseInt(startHH), parseInt(startMM));
  const endTime = Date.UTC(year, month, day, parseInt(endHH), parseInt(endMM));

  return { startTime, endTime };
}

function loadTimeWindow(dirPath: string): Market[] {
  const folderName = path.basename(dirPath);
  const timeWindow = parseTimeWindow(folderName);

  if (!timeWindow) {
    console.warn(
      `Cannot parse time window from folder name "${folderName}". ` +
        `Will use first/last tick timestamps instead.`
    );
  }

  const csvFiles = fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith(".csv"))
    .sort();

  const markets: Market[] = [];

  for (const csvFile of csvFiles) {
    const assetName = path.basename(csvFile, ".csv").toUpperCase() as Asset;
    if (!VALID_ASSETS.includes(assetName)) {
      console.warn(`Skipping unknown asset file: ${csvFile}`);
      continue;
    }

    const filePath = path.join(dirPath, csvFile);
    const ticks = parseCSV(filePath);

    if (ticks.length === 0) {
      console.warn(`No valid ticks in ${filePath}, skipping.`);
      continue;
    }

    // Determine start/end time
    let startTime: number;
    let endTime: number;
    if (timeWindow) {
      startTime = timeWindow.startTime;
      endTime = timeWindow.endTime;
    } else {
      startTime = ticks[0].timestamp;
      endTime = ticks[ticks.length - 1].timestamp;
    }

    // Derive outcome from last tick
    const lastTick = ticks[ticks.length - 1];
    const outcome = deriveOutcome(lastTick);

    const market: Market = {
      id: `${folderName}_${assetName}`,
      asset: assetName,
      direction: folderName, // all assets in same folder share the event
      startTime,
      endTime,
      ticks,
      outcome,
    };

    markets.push(market);
  }

  return markets;
}

/**
 * Derive outcome from the last tick.
 * If up_mid (yesPrice) >= 0.50 → YES won.
 * If up_mid < 0.50 → NO won.
 * If prices are near 0.50 (between 0.40 and 0.60), mark as UNKNOWN.
 */
function deriveOutcome(lastTick: Tick): Outcome {
  const yesMid = lastTick.yesPrice;
  if (yesMid >= 0.90) return "YES";
  if (yesMid <= 0.10) return "NO";
  // Ambiguous — the market hasn't clearly resolved
  if (yesMid >= 0.60) return "YES";
  if (yesMid <= 0.40) return "NO";
  return "UNKNOWN";
}

/**
 * Parse a CSV file into Tick objects.
 * Handles both tab-separated and comma-separated formats.
 * Prices converted from cents (0-100) to fractions (0-1).
 */
function parseCSV(filePath: string): Tick[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.trim().split("\n");

  if (lines.length < 2) return []; // header only or empty

  // Detect separator from header
  const header = lines[0];
  const sep = header.includes("\t") ? "\t" : ",";
  const columns = header.split(sep).map((c) => c.trim().toLowerCase());

  // Map column names to indices
  const colIdx = (name: string): number => {
    const idx = columns.indexOf(name);
    if (idx === -1) {
      // Try common alternatives
      const alternatives: Record<string, string[]> = {
        timestamp: ["timestamp", "time", "ts"],
        up_bid: ["up_bid", "upbid", "yes_bid", "yesbid"],
        up_ask: ["up_ask", "upask", "yes_ask", "yesask"],
        up_mid: ["up_mid", "upmid", "yes_mid", "yesmid"],
        down_bid: ["down_bid", "downbid", "no_bid", "nobid"],
        down_ask: ["down_ask", "downask", "no_ask", "noask"],
        down_mid: ["down_mid", "downmid", "no_mid", "nomid"],
      };
      for (const alt of alternatives[name] || []) {
        const altIdx = columns.indexOf(alt);
        if (altIdx !== -1) return altIdx;
      }
    }
    return idx;
  };

  const tsIdx = colIdx("timestamp");
  const upBidIdx = colIdx("up_bid");
  const upAskIdx = colIdx("up_ask");
  const upMidIdx = colIdx("up_mid");
  const downBidIdx = colIdx("down_bid");
  const downAskIdx = colIdx("down_ask");
  const downMidIdx = colIdx("down_mid");

  if (tsIdx === -1 || upMidIdx === -1 || downMidIdx === -1) {
    console.warn(
      `Missing required columns in ${filePath}. Found: ${columns.join(", ")}`
    );
    return [];
  }

  const ticks: Tick[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = line.split(sep);

    const tsStr = fields[tsIdx]?.trim();
    if (!tsStr) continue;

    const timestamp = new Date(tsStr).getTime();
    if (isNaN(timestamp)) {
      console.warn(`Invalid timestamp at line ${i + 1} in ${filePath}: "${tsStr}"`);
      continue;
    }

    // Parse prices (cents → fractions)
    const parsePrice = (idx: number): number | undefined => {
      if (idx === -1) return undefined;
      const val = parseFloat(fields[idx]?.trim());
      if (isNaN(val)) return undefined;
      return val / 100; // cents to fraction
    };

    const upMid = parsePrice(upMidIdx);
    const downMid = parsePrice(downMidIdx);
    if (upMid == null || downMid == null) continue;

    const tick: Tick = {
      timestamp,
      yesPrice: upMid,
      noPrice: downMid,
    };

    // Add order book fields if available
    const upBid = parsePrice(upBidIdx);
    const upAsk = parsePrice(upAskIdx);
    const downBid = parsePrice(downBidIdx);
    const downAsk = parsePrice(downAskIdx);

    if (upBid != null) tick.bestYesBid = upBid;
    if (upAsk != null) tick.bestYesAsk = upAsk;
    if (downBid != null) tick.bestNoBid = downBid;
    if (downAsk != null) tick.bestNoAsk = downAsk;

    ticks.push(tick);
  }

  return ticks;
}
