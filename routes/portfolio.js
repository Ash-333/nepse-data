import express from 'express';
import { Portfolio } from '../models/index.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get user's portfolio
router.get("/", authenticateToken, async (req, res) => {
  try {
    const holdings = await Portfolio.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    res.json({
      success: true,
      data: holdings,
    });
  } catch (error) {
    console.error("Portfolio fetch error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Add portfolio holding
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { ticker, quantity, averagePrice, purchaseDate } = req.body;
    
    if (!ticker || !quantity || !averagePrice || !purchaseDate) {
      return res.status(400).json({ 
        success: false, 
        error: "All fields are required" 
      });
    }

    const holding = new Portfolio({
      userId: req.user.userId,
      ticker,
      quantity,
      averagePrice,
      purchaseDate: new Date(purchaseDate),
    });

    await holding.save();
    res.json({
      success: true,
      data: holding,
      message: "Portfolio holding added successfully",
    });
  } catch (error) {
    console.error("Add portfolio error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Update portfolio holding
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, averagePrice, purchaseDate } = req.body;

    const updateData = {};
    if (quantity !== undefined) updateData.quantity = quantity;
    if (averagePrice !== undefined) updateData.averagePrice = averagePrice;
    if (purchaseDate !== undefined) updateData.purchaseDate = new Date(purchaseDate);
    updateData.updatedAt = new Date();

    const holding = await Portfolio.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      updateData,
      { new: true }
    );

    if (!holding) {
      return res.status(404).json({ success: false, error: "Holding not found" });
    }

    res.json({
      success: true,
      data: holding,
      message: "Portfolio holding updated successfully",
    });
  } catch (error) {
    console.error("Update portfolio error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Delete portfolio holding
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const holding = await Portfolio.findOneAndDelete({ 
      _id: id, 
      userId: req.user.userId 
    });

    if (!holding) {
      return res.status(404).json({ success: false, error: "Holding not found" });
    }

    res.json({
      success: true,
      message: "Portfolio holding deleted successfully",
    });
  } catch (error) {
    console.error("Delete portfolio error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;