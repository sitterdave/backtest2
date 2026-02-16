import * as fs from "fs";
import * as path from "path";
import { Market } from "./types";

/**
 * Load market data from a JSON file.
 *
 * Accepts either:
 *  - A single JSON file containing an array of Market objects
 *  - A directory path, in which case all .json files are loaded and merged
 *
 * The loader performs basic validation but does NOT transform or filter data.
 * That is the strategy's job.
 */
export function loadMarkets(inputPath: string): Market[] {
  const resolved = path.resolve(inputPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Path does not exist: ${resolved}`);
  }

  const stat = fs.statSync(resolved);

  if (stat.isDirectory()) {
    return loadFromDirectory(resolved);
  } else {
    return loadFromFile(resolved);
  }
}

function loadFromFile(filePath: string): Market[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw);

  if (Array.isArray(data)) {
    return validateMarkets(data, filePath);
  }

  // Maybe it's a single market object
  if (data && typeof data === "object" && data.asset) {
    return validateMarkets([data], filePath);
  }

  throw new Error(
    `Unexpected JSON structure in ${filePath}. Expected an array of Market objects.`
  );
}

function loadFromDirectory(dirPath: string): Market[] {
  const files = fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    throw new Error(`No .json files found in directory: ${dirPath}`);
  }

  const allMarkets: Market[] = [];
  for (const file of files) {
    const markets = loadFromFile(path.join(dirPath, file));
    allMarkets.push(...markets);
  }

  console.log(
    `Loaded ${allMarkets.length} markets from ${files.length} files in ${dirPath}`
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
