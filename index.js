import express from "express";
import fetch from "node-fetch";
const app = express();
const PORT = 8000;
// TTL for cache (in milliseconds) → 5 minutes
const CACHE_TTL = 5 * 60 * 1000;
const SOURCES = {
  ongoing: "https://www.onlinekhabar.com/smtm/home/ipo-corner-ongoing",
  upcoming: "https://www.onlinekhabar.com/smtm/home/ipo-corner-upcoming",
  tickers: "https://www.onlinekhabar.com/smtm/stock_live/live-trading",
  news: "https://www.onlinekhabar.com/wp-json/okapi/v1/category-posts?category=share-market",
  indices: "https://www.onlinekhabar.com/smtm/home/indices-data/nepse/1d",
  sectorPerformance: "https://www.onlinekhabar.com/smtm/stock_live/sector-performance",
  marketStatus: "https://www.onlinekhabar.com/smtm/home/market-status",
};

const INDICES_BASE_URL = "https://www.onlinekhabar.com/smtm/home/indices-data/nepse";
// In-memory cache store
const cache = {};
// Generic fetch with caching
async function fetchWithCache(key, url) {
  const now = Date.now();
  // Return cached data if not expired
  if (cache[key] && now - cache[key].timestamp < CACHE_TTL) {
    return cache[key].data;
  }
  // Otherwise fetch fresh data
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  const data = await res.json();
  // Store in cache
  cache[key] = { data, timestamp: now };
  return data;
}
// ✅ Ongoing IPOs
app.get("/api/ipos/ongoing", async (req, res) => {
  try {
    const data = await fetchWithCache("ongoing", SOURCES.ongoing);
    res.json({ success: true, type: "ongoing", data: data.response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
// ✅ Upcoming IPOs
app.get("/api/ipos/upcoming", async (req, res) => {
  try {
    const data = await fetchWithCache("upcoming", SOURCES.upcoming);
    res.json({ success: true, type: "upcoming", data: data.response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
// ✅ Tickers
app.get("/api/tickers", async (req, res) => {
  try {
    const data = await fetchWithCache("tickers", SOURCES.tickers);
    res.json({ success: true, type: "tickers", data: data.response ?? data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
// ✅ News
app.get("/api/news", async (req, res) => {
  try {
    const data = await fetchWithCache("news", SOURCES.news);
    res.json({ success: true, type: "news", data: data.data.news });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ Indices (1d - default)
app.get("/api/indices", async (req, res) => {
  try {
    const data = await fetchWithCache("indices", SOURCES.indices);
    res.json({ success: true, type: "indices", data: data.response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ Indices with time range parameter (1d, 1m, 3m, 1y, 5y, all)
app.get("/api/indices/:timeRange", async (req, res) => {
  try {
    const { timeRange } = req.params;
    // Validate time range
    const validRanges = ["1d", "1m", "3m", "1y", "5y", "all"];
    if (!validRanges.includes(timeRange)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid time range. Use one of: 1d, 1m, 3m, 1y, 5y, all" 
      });
    }
    
    const url = `${INDICES_BASE_URL}/${timeRange}`;
    const data = await fetchWithCache(`indices_${timeRange}`, url);
    res.json({ success: true, type: "indices", timeRange, data: data.response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ Sector Performance
app.get("/api/sector-performance", async (req, res) => {
  try {
    const data = await fetchWithCache("sectorPerformance", SOURCES.sectorPerformance);
    res.json({ success: true, type: "sectorPerformance", data: data.response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ Market Status (NEW ENDPOINT)
app.get("/api/market-status", async (req, res) => {
  try {
    const data = await fetchWithCache("marketStatus", SOURCES.marketStatus);
    res.json({ success: true, type: "marketStatus", data: data.response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ Combined (all APIs together)
app.get("/api/ipos", async (req, res) => {
  try {
    const [ongoing, upcoming, tickers, indices] = await Promise.all([
      fetchWithCache("ongoing", SOURCES.ongoing),
      fetchWithCache("upcoming", SOURCES.upcoming),
      fetchWithCache("tickers", SOURCES.tickers),
      fetchWithCache("indices", SOURCES.indices),
    ]);
    res.json({
      success: true,
      ongoing: ongoing.response,
      upcoming: upcoming.response,
      tickers: tickers.response ?? tickers,
      indices: indices.response,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ Combined All (including sector performance and market status)
app.get("/api/all", async (req, res) => {
  try {
    const [ongoing, upcoming, tickers, indices, sectorPerformance, marketStatus] = await Promise.all([
      fetchWithCache("ongoing", SOURCES.ongoing),
      fetchWithCache("upcoming", SOURCES.upcoming),
      fetchWithCache("tickers", SOURCES.tickers),
      fetchWithCache("indices", SOURCES.indices),
      fetchWithCache("sectorPerformance", SOURCES.sectorPerformance),
      fetchWithCache("marketStatus", SOURCES.marketStatus),
    ]);
    res.json({
      success: true,
      ongoing: ongoing.response,
      upcoming: upcoming.response,
      tickers: tickers.response ?? tickers,
      indices: indices.response,
      sectorPerformance: sectorPerformance.response,
      marketStatus: marketStatus.response,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
