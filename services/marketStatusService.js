import cron from 'node-cron';
import fetch from 'node-fetch'; // Added direct fetch import
import { SOURCES, getCurrentTimeInNepal } from '../config/constants.js';
import { sendPushNotification, getAllPushTokens } from './priceAlertService.js';

// Store previous states for change detection
const marketState = {
  lastMarketStatus: null,
  marketOpenedToday: false,
};

// Helper function to check if it's a business day (Sunday to Thursday in Nepal)
function isBusinessDay() {
  const now = new Date();
  const nepalTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
  const dayOfWeek = nepalTime.getDay(); // 0 = Sunday, 6 = Saturday
  return dayOfWeek >= 0 && dayOfWeek <= 4; // Sunday (0) to Thursday (4)
}

// Direct fetch function without caching
async function fetchDirectly(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  return res.json();
}

async function checkMarketStatusAndNotify() {
  try {
    // Only check on business days
    if (!isBusinessDay()) {
      const now = new Date();
      const nepalTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const currentDay = dayNames[nepalTime.getDay()];
      console.log(`⏭️ Skipping market status check - ${currentDay} is not a business day`);
      return;
    }

    const now = getCurrentTimeInNepal();
    console.log(`🔍 [${now.toISOString()}] Checking market status on business day...`);
    
    // Fetch current market status directly from API
    const marketStatusResponse = await fetchDirectly(SOURCES.marketStatus);
    
    if (!marketStatusResponse || !marketStatusResponse.response || !Array.isArray(marketStatusResponse.response)) {
      console.log("❌ Invalid market status response");
      return;
    }
    
    const currentMarketStatus = marketStatusResponse.response[0]?.market_live;
    
    if (currentMarketStatus === undefined) {
      console.log("❌ Market status not found in response");
      return;
    }
    
    console.log(`📊 Current market status: ${currentMarketStatus ? 'OPEN' : 'CLOSED'}`);
    
    // Check if market just opened (previous status was false/null, current is true)
    const marketJustOpened = (marketState.lastMarketStatus === false || marketState.lastMarketStatus === null) 
                             && currentMarketStatus === true;
    
    // Reset daily flag at start of each day
    if (!marketState.marketOpenedToday && currentMarketStatus === false) {
      marketState.marketOpenedToday = false;
    }
    
    // Send notification if market just opened and we haven't sent today's notification
    if (marketJustOpened && !marketState.marketOpenedToday) {
      console.log(`📈 Market just opened! Sending notification to all users...`);
      
      // Get all push tokens and send notification
      const allTokens = await getAllPushTokens();
      await sendPushNotification(
        allTokens,
        "📈 Market is Now Open!",
        "Nepal Stock Exchange is now live for trading!",
        {
          type: 'market_opened',
          timestamp: now.toISOString(),
          market_live: true,
          source: 'api_detection',
          day: now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kathmandu' })
        }
      );
      
      // Mark that we've sent the notification today
      marketState.marketOpenedToday = true;
      console.log(`✅ Market opened notification sent to ${allTokens.length} users`);
    } else if (currentMarketStatus === true && marketState.lastMarketStatus === true) {
      console.log("ℹ️ Market is open (no change)");
    } else if (currentMarketStatus === false) {
      console.log("ℹ️ Market is closed");
    } else if (marketState.marketOpenedToday) {
      console.log("ℹ️ Market opened notification already sent today");
    }
    
    // Update previous market status
    marketState.lastMarketStatus = currentMarketStatus;
    
  } catch (error) {
    console.error("❌ Error checking market status:", error);
  }
}

// Reset daily flag at midnight
function resetDailyFlag() {
  const now = getCurrentTimeInNepal();
  console.log(`🌙 [${now.toISOString()}] Resetting daily market notification flag`);
  marketState.marketOpenedToday = false;
}

// Initialize market status monitoring service
export function initializeMarketStatusService() {
  console.log("🚀 Initializing market status monitoring service...");
  
  // Check market status at 11:00 AM on business days only
  cron.schedule('0 11 * * 0-4', checkMarketStatusAndNotify, {
    timezone: "Asia/Kathmandu"
  });

  // Reset daily flag at midnight every day
  cron.schedule('0 0 * * *', resetDailyFlag, {
    timezone: "Asia/Kathmandu"
  });

  console.log("✅ Market status service initialized");
  console.log("   - Market status check: 11:00 AM on business days (Sunday-Thursday)");
  console.log("   - Daily flag reset: Midnight every day");
}