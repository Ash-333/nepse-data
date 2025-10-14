import mongoose from 'mongoose';

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

// User schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String }, // Optional for OAuth users
  name: { type: String, required: true },
  googleId: { type: String }, // For Google OAuth
  profilePicture: { type: String }, // For OAuth profile pictures
  authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
  pushTokens: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date },
});

// Portfolio schema
const portfolioSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ticker: { type: String, required: true },
  quantity: { type: Number, required: true },
  averagePrice: { type: Number, required: true },
  purchaseDate: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Price Alert schema
const priceAlertSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ticker: { type: String, required: true },
  targetPrice: { type: Number, required: true },
  condition: { type: String, enum: ['above', 'below'], required: true },
  type: { type: String, enum: ['one-time', 'recurring'], default: 'one-time' },
  triggered: { type: Boolean, default: false },
  lastTriggered: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

export const PushToken = mongoose.model("PushToken", tokenSchema);
export const Cache = mongoose.model("Cache", cacheSchema);
export const User = mongoose.model("User", userSchema);
export const Portfolio = mongoose.model("Portfolio", portfolioSchema);
export const PriceAlert = mongoose.model("PriceAlert", priceAlertSchema);