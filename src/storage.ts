import mongoose from 'mongoose';

// 1. Schema
const userSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    totalSeconds: { type: Number, default: 0 },
    lastJoinTimestamp: { type: Number, default: null }
});

// 2. Model
export const UserModel = mongoose.model('VoiceUser', userSchema);

// 3. Connection Function
export const connectDB = async (uri: string) => {
    if (!uri) {
        console.error("❌ ERROR: Missing MONGO_URI in .env file!");
        return;
    }
    try {
        await mongoose.connect(uri);
        console.log("🍃 MongoDB connected successfully!");
    } catch (error) {
        console.error("❌ Error connecting to MongoDB:", error);
    }
};