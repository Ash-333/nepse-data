// services/tickerService.js
import { fetchWithCache } from '../utils/cache.js';

const TICKER_BASE_URL = "https://www.onlinekhabar.com/smtm/ticker-page";

// Helper function to remove duplicate ticker fields
const removeDuplicateTicker = (data) => {
  if (!data || !data.response) return data;
  
  const { ticker, ...rest } = data.response;
  return rest;
};

export const getTickerData = async (ticker) => {
  try {
    // Define all the API endpoints for the given ticker
    const apiEndpoints = [
      { key: `ticker-info-${ticker}`, url: `${TICKER_BASE_URL}/ticker-info/${ticker}` },
      { key: `market-range-${ticker}`, url: `${TICKER_BASE_URL}/market-range/${ticker}` },
      { key: `ticker-stats-${ticker}`, url: `${TICKER_BASE_URL}/ticker-stats/${ticker}` },
      { key: `ticker-quick-view-${ticker}`, url: `${TICKER_BASE_URL}/ticker-quick-view/${ticker}` },
      { key: `ticker-technical-indicator-${ticker}`, url: `${TICKER_BASE_URL}/ticker-technical-indicator/${ticker}` }
    ];

    // Use Promise.all to make all API calls in parallel with caching
    const responses = await Promise.all(
      apiEndpoints.map(endpoint => fetchWithCache(endpoint.key, endpoint.url))
    );

    // Check if all requests were successful
    const allResponsesAreOk = responses.every(response => response && response.response);

    if (!allResponsesAreOk) {
      throw new Error('Failed to fetch data from all APIs');
    }

    // Process and combine the data from all responses
    return {
      ticker: ticker,
      info: removeDuplicateTicker(responses[0]),
      marketRange: removeDuplicateTicker(responses[1]),
      stats: removeDuplicateTicker(responses[2]),
      quickView: removeDuplicateTicker(responses[3]),
      technicalIndicator: removeDuplicateTicker(responses[4])
    };
  } catch (error) {
    console.error(`Error fetching data for ticker ${ticker}:`, error);
    throw error;
  }
};