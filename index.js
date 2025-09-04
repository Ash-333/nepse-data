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
};

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

// ✅ Combined (all APIs together)
app.get("/api/ipos", async (req, res) => {
  try {
    const [ongoing, upcoming, tickers] = await Promise.all([
      fetchWithCache("ongoing", SOURCES.ongoing),
      fetchWithCache("upcoming", SOURCES.upcoming),
      fetchWithCache("tickers", SOURCES.tickers),
    ]);

    res.json({
      success: true,
      ongoing: ongoing.response,
      upcoming: upcoming.response,
      tickers: tickers.response ?? tickers,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
