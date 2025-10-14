import express from 'express';
import { Expo } from 'expo-server-sdk';
import { PushToken, User } from '../models/index.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const expo = new Expo();

// Register push token (authenticated)
router.post("/register-token", authenticateToken, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, error: "Token is required" });
  if (!Expo.isExpoPushToken(token)) {
    return res.status(400).json({ success: false, error: "Invalid Expo push token" });
  }
  try {
    // Add token to user's pushTokens array
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    if (!user.pushTokens.includes(token)) {
      user.pushTokens.push(token);
      await user.save();
      console.log(`✅ New token saved for user ${user.email}: ${token}`);
    } else {
      console.log(`ℹ️ Token already exists for user ${user.email}: ${token}`);
    }

    // Also maintain the old token system for global notifications
    const existing = await PushToken.findOne({ token });
    if (!existing) {
      await PushToken.create({ token });
    }

    res.json({ success: true, message: "Token registered successfully" });
  } catch (error) {
    console.error("Error saving token:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Register push token (public - for backward compatibility)
router.post("/register-token-public", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, error: "Token is required" });
  if (!Expo.isExpoPushToken(token)) {
    return res.status(400).json({ success: false, error: "Invalid Expo push token" });
  }
  try {
    const existing = await PushToken.findOne({ token });
    if (!existing) {
      await PushToken.create({ token });
      console.log(`✅ New public token saved: ${token}`);
    } else {
      console.log(`ℹ️ Public token already exists: ${token}`);
    }
    res.json({ success: true, message: "Token registered successfully" });
  } catch (error) {
    console.error("Error saving public token:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Remove push token
router.post("/remove-token", async (req, res) => {
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

export default router;