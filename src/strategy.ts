import { BacktestConfig, ExitType, Pair, SkipReason, Tick, Trade, TradeSide } from "./types";

// Tolerance for floating point comparisons on prices (sub-cent precision)
const EPSILON = 1e-9;

// ── Price helpers ──

/** Get the price we'd PAY to BUY side X (ask if available, else mid). */
function getAskPrice(tick: Tick, side: TradeSide): number {
  if (side === "YES") return tick.bestYesAsk ?? tick.yesPrice;
  return tick.bestNoAsk ?? tick.noPrice;
}

/** Get the price we'd RECEIVE to SELL side X (bid if available, else mid). */
function getBidPrice(tick: Tick, side: TradeSide): number {
  if (side === "YES") return tick.bestYesBid ?? tick.yesPrice;
  return tick.bestNoBid ?? tick.noPrice;
}

/** Get mid price for side X (always from yesPrice/noPrice). */
function getMidPrice(tick: Tick, side: TradeSide): number {
  return side === "YES" ? tick.yesPrice : tick.noPrice;
}

/** Get spread for a given side (ask - bid). Returns 0 if no order book data. */
function getSpread(tick: Tick, side: TradeSide): number {
  const ask = side === "YES" ? tick.bestYesAsk : tick.bestNoAsk;
  const bid = side === "YES" ? tick.bestYesBid : tick.bestNoBid;
  if (ask != null && bid != null) return ask - bid;
  return 0;
}

/** Get depth for a given side. Returns Infinity if no depth data. */
function getDepth(tick: Tick, side: TradeSide): number {
  const d = side === "YES" ? tick.yesDepth : tick.noDepth;
  return d ?? Infinity;
}

// ── Core logic ──

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
      break;
    }
  }
  return best;
}

/**
 * Build a trade result with fees and slippage applied.
 */
function buildTrade(
  params: {
    asset: Trade["asset"];
    direction: string;
    side: TradeSide;
    entryPrice: number;
    entryTimestamp: number;
    gapAtEntry: number;
    exitType: ExitType;
    exitPrice: number;
    exitTimestamp: number;
    entrySpread?: number;
    entryDepth?: number;
  },
  config: BacktestConfig
): Trade {
  const { stakeSize, feePct, slippagePct } = config;
  const { entryPrice, exitPrice } = params;

  // Gross PnL based on execution prices
  let grossPnl: number;
  if (params.exitType === "HOLD_TO_RESOLUTION") {
    // exitPrice is 1 (won) or 0 (lost)
    if (exitPrice === 1) {
      grossPnl = ((1 - entryPrice) / entryPrice) * stakeSize;
    } else {
      grossPnl = -stakeSize;
    }
  } else {
    // Early exit, max hold, or stop loss — sell at exitPrice
    grossPnl = ((exitPrice - entryPrice) / entryPrice) * stakeSize;
  }

  // Fees: applied on entry and exit transactions
  // Entry fee: feePct * stakeSize
  // Exit fee: feePct * (stakeSize + grossPnl) — on exit value
  const entryFee = feePct * stakeSize;
  let exitValue: number;
  if (params.exitType === "HOLD_TO_RESOLUTION") {
    exitValue = exitPrice === 1 ? (stakeSize / entryPrice) : 0;
  } else {
    exitValue = (exitPrice / entryPrice) * stakeSize;
  }
  const exitFee = feePct * exitValue;
  const fees = entryFee + exitFee;

  // Slippage: applied on entry and exit
  const entrySlippage = slippagePct * stakeSize;
  const exitSlippage = slippagePct * exitValue;
  const slippage = entrySlippage + exitSlippage;

  const pnl = grossPnl - fees - slippage;

  return {
    ...params,
    grossPnl,
    fees,
    slippage,
    pnl,
  };
}

export interface ProcessPairResult {
  trade: Trade | null;
  skip: SkipReason | null;
}

/**
 * Step 2+3+4: For a single pair, scan for a gap, execute a trade, and determine exit.
 *
 * Uses order book prices for execution when available:
 *  - Entry gap: btcMid - altAsk (we BUY alt at ask)
 *  - Entry price: altAsk
 *  - Exit gap: btcMid - altBid (we SELL alt at bid)
 *  - Exit price: altBid
 *
 * Safety rails:
 *  - Liquidity guard: skip if spread > maxSpread or depth < minDepth
 *  - Max hold: forced exit after maxHoldMs
 *  - Stop loss: exit if gap widens beyond stopLossGap
 */
export function processPair(
  pair: Pair,
  config: BacktestConfig
): ProcessPairResult {
  const { btcMarket, altMarket } = pair;
  const { minGap, exitGap, checkStart, checkEnd, maxHoldMs, stopLossGap, minDepth, maxSpread } = config;

  const duration = altMarket.endTime - altMarket.startTime;
  const scanStart = altMarket.startTime + duration * checkStart;
  const scanEnd = altMarket.startTime + duration * checkEnd;

  const altTicks = [...altMarket.ticks].sort((a, b) => a.timestamp - b.timestamp);
  const btcTicks = [...btcMarket.ticks].sort((a, b) => a.timestamp - b.timestamp);

  const pairInfo = { btcId: btcMarket.id, altId: altMarket.id, altAsset: altMarket.asset };

  // ── Step 2: Find the first gap ──
  let entrySide: TradeSide | null = null;
  let entryAltTick: Tick | null = null;
  let entryGap = 0;

  for (const altTick of altTicks) {
    if (altTick.timestamp < scanStart) continue;
    if (altTick.timestamp > scanEnd) break;

    const btcTick = findNearestBtcTick(btcTicks, altTick.timestamp);
    if (!btcTick) continue;

    // Check YES side: gap = btcMid - altAsk (what we'd actually pay)
    const yesGap = getMidPrice(btcTick, "YES") - getAskPrice(altTick, "YES");
    if (yesGap >= minGap - EPSILON) {
      // Liquidity guard on YES side
      const spread = getSpread(altTick, "YES");
      const depth = getDepth(altTick, "YES");
      if (maxSpread > 0 && spread > maxSpread) {
        return {
          trade: null,
          skip: { pair: pairInfo, reason: `YES spread ${spread.toFixed(3)} > maxSpread ${maxSpread}`, timestamp: altTick.timestamp },
        };
      }
      if (minDepth > 0 && depth < minDepth) {
        return {
          trade: null,
          skip: { pair: pairInfo, reason: `YES depth $${depth.toFixed(2)} < minDepth $${minDepth}`, timestamp: altTick.timestamp },
        };
      }

      entrySide = "YES";
      entryAltTick = altTick;
      entryGap = yesGap;
      break;
    }

    // Check NO side: gap = btcMid - altAsk
    const noGap = getMidPrice(btcTick, "NO") - getAskPrice(altTick, "NO");
    if (noGap >= minGap - EPSILON) {
      const spread = getSpread(altTick, "NO");
      const depth = getDepth(altTick, "NO");
      if (maxSpread > 0 && spread > maxSpread) {
        return {
          trade: null,
          skip: { pair: pairInfo, reason: `NO spread ${spread.toFixed(3)} > maxSpread ${maxSpread}`, timestamp: altTick.timestamp },
        };
      }
      if (minDepth > 0 && depth < minDepth) {
        return {
          trade: null,
          skip: { pair: pairInfo, reason: `NO depth $${depth.toFixed(2)} < minDepth $${minDepth}`, timestamp: altTick.timestamp },
        };
      }

      entrySide = "NO";
      entryAltTick = altTick;
      entryGap = noGap;
      break;
    }
  }

  if (!entrySide || !entryAltTick) return { trade: null, skip: null };

  // ── Step 3: Entry ──
  const entryPrice = getAskPrice(entryAltTick, entrySide);
  const entrySpread = getSpread(entryAltTick, entrySide) || undefined;
  const entryDepthVal = getDepth(entryAltTick, entrySide);
  const entryDepth = entryDepthVal === Infinity ? undefined : entryDepthVal;

  // ── Step 4: Exit logic ──
  const postEntryTicks = altTicks.filter(
    (t) => t.timestamp > entryAltTick!.timestamp
  );

  for (const laterAltTick of postEntryTicks) {
    const laterBtcTick = findNearestBtcTick(btcTicks, laterAltTick.timestamp);
    if (!laterBtcTick) continue;

    // Current prices: alt bid (what we'd sell for) and btc mid
    const currentAltBid = getBidPrice(laterAltTick, entrySide);
    const currentBtcMid = getMidPrice(laterBtcTick, entrySide);
    const currentGap = currentBtcMid - currentAltBid;

    const holdDuration = laterAltTick.timestamp - entryAltTick.timestamp;

    // Stop loss: gap widened beyond threshold
    if (stopLossGap > 0 && currentGap >= stopLossGap + EPSILON) {
      const trade = buildTrade(
        {
          asset: altMarket.asset,
          direction: altMarket.direction,
          side: entrySide,
          entryPrice,
          entryTimestamp: entryAltTick.timestamp,
          gapAtEntry: entryGap,
          exitType: "STOP_LOSS",
          exitPrice: currentAltBid,
          exitTimestamp: laterAltTick.timestamp,
          entrySpread,
          entryDepth,
        },
        config
      );
      return { trade, skip: null };
    }

    // Max hold: time limit reached
    if (maxHoldMs > 0 && holdDuration >= maxHoldMs) {
      const trade = buildTrade(
        {
          asset: altMarket.asset,
          direction: altMarket.direction,
          side: entrySide,
          entryPrice,
          entryTimestamp: entryAltTick.timestamp,
          gapAtEntry: entryGap,
          exitType: "MAX_HOLD",
          exitPrice: currentAltBid,
          exitTimestamp: laterAltTick.timestamp,
          entrySpread,
          entryDepth,
        },
        config
      );
      return { trade, skip: null };
    }

    // Early exit: gap has closed
    if (currentGap <= exitGap + EPSILON) {
      const trade = buildTrade(
        {
          asset: altMarket.asset,
          direction: altMarket.direction,
          side: entrySide,
          entryPrice,
          entryTimestamp: entryAltTick.timestamp,
          gapAtEntry: entryGap,
          exitType: "EARLY_EXIT",
          exitPrice: currentAltBid,
          exitTimestamp: laterAltTick.timestamp,
          entrySpread,
          entryDepth,
        },
        config
      );
      return { trade, skip: null };
    }
  }

  // ── Hold to Resolution ──
  const won = altMarket.outcome === entrySide;
  const trade = buildTrade(
    {
      asset: altMarket.asset,
      direction: altMarket.direction,
      side: entrySide,
      entryPrice,
      entryTimestamp: entryAltTick.timestamp,
      gapAtEntry: entryGap,
      exitType: "HOLD_TO_RESOLUTION",
      exitPrice: won ? 1 : 0,
      exitTimestamp: altMarket.endTime,
      entrySpread,
      entryDepth,
    },
    config
  );
  return { trade, skip: null };
}
