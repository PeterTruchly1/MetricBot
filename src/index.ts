import { Client, GatewayIntentBits } from 'discord.js';
import * as dotenv from 'dotenv';
import express from 'express';
import { connectDB } from './storage';
import { runStressTest } from './stressTest';
import { setupVoiceTracking } from './voiceTracker';
import { setupRoleChecking } from './roleManager';

dotenv.config();

// --- CONFIGURATION ---
const TOKEN = process.env.DISCORD_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const GUILD_ID = process.env.GUILD_ID;
const ROLE_ID = process.env.ROLE_ID;
const AFK_CHANNEL_ID = process.env.AFK_CHANNEL_ID || null;
const REQUIRED_SECONDS = 20 * 3600; // 20 hodín v sekundách
const STRESS_TOKEN = process.env.STRESS_TOKEN;

// --- CLIENT INITIALIZATION ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ]
});

// --- WEB SERVER (KEEP-ALIVE) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🤖 MetricBot is running 24/7 and tracking activity!');
});

// Lightweight endpoint for stress test
app.get('/stress-test', async (req, res) => {
    try {
        if (STRESS_TOKEN && req.query.token !== STRESS_TOKEN) {
            return res.status(403).send('❌ Forbidden');
        }

        console.log('🧪 Stress test endpoint called...');
        await runStressTest();
        res.send('✅ Stress test completed. Check logs for results.');
    } catch (error) {
        console.error('❌ Stress test error:', error);
        res.status(500).send('❌ Stress test failed. See server logs.');
    }
});

app.listen(PORT, () => {
    console.log(`🌍 Web server is listening on port ${PORT}`);
});

// --- BOT READY ---
client.once('ready', async () => {
    console.log(`🤖 Bot ${client.user?.tag} is waking up...`);

    if (!MONGO_URI) {
        console.error("❌ ERROR: Missing MONGO_URI in .env file!");
        return;
    }

    await connectDB(MONGO_URI);
    console.log("✅ DB connected.");
    console.log("✅ Bot is online and ready!");

    // Trackovanie hlasu (JOIN/LEAVE/MOVE + recovery po štarte)
    setupVoiceTracking(client, AFK_CHANNEL_ID);

    // Prideľovanie role podľa aktivity (beží každú hodinu)
    setupRoleChecking(client, {
        guildId: GUILD_ID || undefined,
        roleId: ROLE_ID || undefined,
        requiredSeconds: REQUIRED_SECONDS,
        intervalMs: 3600 * 1000
    });
});

// --- LOGIN ---
if (!TOKEN) {
    console.error("❌ ERROR: Missing DISCORD_TOKEN in .env file!");
} else {
    client.login(TOKEN);
}
