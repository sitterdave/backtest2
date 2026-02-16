import { Market, Pair } from "./types";

/**
 * Step 1: Form BTC-Alt pairs from a list of markets.
 *
 * Grouping logic:
 *  - Markets are grouped by their time window (startTime + endTime)
 *    which identifies the same 15-min round.
 *  - Within each group, every alt market (ETH, XRP, SOL) is paired
 *    with the BTC market that has the same direction.
 *  - Both markets must have a known outcome (not UNKNOWN).
 */
export function formPairs(markets: Market[]): Pair[] {
  // Group by time window key
  const groups = new Map<string, Market[]>();

  for (const m of markets) {
    const key = `${m.startTime}_${m.endTime}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(m);
  }

  const pairs: Pair[] = [];

  for (const group of groups.values()) {
    const btcMarkets = group.filter((m) => m.asset === "BTC");
    const altMarkets = group.filter((m) => m.asset !== "BTC");

    for (const alt of altMarkets) {
      // Skip if alt outcome is unknown
      if (alt.outcome === "UNKNOWN") continue;

      // Find matching BTC market with same direction
      const btc = btcMarkets.find((b) => b.direction === alt.direction);
      if (!btc) continue;

      // Skip if BTC outcome is unknown
      if (btc.outcome === "UNKNOWN") continue;

      pairs.push({ btcMarket: btc, altMarket: alt });
    }
  }

  return pairs;
}
