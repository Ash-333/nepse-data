import express from 'express';
import { fetchWithCache } from '../utils/cache.js';
import { SOURCES, INDICES_BASE_URL } from '../config/constants.js';
import { getTickerData } from '../services/tickerService.js'; // Import the service

const router = express.Router();

// Get stock ticker data
router.get("/stock/:ticker", async (req, res) => {
  try {
    const ticker = req.params.ticker;
    const data = await getTickerData(ticker); // Use the service
    
    // Send the restructured response
    res.status(200).json({
      success: true,
      type: "stock-data",
      data: data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      type: "error",
      data: {
        message: 'Failed to fetch stock data',
        details: error.message
      }
    });
  }
});

// Get ongoing IPOs
router.get("/ipos/ongoing", async (req, res) => {
  try {
    const data = await fetchWithCache("ongoing-ipos", SOURCES.ongoing);
    res.json({
      success: true,
      type: "ongoing",
      data: data.result.data || [],
    });
  } catch (error) {
    console.error("Error fetching ongoing IPOs:", error);
    res.status(500).json({ success: false, error: "Failed to fetch ongoing IPOs" });
  }
});

// Get upcoming IPOs
router.get("/ipos/upcoming", async (req, res) => {
  try {
    const data = await fetchWithCache("upcoming-ipos", SOURCES.upcoming);
    const ipoData = data && data.response ? data.response : [];
    res.json({
      success: true,
      type: "upcoming",
      data: ipoData,
    });
  } catch (error) {
    console.error("Error fetching upcoming IPOs:", error);
    res.status(500).json({ success: false, error: "Failed to fetch upcoming IPOs" });
  }
});

// Get stock tickers
router.get("/tickers", async (req, res) => {
  try {
    const data = await fetchWithCache("tickers", SOURCES.tickers);
    const tickersData = Array.isArray(data) ? data : (data && data.response ? data.response : []);
    res.json({
      success: true,
      type: "tickers",
      data: tickersData,
    });
  } catch (error) {
    console.error("Error fetching tickers:", error);
    res.status(500).json({ success: false, error: "Failed to fetch stock tickers" });
  }
});

// Get news
router.get("/news", async (req, res) => {
  try {
    const data = await fetchWithCache("news", SOURCES.news);
    const newsData = data && data.data && data.data.news ? data.data.news : [];
    res.json({
      success: true,
      type: "news",
      data: newsData,
    });
  } catch (error) {
    console.error("Error fetching news:", error);
    res.status(500).json({ success: false, error: "Failed to fetch news" });
  }
});

// Get market indices
router.get("/indices/:range", async (req, res) => {
  try {
    const { range } = req.params;
    const validRanges = ["1d", "1m", "3m", "1y", "5y", "all"];
    
    if (!validRanges.includes(range)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid range. Valid ranges: 1d, 1m, 3m, 1y, 5y, all" 
      });
    }

    const url = `${INDICES_BASE_URL}/${range}`;
    const data = await fetchWithCache(`indices-${range}`, url);
    
    let responseData = {};
    if (data && data.response) {
      if (data.response.chartData && Array.isArray(data.response.chartData)) {
        const chartData = data.response.chartData.map(item => ({
          value: parseFloat(item.value || 0),
          timestamp: item.timestamp,
          volume: parseFloat(item.volume || 0)
        }));
        
        responseData = {
          indices_name: "NEPSE",
          point_change: parseFloat(data.response.point_change || 0),
          percentage_change: parseFloat(data.response.percentage_change || 0),
          calculated_on: data.response.calculated_on || new Date().toISOString(),
          latest_price: parseFloat(data.response.latest_price || 0),
          chartData: chartData
        };
      } else {
        responseData = {
          indices_name: "NEPSE",
          point_change: parseFloat(data.response.point_change || 0),
          percentage_change: parseFloat(data.response.percentage_change || 0),
          calculated_on: data.response.calculated_on || new Date().toISOString(),
          latest_price: parseFloat(data.response.latest_price || 0),
          chartData: [{
            value: parseFloat(data.response.latest_price || 0),
            timestamp: data.response.calculated_on || new Date().toISOString(),
            volume: 0
          }]
        };
      }
    }
    
    res.json({
      success: true,
      type: "indices",
      timeRange: range,
      data: responseData,
    });
  } catch (error) {
    console.error("Error fetching indices:", error);
    res.status(500).json({ success: false, error: "Failed to fetch market indices" });
  }
});

// Get sector performance
router.get("/sector-performance", async (req, res) => {
  try {
    const data = await fetchWithCache("sector-performance", SOURCES.sectorPerformance);
    
    let sectorData = [];
    if (data && data.response && Array.isArray(data.response)) {
      sectorData = data.response.map(item => ({
        sector: item.indices || 'Unknown',
        change: item.points_change || 0,
        percentChange: item.percentage_change || 0,
        volume: item.turnover,
        marketCap: null
      }));
    }
    
    res.json({
      success: true,
      type: "sector-performance",
      data: sectorData,
    });
  } catch (error) {
    console.error("Error fetching sector performance:", error);
    res.status(500).json({ success: false, error: "Failed to fetch sector performance" });
  }
});

// Get market status
router.get("/market-status", async (req, res) => {
  try {
    const data = await fetchWithCache("market-status", SOURCES.marketStatus);
    res.json({
      success: true,
      type: "market-status",
      data: data.response || [],
    });
  } catch (error) {
    console.error("Error fetching market status:", error);
    res.status(500).json({ success: false, error: "Failed to fetch market status" });
  }
});

// Get trending stocks
router.get("/trending-stocks", async (req, res) => {
  try {
    const data = await fetchWithCache("trending-stocks", SOURCES.trendingStocks);
    res.json({
      success: true,
      type: "trending-stocks",
      data: data.response || [],
    });
  } catch (error) {
    console.error("Error fetching trending stocks:", error);
    res.status(500).json({ success: false, error: "Failed to fetch trending stocks" });
  }
});

export default router;