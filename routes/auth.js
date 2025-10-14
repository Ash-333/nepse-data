import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { User } from '../models/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { JWT_SECRET, GOOGLE_CLIENT_ID, SALT_ROUNDS } from '../config/constants.js';

const router = express.Router();
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Register user
router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    console.log(email, password, name);
    
    if (!email || !password || !name) {
      return res.status(400).json({ success: false, error: "All fields are required" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, error: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user
    const user = new User({
      email,
      password: hashedPassword,
      name,
    });

    await user.save();

    // Generate token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Login user
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required" });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, error: "Invalid credentials" });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: "Invalid credentials" });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        lastLogin: user.lastLogin,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Get user profile
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        profilePicture: user.profilePicture,
        authProvider: user.authProvider,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Profile error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Google OAuth login
router.post("/google", async (req, res) => {
  try {
    console.log('🔐 Google OAuth login attempt');
    console.log('📎 Request body:', req.body);
    
    const { idToken } = req.body;
    
    if (!idToken) {
      console.log('❌ Missing ID token');
      return res.status(400).json({ success: false, error: "ID token is required" });
    }

    console.log('🔍 Verifying Google ID token...');
    
    // Verify Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      console.log('❌ Invalid Google token payload');
      return res.status(400).json({ success: false, error: "Invalid Google token" });
    }

    const { sub: googleId, email, name, picture } = payload;
    console.log('✅ Google token verified for:', email);

    // Check if user exists
    let user = await User.findOne({ 
      $or: [
        { googleId },
        { email, authProvider: 'google' }
      ]
    });

    if (!user) {
      console.log('🆕 Creating new Google user:', email);
      // Create new user
      user = new User({
        email,
        name,
        googleId,
        profilePicture: picture,
        authProvider: 'google',
        lastLogin: new Date(),
      });
      await user.save();
    } else {
      console.log('🔄 Updating existing user:', email);
      // Update existing user
      user.lastLogin = new Date();
      if (picture) user.profilePicture = picture;
      if (!user.googleId) user.googleId = googleId;
      await user.save();
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    const responseData = {
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        profilePicture: user.profilePicture,
        authProvider: user.authProvider,
        lastLogin: user.lastLogin,
      },
    };
    
    console.log('✅ Google OAuth successful for:', email);
    res.json(responseData);
  } catch (error) {
    console.error("❌ Google OAuth error:", error);
    res.status(500).json({ success: false, error: "Google authentication failed" });
  }
});

export default router;