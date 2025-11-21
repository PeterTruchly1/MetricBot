// stress-test.ts
import { UserModel } from './storage';

const TEST_USERS_COUNT = 100; // Try 100 concurrent writes

export async function runStressTest() {
    console.log(`🔥 STARTING STRESS TEST (${TEST_USERS_COUNT} operations)...`);

    const operations: Promise<unknown>[] = [];
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
        throw error; // nech route vie, že zlyhal
    } finally {
        // Clean up test data to avoid database pollution
        console.log("🧹 Cleaning up test data...");
        await UserModel.deleteMany({ discordId: { $regex: '^stress_user_' } });
        console.log("✨ Cleaned up.");
        // !!! NEDÁVAME mongoose.disconnect(), lebo by to zabilo bota
    }
}