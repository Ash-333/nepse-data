import express from "express";
import fetch from "node-fetch";
import { Expo } from "expo-server-sdk";
import mongoose from "mongoose";

const app = express();
const PORT = 8000;

// Initialize Expo SDK
const expo = new Expo();

// TTL for cache (in milliseconds) → 5 minutes
const CACHE_TTL = 5 * 60 * 1000;

// Store previous states for change detection
const previousStates = {
  marketStatus: null,
  ongoingIpos: [],
  upcomingIpos: [],
};

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

// Middleware
app.use(express.json());

/* -------------------  MongoDB Setup  ------------------- */
const MONGO_URI = "mongodb+srv://ipo_alert:apple@ipo-alert.qe46rim.mongodb.net/?retryWrites=true&w=majority&appName=ipo-alert"; // change for Atlas

mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

const tokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
});

const PushToken = mongoose.model("PushToken", tokenSchema);

/* -------------------  Fetch with Cache  ------------------- */
async function fetchWithCache(key, url) {
  const now = Date.now();
  if (cache[key] && now - cache[key].timestamp < CACHE_TTL) {
    return cache[key].data;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  const data = await res.json();
  cache[key] = { data, timestamp: now };
  return data;
}

/* -------------------  Token Management  ------------------- */
// Register push token
app.post("/api/register-token", async (req, res) => {
  const { token } = req.body;

  if (!token) return res.status(400).json({ success: false, error: "Token is required" });
  if (!Expo.isExpoPushToken(token)) {
    return res.status(400).json({ success: false, error: "Invalid Expo push token" });
  }

  try {
    const existing = await PushToken.findOne({ token });
    if (!existing) {
      await PushToken.create({ token });
      console.log(`✅ New token saved: ${token}`);
    } else {
      console.log(`ℹ️ Token already exists: ${token}`);
    }
    res.json({ success: true, message: "Token registered successfully" });
  } catch (error) {
    console.error("Error saving token:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Remove push token
app.post("/api/remove-token", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, error: "Token is required" });

  try {
    await PushToken.deleteOne({ token });
    console.log(`🗑️ Token removed: ${token}`);
    res.json({ success: true, message: "Token removed successfully" });
  } catch (error) {
    console.error("Error removing token:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* -------------------  Notifications  ------------------- */
async function sendNotificationToAll(title, body, data = {}) {
  try {
    const tokens = await PushToken.find({});
    if (!tokens.length) {
      console.log("⚠️ No registered tokens in DB");
      return;
    }

    const messages = tokens.map(({ token }) => ({
      to: token,
      sound: "default",
      title,
      body,
      data,
      priority: "high",
    }));

    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];

    for (const chunk of chunks) {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);

      // Remove invalid tokens
      ticketChunk.forEach(async (ticket, i) => {
        if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
          const badToken = chunk[i].to;
          await PushToken.deleteOne({ token: badToken });
          console.log(`🗑️ Removed invalid token: ${badToken}`);
        }
      });
    }

    console.log(`📩 Sent notifications to ${tickets.length} devices`);
  } catch (error) {
    console.error("❌ Error sending notifications:", error);
  }
}

/* -------------------  Change Detection Helpers  ------------------- */
async function checkMarketStatusChange(currentStatus) {
  if (!previousStates.marketStatus) {
    previousStates.marketStatus = currentStatus;
    return;
  }
  if (previousStates.marketStatus.status !== currentStatus.status) {
    await sendNotificationToAll(
      "Market Status Update",
      `Market is now ${currentStatus.status}`,
      {
        type: "market_status",
        status: currentStatus.status,
        timestamp: Date.now(),
      }
    );
    previousStates.marketStatus = currentStatus;
  }
}

async function checkForNewIpos(currentIpos, type) {
  const previousIpos = previousStates[`${type}Ipos`];
  if (!previousIpos || previousIpos.length === 0) {
    previousStates[`${type}Ipos`] = currentIpos;
    return;
  }
  const newIpos = currentIpos.filter(
    (current) => !previousIpos.some((prev) => prev.companyName === current.companyName)
  );
  if (newIpos.length > 0) {
    const ipoList = newIpos.map((ipo) => ipo.companyName).join(", ");
    await sendNotificationToAll(
      "New IPO Alert",
      `${type === "ongoing" ? "Ongoing" : "Upcoming"} IPOs: ${ipoList}`,
      {
        type: "new_ipo",
        ipoType: type,
        companies: newIpos.map((ipo) => ({
          name: ipo.companyName,
          symbol: ipo.symbol,
        })),
        timestamp: Date.now(),
      }
    );
    previousStates[`${type}Ipos`] = currentIpos;
  }
}

/* -------------------  Routes (same as before)  ------------------- */
app.get("/api/ipos/ongoing", async (req, res) => {
  try {
    const data = await fetchWithCache("ongoing", SOURCES.ongoing);
    const ipos = data.response;
    await checkForNewIpos(ipos, "ongoing");
    res.json({ success: true, type: "ongoing", data: ipos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/ipos/upcoming", async (req, res) => {
  try {
    const data = await fetchWithCache("upcoming", SOURCES.upcoming);
    const ipos = data.response;
    await checkForNewIpos(ipos, "upcoming");
    res.json({ success: true, type: "upcoming", data: ipos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/tickers", async (req, res) => {
  try {
    const data = await fetchWithCache("tickers", SOURCES.tickers);
    res.json({ success: true, type: "tickers", data: data.response ?? data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/news", async (req, res) => {
  try {
    const data = await fetchWithCache("news", SOURCES.news);
    res.json({ success: true, type: "news", data: data.data.news });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/indices", async (req, res) => {
  try {
    const data = await fetchWithCache("indices", SOURCES.indices);
    res.json({ success: true, type: "indices", data: data.response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/indices/:timeRange", async (req, res) => {
  try {
    const { timeRange } = req.params;
    const validRanges = ["1d", "1m", "3m", "1y", "5y", "all"];
    if (!validRanges.includes(timeRange)) {
      return res.status(400).json({
        success: false,
        error: "Invalid time range. Use one of: 1d, 1m, 3m, 1y, 5y, all",
      });
    }
    const url = `${INDICES_BASE_URL}/${timeRange}`;
    const data = await fetchWithCache(`indices_${timeRange}`, url);
    res.json({ success: true, type: "indices", timeRange, data: data.response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/sector-performance", async (req, res) => {
  try {
    const data = await fetchWithCache("sectorPerformance", SOURCES.sectorPerformance);
    res.json({ success: true, type: "sectorPerformance", data: data.response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/market-status", async (req, res) => {
  try {
    const data = await fetchWithCache("marketStatus", SOURCES.marketStatus);
    const marketStatus = data.response;
    await checkMarketStatusChange(marketStatus);
    res.json({ success: true, type: "marketStatus", data: marketStatus });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/ipos", async (req, res) => {
  try {
    const [ongoing, upcoming, tickers, indices] = await Promise.all([
      fetchWithCache("ongoing", SOURCES.ongoing),
      fetchWithCache("upcoming", SOURCES.upcoming),
      fetchWithCache("tickers", SOURCES.tickers),
      fetchWithCache("indices", SOURCES.indices),
    ]);
    await checkForNewIpos(ongoing.response, "ongoing");
    await checkForNewIpos(upcoming.response, "upcoming");
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

app.get("/api/all", async (req, res) => {
  try {
    const [ongoing, upcoming, tickers, indices, sectorPerformance, marketStatus] =
      await Promise.all([
        fetchWithCache("ongoing", SOURCES.ongoing),
        fetchWithCache("upcoming", SOURCES.upcoming),
        fetchWithCache("tickers", SOURCES.tickers),
        fetchWithCache("indices", SOURCES.indices),
        fetchWithCache("sectorPerformance", SOURCES.sectorPerformance),
        fetchWithCache("marketStatus", SOURCES.marketStatus),
      ]);
    await checkForNewIpos(ongoing.response, "ongoing");
    await checkForNewIpos(upcoming.response, "upcoming");
    await checkMarketStatusChange(marketStatus.response);
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

/* -------------------  Start Server  ------------------- */
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log("📱 Push notification server ready");
});
