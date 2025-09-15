import express from "express";
import fetch from "node-fetch";
import { Expo } from "expo-server-sdk";
import mongoose from "mongoose";
import cron from 'node-cron';

// Set the timezone to Nepal (Asia/Kathmandu)
process.env.TZ = 'Asia/Kathmandu';

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

// Middleware
app.use(express.json());

/* -------------------  MongoDB Setup  ------------------- */
const MONGO_URI = "mongodb+srv://ipo_alert:apple@ipo-alert.qe46rim.mongodb.net/?retryWrites=true&w=majority&appName=ipo-alert";
mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Token schema
const tokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
});

// Cache schema
const cacheSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  timestamp: { type: Date, default: Date.now },
});

const PushToken = mongoose.model("PushToken", tokenSchema);
const Cache = mongoose.model("Cache", cacheSchema);

/* -------------------  Timezone Helper  ------------------- */
function getCurrentTimeInNepal() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
}

/* -------------------  Fetch with Cache  ------------------- */
async function fetchWithCache(key, url) {
  // Check if we have fresh data in the database
  const cachedData = await Cache.findOne({ key });
  const now = getCurrentTimeInNepal();
  
  if (cachedData && (now - cachedData.timestamp) < CACHE_TTL) {
    return cachedData.data;
  }
  
  // Fetch fresh data
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  const data = await res.json();
  
  // Update the database with fresh data
  await Cache.findOneAndUpdate(
    { key },
    { data, timestamp: now },
    { upsert: true }
  );
  
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
    res.status(500).json({ success: false, error: "Internal server error"+" "+error });
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

/* -------------------  Data Fetching Helpers  ------------------- */
// Helper function to fetch and store data without triggering change detection
async function fetchAndStoreData(key, url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
    const data = await res.json();
    const now = getCurrentTimeInNepal();
    await Cache.findOneAndUpdate(
      { key },
      { data, timestamp: now },
      { upsert: true }
    );
    return data;
  } catch (error) {
    console.error(`Error fetching data for ${key}:`, error);
    throw error;
  }
}

// Function to fetch IPO data (both ongoing and upcoming)
async function fetchIpoData() {
  try {
    console.log('🔄 Fetching IPO data...');
    const [ongoingData, upcomingData] = await Promise.all([
      fetch(SOURCES.ongoing),
      fetch(SOURCES.upcoming)
    ]);
    
    const ongoingIpos = (await ongoingData.json()).response;
    const upcomingIpos = (await upcomingData.json()).response;
    
    // Update database
    const now = getCurrentTimeInNepal();
    await Cache.findOneAndUpdate(
      { key: 'ongoing' },
      { data: { response: ongoingIpos }, timestamp: now },
      { upsert: true }
    );
    await Cache.findOneAndUpdate(
      { key: 'upcoming' },
      { data: { response: upcomingIpos }, timestamp: now },
      { upsert: true }
    );
    
    // Check for new IPOs
    await checkForNewIpos(ongoingIpos, 'ongoing');
    await checkForNewIpos(upcomingIpos, 'upcoming');
    
    console.log('✅ IPO data updated in DB');
  } catch (error) {
    console.error('❌ Error fetching IPO data:', error);
  }
}

// Function to fetch market status
async function fetchMarketStatus() {
  try {
    console.log('🔄 Fetching market status...');
    const res = await fetch(SOURCES.marketStatus);
    const data = await res.json();
    const marketStatus = data.response;
    
    // Update database
    const now = getCurrentTimeInNepal();
    await Cache.findOneAndUpdate(
      { key: 'marketStatus' },
      { data: { response: marketStatus }, timestamp: now },
      { upsert: true }
    );
    
    // Check for status changes
    await checkMarketStatusChange(marketStatus);
    
    console.log('✅ Market status updated in DB');
  } catch (error) {
    console.error('❌ Error fetching market status:', error);
  }
}

// Function to fetch all other data (every 5 minutes during market hours on business days)
async function fetchOtherData() {
  try {
    // Check if current time is within the allowed window (10:59 AM to 3:00 PM)
    const now = getCurrentTimeInNepal();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    
    // Convert to minutes since midnight for easier comparison
    const currentTimeInMinutes = hours * 60 + minutes;
    const startTimeInMinutes = 10 * 60 + 30; // 10:59 AM
    const endTimeInMinutes = 15 * 60; // 3:00 PM
    
    // Check if it's a business day (Sunday to Thursday) and within the allowed time window
    const isBusinessDay = dayOfWeek >= 0 && dayOfWeek <= 4; // Sunday (0) to Thursday (4)
    const isWithinTimeWindow = currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes < endTimeInMinutes;
    
    if (isBusinessDay && isWithinTimeWindow) {
      console.log('🔄 Fetching other data (tickers, news, indices, sector performance)...');
      
      const [tickersData, newsData, indicesData, sectorPerformanceData] = await Promise.all([
        fetch(SOURCES.tickers).then(res => res.json()),
        fetch(SOURCES.news).then(res => res.json()),
        fetch(SOURCES.indices).then(res => res.json()),
        fetch(SOURCES.sectorPerformance).then(res => res.json())
      ]);
      
      // Update database
      await Cache.findOneAndUpdate(
        { key: 'tickers' },
        { data: tickersData, timestamp: now },
        { upsert: true }
      );
      await Cache.findOneAndUpdate(
        { key: 'news' },
        { data: newsData, timestamp: now },
        { upsert: true }
      );
      await Cache.findOneAndUpdate(
        { key: 'indices' },
        { data: indicesData, timestamp: now },
        { upsert: true }
      );
      await Cache.findOneAndUpdate(
        { key: 'sectorPerformance' },
        { data: sectorPerformanceData, timestamp: now },
        { upsert: true }
      );
      
      console.log('✅ Other data updated in DB');
    } else {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      console.log(`⏭️ Skipping other data fetch - ${dayNames[dayOfWeek]} ${hours}:${minutes.toString().padStart(2, '0')} (outside business hours or time window)`);
    }
  } catch (error) {
    console.error('❌ Error fetching other data:', error);
  }
}

/* -------------------  Scheduled Tasks  ------------------- */
// IPO data at 10:00 AM and 8:00 PM (Nepal Time)
cron.schedule('0 10,20 * * *', fetchIpoData, {
  scheduled: true,
  timezone: "Asia/Kathmandu"
});

// Market status at 11:00 AM and 2:59:59 PM (Nepal Time)
cron.schedule('0 11 * * *', fetchMarketStatus, {
  scheduled: true,
  timezone: "Asia/Kathmandu"
});
cron.schedule('59 14 * * *', fetchMarketStatus, {
  scheduled: true,
  timezone: "Asia/Kathmandu"
});

// All other data every 5 minutes during market hours (10:59 AM to 3:00 PM) on business days (Sunday to Thursday)
cron.schedule('*/5 * * * *', fetchOtherData, {
  scheduled: true,
  timezone: "Asia/Kathmandu"
});

/* -------------------  Routes  ------------------- */
// All routes now use cached data from database
app.get("/api/ipos/ongoing", async (req, res) => {
  try {
    let cached = await Cache.findOne({ key: 'ongoing' });
    
    // If data not found in cache, fetch it
    if (!cached) {
      console.log('🔄 Ongoing IPOs not in cache, fetching now...');
      const data = await fetchAndStoreData('ongoing', SOURCES.ongoing);
      cached = { data };
    }
    
    res.json({ success: true, type: "ongoing", data: cached.data.response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/ipos/upcoming", async (req, res) => {
  try {
    let cached = await Cache.findOne({ key: 'upcoming' });
    
    // If data not found in cache, fetch it
    if (!cached) {
      console.log('🔄 Upcoming IPOs not in cache, fetching now...');
      const data = await fetchAndStoreData('upcoming', SOURCES.upcoming);
      cached = { data };
    }
    
    res.json({ success: true, type: "upcoming", data: cached.data.response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/tickers", async (req, res) => {
  try {
    let cached = await Cache.findOne({ key: 'tickers' });
    
    // If data not found in cache, fetch it
    if (!cached) {
      console.log('🔄 Tickers not in cache, fetching now...');
      const data = await fetchAndStoreData('tickers', SOURCES.tickers);
      cached = { data };
    }
    
    res.json({ success: true, type: "tickers", data: cached.data.response ?? cached.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/news", async (req, res) => {
  try {
    let cached = await Cache.findOne({ key: 'news' });
    
    // If data not found in cache, fetch it
    if (!cached) {
      console.log('🔄 News not in cache, fetching now...');
      const data = await fetchAndStoreData('news', SOURCES.news);
      cached = { data };
    }
    
    res.json({ success: true, type: "news", data: cached.data.data.news });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/indices", async (req, res) => {
  try {
    let cached = await Cache.findOne({ key: 'indices' });
    
    // If data not found in cache, fetch it
    if (!cached) {
      console.log('🔄 Indices not in cache, fetching now...');
      const data = await fetchAndStoreData('indices', SOURCES.indices);
      cached = { data };
    }
    
    res.json({ success: true, type: "indices", data: cached.data.response });
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
    const key = `indices_${timeRange}`;
    
    // Check if we have fresh data in the database
    let cached = await Cache.findOne({ key });
    const now = getCurrentTimeInNepal();
    
    if (!cached || (now - cached.timestamp) >= CACHE_TTL) {
      console.log(`🔄 Indices for ${timeRange} not in cache or expired, fetching now...`);
      // Fetch fresh data
      const fetchRes = await fetch(url);
      if (!fetchRes.ok) throw new Error(`Failed to fetch: ${fetchRes.status}`);
      const data = await fetchRes.json();
      
      // Update the database with fresh data
      await Cache.findOneAndUpdate(
        { key },
        { data, timestamp: now },
        { upsert: true }
      );
      
      cached = { data };
    }
    
    res.json({ success: true, type: "indices", timeRange, data: cached.data.response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/sector-performance", async (req, res) => {
  try {
    let cached = await Cache.findOne({ key: 'sectorPerformance' });
    
    // If data not found in cache, fetch it
    if (!cached) {
      console.log('🔄 Sector performance not in cache, fetching now...');
      const data = await fetchAndStoreData('sectorPerformance', SOURCES.sectorPerformance);
      cached = { data };
    }
    
    res.json({ success: true, type: "sectorPerformance", data: cached.data.response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/market-status", async (req, res) => {
  try {
    let cached = await Cache.findOne({ key: 'marketStatus' });
    
    // If data not found in cache, fetch it
    if (!cached) {
      console.log('🔄 Market status not in cache, fetching now...');
      const data = await fetchAndStoreData('marketStatus', SOURCES.marketStatus);
      cached = { data };
    }
    
    res.json({ success: true, type: "marketStatus", data: cached.data.response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/ipos", async (req, res) => {
  try {
    let ongoing = await Cache.findOne({ key: 'ongoing' });
    let upcoming = await Cache.findOne({ key: 'upcoming' });
    
    // If data not found in cache, fetch it
    if (!ongoing) {
      console.log('🔄 Ongoing IPOs not in cache, fetching now...');
      const data = await fetchAndStoreData('ongoing', SOURCES.ongoing);
      ongoing = { data };
    }
    
    if (!upcoming) {
      console.log('🔄 Upcoming IPOs not in cache, fetching now...');
      const data = await fetchAndStoreData('upcoming', SOURCES.upcoming);
      upcoming = { data };
    }
    
    res.json({
      success: true,
      ongoing: ongoing.data.response,
      upcoming: upcoming.data.response,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/all", async (req, res) => {
  try {
    let ongoing = await Cache.findOne({ key: 'ongoing' });
    let upcoming = await Cache.findOne({ key: 'upcoming' });
    let tickers = await Cache.findOne({ key: 'tickers' });
    let indices = await Cache.findOne({ key: 'indices' });
    let sectorPerformance = await Cache.findOne({ key: 'sectorPerformance' });
    let marketStatus = await Cache.findOne({ key: 'marketStatus' });
    
    // If any data not found in cache, fetch it
    const fetchPromises = [];
    
    if (!ongoing) {
      console.log('🔄 Ongoing IPOs not in cache, fetching now...');
      fetchPromises.push(
        fetchAndStoreData('ongoing', SOURCES.ongoing).then(data => {
          ongoing = { data };
        })
      );
    }
    
    if (!upcoming) {
      console.log('🔄 Upcoming IPOs not in cache, fetching now...');
      fetchPromises.push(
        fetchAndStoreData('upcoming', SOURCES.upcoming).then(data => {
          upcoming = { data };
        })
      );
    }
    
    if (!tickers) {
      console.log('🔄 Tickers not in cache, fetching now...');
      fetchPromises.push(
        fetchAndStoreData('tickers', SOURCES.tickers).then(data => {
          tickers = { data };
        })
      );
    }
    
    if (!indices) {
      console.log('🔄 Indices not in cache, fetching now...');
      fetchPromises.push(
        fetchAndStoreData('indices', SOURCES.indices).then(data => {
          indices = { data };
        })
      );
    }
    
    if (!sectorPerformance) {
      console.log('🔄 Sector performance not in cache, fetching now...');
      fetchPromises.push(
        fetchAndStoreData('sectorPerformance', SOURCES.sectorPerformance).then(data => {
          sectorPerformance = { data };
        })
      );
    }
    
    if (!marketStatus) {
      console.log('🔄 Market status not in cache, fetching now...');
      fetchPromises.push(
        fetchAndStoreData('marketStatus', SOURCES.marketStatus).then(data => {
          marketStatus = { data };
        })
      );
    }
    
    // Wait for all fetches to complete
    if (fetchPromises.length > 0) {
      await Promise.all(fetchPromises);
    }
    
    res.json({
      success: true,
      ongoing: ongoing.data.response,
      upcoming: upcoming.data.response,
      tickers: tickers.data.response ?? tickers.data,
      indices: indices.data.response,
      sectorPerformance: sectorPerformance.data.response,
      marketStatus: marketStatus.data.response,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/* -------------------  Initialize Data on Startup  ------------------- */
async function initializeData() {
  console.log('🚀 Initializing data on startup...');
  
  try {
    // Fetch IPO data
    await fetchIpoData();
    
    // Fetch market status
    await fetchMarketStatus();
    
    // Fetch other data
    await fetchOtherData();
    
    console.log('✅ All data initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing data:', error);
  }
}

/* -------------------  Start Server  ------------------- */
app.listen(PORT, async () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log("📱 Push notification server ready");
  console.log("🕐 Scheduled tasks initialized (Nepal Time - Asia/Kathmandu):");
  console.log("   - IPO data: 10:00 AM and 8:00 PM");
  console.log("   - Market status: 11:00 AM and 2:59:59 PM");
  console.log("   - Other data: Every 5 minutes (10:59 AM to 3:00 PM, Sunday to Thursday)");
  console.log("💾 Data caching enabled in MongoDB");
  console.log("🌍 Timezone set to Asia/Kathmandu (Nepal Time)");
  
  // Initialize data on startup
  await initializeData();
});
