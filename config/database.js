import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://ipo_alert:apple@ipo-alert.qe46rim.mongodb.net/?retryWrites=true&w=majority&appName=ipo-alert";

export const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI, { 
      useNewUrlParser: true, 
      useUnifiedTopology: true 
    });
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  }
};

export default mongoose;