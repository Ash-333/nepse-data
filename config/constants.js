export const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key-change-this-in-production";
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "523295087529-9soh2paockprm9h1ulcaaefd8lhi1299.apps.googleusercontent.com";
export const SALT_ROUNDS = 10;
export const PORT = process.env.PORT || 8000;

// Cache TTL (5 minutes in milliseconds)
export const CACHE_TTL = 5 * 60 * 1000;

// API Sources
export const SOURCES = {
  ongoing: "https://www.nepalipaisa.com/api/GetIpos?stockSymbol=&pageNo=1&itemsPerPage=10&pagePerDisplay=5",
  upcoming: "https://www.onlinekhabar.com/smtm/home/ipo-corner-upcoming",
  tickers: "https://www.onlinekhabar.com/smtm/stock_live/live-trading",
  news: "https://www.onlinekhabar.com/wp-json/okapi/v1/category-posts?category=share-market",
  indices: "https://www.onlinekhabar.com/smtm/home/indices-data/nepse/1d",
  sectorPerformance: "https://www.onlinekhabar.com/smtm/stock_live/sector-performance",
  marketStatus: "https://www.onlinekhabar.com/smtm/home/market-status",
  trendingStocks: "https://www.onlinekhabar.com/smtm/home/trending",
};

export const INDICES_BASE_URL = "https://www.onlinekhabar.com/smtm/home/indices-data/nepse";

// Timezone helper
export function getCurrentTimeInNepal() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
}