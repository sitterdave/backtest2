import * as fs from "fs";
import * as path from "path";
import { Market } from "./types";
import { loadMarketsFromCsvFolders } from "./csv-loader";

/**
 * Auto-detect data format and load markets.
 *
 * Supports:
 *  1. JSON file or directory of JSON files
 *  2. CSV folder structure: market_Self/26_02_07_07_30_07_45/BTC.csv etc.
 */
export function loadMarkets(inputPath: string): Market[] {
  const resolved = path.resolve(inputPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Path does not exist: ${resolved}`);
  }

  const stat = fs.statSync(resolved);

  if (stat.isFile() && resolved.endsWith(".json")) {
    return loadFromJsonFile(resolved);
  }

  if (stat.isDirectory()) {
    // Auto-detect: does it contain CSV files or JSON files?
    if (containsCSV(resolved)) {
      return loadMarketsFromCsvFolders(resolved);
    }

    // Check if subdirectories contain CSV files (base folder like market_Self/)
    const entries = fs.readdirSync(resolved);
    const hasSubdirsWithCSV = entries.some((e) => {
      const full = path.join(resolved, e);
      return fs.statSync(full).isDirectory() && containsCSV(full);
    });
    if (hasSubdirsWithCSV) {
      return loadMarketsFromCsvFolders(resolved);
    }

    // Fall back to JSON directory
    return loadFromJsonDirectory(resolved);
  }

  throw new Error(`Unsupported file type: ${resolved}`);
}

function containsCSV(dirPath: string): boolean {
  return fs.readdirSync(dirPath).some((f) => f.endsWith(".csv"));
}

function loadFromJsonFile(filePath: string): Market[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw);

  if (Array.isArray(data)) {
    return validateMarkets(data, filePath);
  }

  if (data && typeof data === "object" && data.asset) {
    return validateMarkets([data], filePath);
  }

  throw new Error(
    `Unexpected JSON structure in ${filePath}. Expected an array of Market objects.`
  );
}

function loadFromJsonDirectory(dirPath: string): Market[] {
  const files = fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    throw new Error(`No .json or .csv files found in directory: ${dirPath}`);
  }

  const allMarkets: Market[] = [];
  for (const file of files) {
    const markets = loadFromJsonFile(path.join(dirPath, file));
    allMarkets.push(...markets);
  }

  console.log(
    `Loaded ${allMarkets.length} markets from ${files.length} JSON files in ${dirPath}`
  );
  return allMarkets;
}

function validateMarkets(data: unknown[], source: string): Market[] {
  const markets: Market[] = [];

  for (let i = 0; i < data.length; i++) {
    const m = data[i] as Record<string, unknown>;

    if (!m.asset || !m.direction || m.startTime == null || m.endTime == null) {
      console.warn(
        `Skipping invalid market at index ${i} in ${source}: missing required fields`
      );
      continue;
    }

    if (!Array.isArray(m.ticks) || m.ticks.length === 0) {
      console.warn(
        `Skipping market "${m.asset} - ${m.direction}" at index ${i} in ${source}: no ticks`
      );
      continue;
    }

    const outcome = m.outcome as string;
    if (!["YES", "NO", "UNKNOWN"].includes(outcome)) {
      console.warn(
        `Skipping market "${m.asset} - ${m.direction}" at index ${i} in ${source}: invalid outcome "${outcome}"`
      );
      continue;
    }

    markets.push(m as unknown as Market);
  }

  return markets;
}
