import * as dotenv from 'dotenv';
import { connectDB, UserModel } from './storage';
import mongoose from 'mongoose';

dotenv.config();

const TEST_USERS_COUNT = 100; // Skúsime 100 zápisov naraz

async function runStressTest() {
    console.log(`🔥 ZAČÍNAM STRESS TEST (${TEST_USERS_COUNT} operácií)...`);
    
    // 1. Pripojenie
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("Chýba MONGO_URI");
    await connectDB(uri);

    console.log("✅ DB Pripojená. Pripravujem data...");

    // Pripravíme pole "sľubov" (operácií), ktoré spustíme naraz
    const operations = [];
    const startTime = Date.now();

    for (let i = 0; i < TEST_USERS_COUNT; i++) {
        const fakeUserId = `stress_user_${i}`;
        const fakeDuration = Math.floor(Math.random() * 100);

        // Simulujeme operáciu, ktorú robí bot pri odpojení
        const op = UserModel.findOneAndUpdate(
            { discordId: fakeUserId },
            { $inc: { totalSeconds: fakeDuration } },
            { upsert: true, new: true }
        );
        operations.push(op);
    }

    console.log("🚀 ODPALUJEM OPERÁCIE...");
    
    // Spustíme všetky naraz a čakáme
    try {
        await Promise.all(operations);
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        console.log(`\n🎉 HOTOVO!`);
        console.log(`-----------------------------------------------`);
        console.log(`📊 Počet spracovaných userov: ${TEST_USERS_COUNT}`);
        console.log(`⏱️ Celkový čas: ${duration.toFixed(2)} sekúnd`);
        console.log(`⚡ Rýchlosť: ${(TEST_USERS_COUNT / duration).toFixed(2)} zápisov za sekundu`);
        console.log(`-----------------------------------------------`);

        if (duration < 5) {
            console.log("✅ VÝSLEDOK: Tvoja databáza je vo výbornej kondícii!");
        } else {
            console.log("⚠️ VÝSLEDOK: Databáza sa trochu potí, ale žije.");
        }

    } catch (error) {
        console.error("❌ TEST ZLYHAL (Databáza nestíhala):", error);
    } finally {
        console.log("🧹 Upratujem testovacie dáta...");
        await UserModel.deleteMany({ discordId: { $regex: 'stress_user_' } });
        console.log("✨ Upratané.");
        await mongoose.disconnect();
    }
}

runStressTest();