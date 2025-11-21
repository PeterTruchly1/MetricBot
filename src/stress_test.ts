import * as dotenv from 'dotenv';
import { connectDB, UserModel } from './storage';
import mongoose from 'mongoose';

dotenv.config();

const TEST_USERS_COUNT = 100; // Try 100 concurrent writes

async function runStressTest() {
    console.log(`🔥 STARTING STRESS TEST (${TEST_USERS_COUNT} operations)...`);
    
    // 1. Connect
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("Missing MONGO_URI in .env file");
    await connectDB(uri);

    console.log("✅ DB Connected. Preparing data...");

    // Prepare array of "promises" (operations) to run concurrently
    const operations = [];
    const startTime = Date.now();

    for (let i = 0; i < TEST_USERS_COUNT; i++) {
        const fakeUserId = `stress_user_${i}`;
        const fakeDuration = Math.floor(Math.random() * 100);

        // Simulate the operation the bot does on disconnect (update or insert)
        const op = UserModel.findOneAndUpdate(
            { discordId: fakeUserId },
            { $inc: { totalSeconds: fakeDuration } },
            { upsert: true, new: true }
        );
        operations.push(op);
    }

    console.log("🚀 LAUNCHING OPERATIONS...");
    
    // Run all at once and wait for completion
    try {
        await Promise.all(operations);
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        console.log(`\n🎉 DONE!`);
        console.log(`-----------------------------------------------`);
        console.log(`📊 Processed users count: ${TEST_USERS_COUNT}`);
        console.log(`⏱️ Total time: ${duration.toFixed(2)} seconds`);
        console.log(`⚡ Speed: ${(TEST_USERS_COUNT / duration).toFixed(2)} writes per second`);
        console.log(`-----------------------------------------------`);

        if (duration < 5) {
            console.log("✅ RESULT: Your database is in excellent condition!");
        } else {
            console.log("⚠️ RESULT: Database is sweating a bit, but alive.");
        }

    } catch (error) {
        console.error("❌ TEST FAILED (Database couldn't keep up):", error);
    } finally {
        // Clean up test data to avoid database pollution
        console.log("🧹 Cleaning up test data...");
        await UserModel.deleteMany({ discordId: { $regex: 'stress_user_' } });
        console.log("✨ Cleaned up.");
        await mongoose.disconnect();
    }
}

runStressTest();