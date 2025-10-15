import cron from 'node-cron';
import { fetchWithCache } from '../utils/cache.js';
import { SOURCES, INDICES_BASE_URL, getCurrentTimeInNepal } from '../config/constants.js';

// Helper function to check if it's a business day (Sunday to Thursday in Nepal)
function isBusinessDay() {
  const now = new Date();
  const nepalTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
  const dayOfWeek = nepalTime.getDay(); // 0 = Sunday, 6 = Saturday
  return dayOfWeek >= 0 && dayOfWeek <= 4; // Sunday (0) to Thursday (4)
}

// Helper function to check if market is open (9:15 AM to 3:30 PM Nepal time)
function isMarketHours() {
  const now = new Date();
  const nepalTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Kathmandu" })
  );

  const hours = nepalTime.getHours();
  const minutes = nepalTime.getMinutes();

  // Market opens at 11:00 AM and closes at 3:00 PM
  const marketStart = 11 * 60;       // 11:00 AM in minutes
  const marketEnd = 15 * 60;         // 3:00 PM in minutes
  const currentTime = hours * 60 + minutes;

  return currentTime >= marketStart && currentTime <= marketEnd;
}


// Fetch IPO data (2 times a day)
async function fetchIpoData() {
  try {
    console.log('🔄 Fetching IPO data...');
    
    const [ongoingData, upcomingData] = await Promise.all([
      fetchWithCache('ongoing-ipos', SOURCES.ongoing),
      fetchWithCache('upcoming-ipos', SOURCES.upcoming)
    ]);
    
    console.log('✅ IPO data fetched and cached');
    return { ongoingData, upcomingData };
  } catch (error) {
    console.error('❌ Error fetching IPO data:', error);
  }
}

// Fetch market data (for general market information)
async function fetchMarketData() {
  try {
    console.log('🔄 Fetching market data...');
    
    const [tickersData, newsData, indicesData, sectorData, marketStatusData] = await Promise.all([
      fetchWithCache('tickers', SOURCES.tickers),
      fetchWithCache('news', SOURCES.news),
      fetchWithCache('indices-1d', `${INDICES_BASE_URL}/1d`),
      fetchWithCache('sector-performance', SOURCES.sectorPerformance),
      fetchWithCache('market-status', SOURCES.marketStatus)
    ]);
    
    console.log('✅ Market data fetched and cached');
    return { tickersData, newsData, indicesData, sectorData, marketStatusData };
  } catch (error) {
    console.error('❌ Error fetching market data:', error);
  }
}

// Initialize data fetching service with proper scheduling
export function initializeDataFetchingService() {
  console.log("🚀 Initializing data fetching service...");
  
  // IPO data: 2 times a day (10:00 AM and 8:00 PM Nepal Time)
  cron.schedule('0 10,20 * * *', () => {
    console.log('📋 Scheduled IPO data fetch triggered');
    fetchIpoData();
  }, {
    timezone: "Asia/Kathmandu"
  });

  // Price alerts: Only on business days (Sunday-Thursday) during market hours
  // Check every 2 minutes during market hours
  cron.schedule('*/2 * * * *', () => {
    if (isBusinessDay() && isMarketHours()) {
      console.log('💰 Scheduled price alert check triggered');
      // This will be handled by the existing price alert service
    } else {
      // Optional: log that we're skipping due to non-business day/hours
      const now = new Date();
      const nepalTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const currentDay = dayNames[nepalTime.getDay()];
      const currentTime = nepalTime.toLocaleTimeString();
      
      if (!isBusinessDay()) {
        console.log(`⏭️ Skipping price alerts - ${currentDay} is not a business day`);
      } else if (!isMarketHours()) {
        console.log(`⏭️ Skipping price alerts - ${currentTime} is outside market hours (11:00 AM - 3:00 PM)`);
      }
    }
  }, {
    timezone: "Asia/Kathmandu"
  });

  // Market data: During business hours only, every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    if (isBusinessDay() && isMarketHours()) {
      console.log('📊 Scheduled market data fetch triggered');
      fetchMarketData();
    }
  }, {
    timezone: "Asia/Kathmandu"
  });

  // News data: 3 times a day (morning, afternoon, evening)
  cron.schedule('0 8,14,20 * * *', () => {
    console.log('📰 Scheduled news fetch triggered');
    fetchWithCache('news', SOURCES.news);
  }, {
    timezone: "Asia/Kathmandu"
  });

  console.log("✅ Data fetching service initialized");
  console.log("   📋 IPO data: 2 times daily (10:00 AM, 8:00 PM)");
  console.log("   💰 Price alerts: Every 2 minutes (business days, market hours only)");
  console.log("   📊 Market data: Every 5 minutes (business days, market hours only)");
  console.log("   📰 News data: 3 times daily (8:00 AM, 2:00 PM, 8:00 PM)");
  console.log("   🗓️ Business days: Sunday to Thursday (Nepal week)");
  console.log("   🕐 Market hours: 9:15 AM to 3:30 PM (Nepal Time)");
}