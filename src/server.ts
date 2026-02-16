import express from "express";
import * as path from "path";
import * as fs from "fs";
import { loadMarkets } from "./loader";
import { runBacktest, printReport, DEFAULT_CONFIG } from "./backtest";
import { BacktestConfig } from "./types";

const app = express();
const PORT = 3001;

app.use(express.json());

// Serve static frontend
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "ui.html"));
});

// List available data directories
app.get("/api/data-paths", (_req, res) => {
  const dataDir = path.join(__dirname, "..", "data");
  const paths: string[] = [];

  if (fs.existsSync(dataDir)) {
    const scan = (dir: string, rel: string) => {
      const entries = fs.readdirSync(dir);
      const hasCSV = entries.some((e) => e.endsWith(".csv"));
      const hasJSON = entries.some((e) => e.endsWith(".json"));
      if (hasCSV || hasJSON) {
        paths.push(rel);
      }
      for (const entry of entries) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
          scan(full, rel ? `${rel}/${entry}` : entry);
        }
      }
    };
    scan(dataDir, "");
  }

  res.json({ paths, dataDir });
});

// Get default config
app.get("/api/config", (_req, res) => {
  res.json(DEFAULT_CONFIG);
});

// Run backtest
app.post("/api/backtest", (req, res) => {
  try {
    const { dataPath, config } = req.body as {
      dataPath: string;
      config: Partial<BacktestConfig>;
    };

    if (!dataPath) {
      return res.status(400).json({ error: "dataPath is required" });
    }

    // Resolve path relative to project data directory
    const resolvedPath = path.isAbsolute(dataPath)
      ? dataPath
      : path.join(__dirname, "..", "data", dataPath);

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: `Path not found: ${resolvedPath}` });
    }

    const markets = loadMarkets(resolvedPath);
    const result = runBacktest(markets, config || {});

    // Build response with extra metadata
    const btcCount = markets.filter((m) => m.asset === "BTC").length;
    const altCount = markets.filter((m) => m.asset !== "BTC").length;

    res.json({
      meta: {
        marketsLoaded: markets.length,
        btcMarkets: btcCount,
        altMarkets: altCount,
        dataPath: resolvedPath,
      },
      config: { ...DEFAULT_CONFIG, ...config },
      result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`\n  Backtest UI running at http://localhost:${PORT}\n`);
});
