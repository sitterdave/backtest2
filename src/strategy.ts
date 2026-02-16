import { BacktestConfig, Pair, Tick, Trade, TradeSide } from "./types";

// Tolerance for floating point comparisons on prices (sub-cent precision)
const EPSILON = 1e-9;

/**
 * Find the last BTC tick with timestamp <= the given timestamp.
 * BTC ticks must be sorted chronologically.
 */
function findNearestBtcTick(btcTicks: Tick[], timestamp: number): Tick | null {
  let best: Tick | null = null;
  for (const t of btcTicks) {
    if (t.timestamp <= timestamp) {
      best = t;
    } else {
      break; // ticks are sorted, no need to continue
    }
  }
  return best;
}

/**
 * Step 2+3+4: For a single pair, scan for a gap, execute a trade, and determine exit.
 *
 * Returns a Trade if a gap was found and a trade was made, or null otherwise.
 */
export function processPair(pair: Pair, config: BacktestConfig): Trade | null {
  const { btcMarket, altMarket } = pair;
  const { minGap, exitGap, checkStart, checkEnd, stakeSize } = config;

  const duration = altMarket.endTime - altMarket.startTime;
  const scanStart = altMarket.startTime + duration * checkStart;
  const scanEnd = altMarket.startTime + duration * checkEnd;

  // Sort ticks chronologically (defensive — should already be sorted)
  const altTicks = [...altMarket.ticks].sort((a, b) => a.timestamp - b.timestamp);
  const btcTicks = [...btcMarket.ticks].sort((a, b) => a.timestamp - b.timestamp);

  // ── Step 2: Find the first gap ──
  let entrySide: TradeSide | null = null;
  let entryAltTick: Tick | null = null;
  let entryBtcTick: Tick | null = null;
  let entryGap = 0;

  for (const altTick of altTicks) {
    if (altTick.timestamp < scanStart) continue;
    if (altTick.timestamp > scanEnd) break;

    const btcTick = findNearestBtcTick(btcTicks, altTick.timestamp);
    if (!btcTick) continue;

    // Check YES side: gap = btcYes - altYes
    const yesGap = btcTick.yesPrice - altTick.yesPrice;
    if (yesGap >= minGap) {
      entrySide = "YES";
      entryAltTick = altTick;
      entryBtcTick = btcTick;
      entryGap = yesGap;
      break;
    }

    // Check NO side: gap = btcNo - altNo
    const noGap = btcTick.noPrice - altTick.noPrice;
    if (noGap >= minGap) {
      entrySide = "NO";
      entryAltTick = altTick;
      entryBtcTick = btcTick;
      entryGap = noGap;
      break;
    }
  }

  // No gap found → no trade
  if (!entrySide || !entryAltTick || !entryBtcTick) return null;

  // ── Step 3: Entry ──
  const entryPrice =
    entrySide === "YES" ? entryAltTick.yesPrice : entryAltTick.noPrice;

  // ── Step 4: Exit logic ──
  // Scan all alt ticks after the entry tick
  const postEntryTicks = altTicks.filter(
    (t) => t.timestamp > entryAltTick!.timestamp
  );

  for (const laterAltTick of postEntryTicks) {
    const laterBtcTick = findNearestBtcTick(btcTicks, laterAltTick.timestamp);
    if (!laterBtcTick) continue;

    const currentAltPrice =
      entrySide === "YES" ? laterAltTick.yesPrice : laterAltTick.noPrice;
    const currentBtcPrice =
      entrySide === "YES" ? laterBtcTick.yesPrice : laterBtcTick.noPrice;
    const currentGap = currentBtcPrice - currentAltPrice;

    // Early exit: gap has closed (with floating point tolerance)
    if (currentGap <= exitGap + EPSILON) {
      const pnl = ((currentAltPrice - entryPrice) / entryPrice) * stakeSize;
      return {
        asset: altMarket.asset,
        direction: altMarket.direction,
        side: entrySide,
        entryPrice,
        entryTimestamp: entryAltTick.timestamp,
        gapAtEntry: entryGap,
        exitType: "EARLY_EXIT",
        exitPrice: currentAltPrice,
        exitTimestamp: laterAltTick.timestamp,
        pnl,
      };
    }
  }

  // ── Hold to Resolution ──
  const altOutcome = altMarket.outcome; // YES or NO
  const won = altOutcome === entrySide;

  let pnl: number;
  if (won) {
    pnl = ((1 - entryPrice) / entryPrice) * stakeSize;
  } else {
    pnl = -stakeSize;
  }

  return {
    asset: altMarket.asset,
    direction: altMarket.direction,
    side: entrySide,
    entryPrice,
    entryTimestamp: entryAltTick.timestamp,
    gapAtEntry: entryGap,
    exitType: "HOLD_TO_RESOLUTION",
    exitPrice: won ? 1 : 0,
    exitTimestamp: altMarket.endTime,
    pnl,
  };
}
