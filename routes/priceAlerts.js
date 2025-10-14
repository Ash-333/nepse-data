import express from 'express';
import { PriceAlert } from '../models/index.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get user's price alerts
router.get("/", authenticateToken, async (req, res) => {
  try {
    const alerts = await PriceAlert.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    res.json({
      success: true,
      data: alerts,
    });
  } catch (error) {
    console.error("Price alerts fetch error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Add price alert
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { ticker, targetPrice, condition, type } = req.body;
    
    if (!ticker || !targetPrice || !condition) {
      return res.status(400).json({ 
        success: false, 
        error: "Ticker, target price, and condition are required" 
      });
    }

    const alert = new PriceAlert({
      userId: req.user.userId,
      ticker,
      targetPrice,
      condition,
      type: type || 'one-time',
    });

    await alert.save();
    res.json({
      success: true,
      data: alert,
      message: "Price alert created successfully",
    });
  } catch (error) {
    console.error("Add price alert error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Update price alert
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { targetPrice, condition, type, triggered } = req.body;

    const updateData = {};
    if (targetPrice !== undefined) updateData.targetPrice = targetPrice;
    if (condition !== undefined) updateData.condition = condition;
    if (type !== undefined) updateData.type = type;
    if (triggered !== undefined) {
      updateData.triggered = triggered;
      if (triggered) updateData.lastTriggered = new Date();
    }

    const alert = await PriceAlert.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      updateData,
      { new: true }
    );

    if (!alert) {
      return res.status(404).json({ success: false, error: "Price alert not found" });
    }

    res.json({
      success: true,
      data: alert,
      message: "Price alert updated successfully",
    });
  } catch (error) {
    console.error("Update price alert error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Delete price alert
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const alert = await PriceAlert.findOneAndDelete({ 
      _id: id, 
      userId: req.user.userId 
    });

    if (!alert) {
      return res.status(404).json({ success: false, error: "Price alert not found" });
    }

    res.json({
      success: true,
      message: "Price alert deleted successfully",
    });
  } catch (error) {
    console.error("Delete price alert error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;