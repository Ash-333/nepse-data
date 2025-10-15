import express from "express";
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/database.js';
import { PORT } from './config/constants.js';
import { initializePriceAlertService } from './services/priceAlertService.js';
import { initializeDataFetchingService } from './services/dataFetchingService.js';
import { initializeMarketStatusService } from './services/marketStatusService.js';
import { setupSwagger } from './config/swagger.js';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config(); // Fallback to .env

// Import route modules
import authRoutes from './routes/auth.js';
import portfolioRoutes from './routes/portfolio.js';
import priceAlertRoutes from './routes/priceAlerts.js';
import publicDataRoutes from './routes/publicData.js';
import notificationRoutes from './routes/notifications.js';
import { sendHelloWorldNotification } from "./services/sendHelloWorldNotification.js";

// Set the timezone to Nepal (Asia/Kathmandu)
process.env.TZ = 'Asia/Kathmandu';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Setup Swagger documentation
setupSwagger(app);

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    message: "IPO Alert API Server",
    version: "2.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
    timezone: "Asia/Kathmandu"
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/price-alerts', priceAlertRoutes);
app.use('/api', publicDataRoutes);
app.use('/api', notificationRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /',
      'GET /api-docs (Swagger UI)',
      'GET /swagger.json (OpenAPI Spec)',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/auth/google',
      'GET /api/auth/profile',
      'GET /api/portfolio',
      'POST /api/portfolio',
      'PUT /api/portfolio/:id',
      'DELETE /api/portfolio/:id',
      'GET /api/price-alerts',
      'POST /api/price-alerts',
      'PUT /api/price-alerts/:id',
      'DELETE /api/price-alerts/:id',
      'GET /api/ipos/ongoing',
      'GET /api/ipos/upcoming',
      'GET /api/tickers',
      'GET /api/news',
      'GET /api/indices/:range',
      'GET /api/sector-performance',
      'GET /api/market-status',
      'POST /api/register-token',
      'POST /api/register-token-public',
      'POST /api/remove-token'
    ]
  });
});

// Initialize services
async function startServer() {
  try {
    // Connect to MongoDB
    await connectDB();
    
    // Initialize background services
    initializePriceAlertService();
    initializeDataFetchingService();
    initializeMarketStatusService();
    sendHelloWorldNotification();
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🕒 Timezone: ${process.env.TZ}`);
      console.log(`📊 Health check: http://localhost:${PORT}`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

startServer();