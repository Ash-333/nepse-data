import cron from 'node-cron';
import { Expo } from 'expo-server-sdk';
import { PriceAlert, User, PushToken } from '../models/index.js';
import { fetchWithCache } from '../utils/cache.js';
import { SOURCES, getCurrentTimeInNepal } from '../config/constants.js';

const expo = new Expo();

// Store previous states for change detection
const previousStates = {
  marketStatus: null,
  ongoingIpos: [],
  upcomingIpos: [],
};

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
  const nepalTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
  const hours = nepalTime.getHours();
  const minutes = nepalTime.getMinutes();
  
  // Market opens at 9:15 AM and closes at 3:30 PM
  const marketStart = 9 * 60 + 15; // 9:15 AM in minutes
  const marketEnd = 15 * 60 + 30;  // 3:30 PM in minutes
  const currentTime = hours * 60 + minutes;
  
  return currentTime >= marketStart && currentTime <= marketEnd;
}

export async function sendPushNotification(pushTokens, title, body, data = {}) {
  if (!Array.isArray(pushTokens) || pushTokens.length === 0) {
    console.log("No push tokens to send to");
    return;
  }

  const validTokens = pushTokens.filter(token => Expo.isExpoPushToken(token));
  if (validTokens.length === 0) {
    console.log("No valid push tokens");
    return;
  }

  const messages = validTokens.map(pushToken => ({
    to: pushToken,
    sound: 'default',
    title,
    body,
    data,
  }));

  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      console.error('Error sending push notification chunk:', error);
    }
  }

  console.log(`📱 Sent ${tickets.length} notifications: ${title}`);
  return tickets;
}

async function checkPriceAlerts() {
  // Only check price alerts during business days and market hours
  if (!isBusinessDay() || !isMarketHours()) {
    const now = new Date();
    const nepalTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = dayNames[nepalTime.getDay()];
    const currentTime = nepalTime.toLocaleTimeString();
    
    if (!isBusinessDay()) {
      console.log(`⏭️ Skipping price alerts - ${currentDay} is not a business day`);
    } else if (!isMarketHours()) {
      console.log(`⏭️ Skipping price alerts - ${currentTime} is outside market hours (9:15 AM - 3:30 PM)`);
    }
    return;
  }

  try {
    const now = getCurrentTimeInNepal();
    console.log(`🔍 [${now.toISOString()}] Checking price alerts...`);

    // Get current stock data
    const stockData = await fetchWithCache("tickers", SOURCES.tickers);
    if (!stockData || !Array.isArray(stockData)) {
      console.log("❌ No stock data available for price alert checking");
      return;
    }

    // Get all active alerts
    const alerts = await PriceAlert.find({ triggered: false }).populate('userId');
    console.log(`📊 Found ${alerts.length} active price alerts`);

    const triggeredAlerts = [];

    for (const alert of alerts) {
      const stock = stockData.find(s => s.ticker === alert.ticker);
      if (!stock) continue;

      const currentPrice = stock.ltp;
      let shouldTrigger = false;

      if (alert.condition === 'above' && currentPrice >= alert.targetPrice) {
        shouldTrigger = true;
      } else if (alert.condition === 'below' && currentPrice <= alert.targetPrice) {
        shouldTrigger = true;
      }

      if (shouldTrigger) {
        triggeredAlerts.push({ alert, currentPrice, stock });

        // Update alert status
        if (alert.type === 'one-time') {
          alert.triggered = true;
        }
        alert.lastTriggered = now;
        await alert.save();

        // Send notification to specific user
        if (alert.userId.pushTokens && alert.userId.pushTokens.length > 0) {
          const title = `🎯 Price Alert: ${alert.ticker}`;
          const body = `${alert.ticker} is now ${alert.condition} your target price of ${alert.targetPrice}. Current price: ${currentPrice}`;
          
          await sendPushNotification(
            alert.userId.pushTokens,
            title,
            body,
            {
              type: 'price_alert',
              ticker: alert.ticker,
              targetPrice: alert.targetPrice,
              currentPrice,
              condition: alert.condition,
            }
          );
        }
      }
    }

    if (triggeredAlerts.length > 0) {
      console.log(`🚨 Triggered ${triggeredAlerts.length} price alerts`);
    } else {
      console.log("✅ No price alerts triggered");
    }

  } catch (error) {
    console.error("❌ Error checking price alerts:", error);
  }
}

async function checkIpoUpdates() {
  try {
    const now = getCurrentTimeInNepal();
    console.log(`🔍 [${now.toISOString()}] Checking IPO updates...`);

    // Check ongoing IPOs
    const currentOngoingIpos = await fetchWithCache("ongoing-ipos", SOURCES.ongoing);
    const ongoingData = currentOngoingIpos?.ResponseData || [];

    if (ongoingData.length !== previousStates.ongoingIpos.length) {
      console.log(`📈 Ongoing IPOs changed: ${previousStates.ongoingIpos.length} → ${ongoingData.length}`);
      
      if (ongoingData.length > previousStates.ongoingIpos.length) {
        const newIpos = ongoingData.filter(ipo => 
          !previousStates.ongoingIpos.some(prevIpo => prevIpo.finid === ipo.finid)
        );

        for (const newIpo of newIpos) {
          // Send notification for new ongoing IPO
          const allTokens = await getAllPushTokens();
          await sendPushNotification(
            allTokens,
            "🆕 New IPO Alert",
            `${newIpo.company_name} IPO is now open for application!`,
            {
              type: 'new_ipo',
              company: newIpo.company_name,
              sector: newIpo.Sector,
              openDate: newIpo.open_date,
              closeDate: newIpo.close_date,
            }
          );
        }
      }
      
      previousStates.ongoingIpos = ongoingData;
    }

    // Check upcoming IPOs
    const currentUpcomingIpos = await fetchWithCache("upcoming-ipos", SOURCES.upcoming);
    const upcomingData = currentUpcomingIpos || [];

    if (upcomingData.length !== previousStates.upcomingIpos.length) {
      console.log(`📅 Upcoming IPOs changed: ${previousStates.upcomingIpos.length} → ${upcomingData.length}`);
      previousStates.upcomingIpos = upcomingData;
    }

  } catch (error) {
    console.error("❌ Error checking IPO updates:", error);
  }
}

async function getAllPushTokens() {
  try {
    // Get tokens from authenticated users
    const users = await User.find({ pushTokens: { $exists: true, $not: { $size: 0 } } });
    const userTokens = users.flatMap(user => user.pushTokens || []);
    
    // Get legacy public tokens
    const publicTokens = await PushToken.find({});
    const legacyTokens = publicTokens.map(token => token.token);

    // Combine and deduplicate
    const allTokens = [...new Set([...userTokens, ...legacyTokens])];
    return allTokens.filter(token => Expo.isExpoPushToken(token));
  } catch (error) {
    console.error("Error getting push tokens:", error);
    return [];
  }
}

// Initialize price alert monitoring
export function initializePriceAlertService() {
  console.log("🚀 Initializing price alert service...");
  
  // Check price alerts every 2 minutes
  cron.schedule('*/2 * * * *', checkPriceAlerts, {
    timezone: "Asia/Kathmandu"
  });

  // Check IPO updates every 10 minutes
  cron.schedule('*/10 * * * *', checkIpoUpdates, {
    timezone: "Asia/Kathmandu"
  });

  console.log("✅ Price alert service initialized");
  console.log("   - Price alerts: Every 2 minutes");
  console.log("   - IPO updates: Every 10 minutes");
}