import { Client, GatewayIntentBits, GuildMember } from 'discord.js';
import * as dotenv from 'dotenv';
import { connectDB, UserModel } from './storage';
import express from 'express';

dotenv.config();

// --- CONFIGURATION ---
const TOKEN = process.env.DISCORD_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const GUILD_ID = process.env.GUILD_ID;
const ROLE_ID = process.env.ROLE_ID;
const AFK_CHANNEL_ID = process.env.AFK_CHANNEL_ID;
const REQUIRED_SECONDS = 20 * 3600; // 20 hours in seconds

// --- CLIENT INITIALIZATION ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ]
});

// --- WEB SERVER (PRE RENDER KEEP-ALIVE) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🤖 MetricBot is running and tracking activity!');
});

app.listen(PORT, () => {
    console.log(`🌍 Web server is listening on port ${PORT}`);
});

// Local cache for active sessions
// Key: UserID, Value: Timestamp
const activeSessions = new Map<string, number>();

// --- EVENT: BOT START ---
client.once('ready', async () => {
    console.log(`🤖 Bot ${client.user?.tag} is waking up...`);
    
    // Connect to DB
    if (MONGO_URI) {
        await connectDB(MONGO_URI);
    } else {
        console.error("❌ ERROR: Missing MONGO_URI in .env file!");
    }

    console.log("✅ Bot is online and ready!");
    
    // Run weekly check every hour
    setInterval(checkWeeklyActivity, 3600 * 1000);
});

// --- EVENT: VOICE STATE UPDATE ---
client.on('voiceStateUpdate', async (oldState, newState) => {
    const member = newState.member;
    if (!member || member.user.bot) return;

    const userId = member.id;
    const now = Date.now();
    const isAfk = (channelId: string | null) => channelId === AFK_CHANNEL_ID;

    // 1. USER JOINED (or returned from AFK)
    const wasActive = oldState.channelId && !isAfk(oldState.channelId);
    const isActive = newState.channelId && !isAfk(newState.channelId);

    if (!wasActive && isActive) {
        activeSessions.set(userId, now);
        console.log(`🎙️ [START] ${member.user.tag} started tracking time.`);
    }

    // 2. USER LEFT (or went to AFK)
    else if (wasActive && !isActive) {
        if (activeSessions.has(userId)) {
            const startTimestamp = activeSessions.get(userId)!;
            const durationSeconds = Math.floor((now - startTimestamp) / 1000);
            activeSessions.delete(userId);

            if (durationSeconds > 0) {
                try {
                    // Update DB
                    await UserModel.findOneAndUpdate(
                        { discordId: userId },
                        { $inc: { totalSeconds: durationSeconds } },
                        { upsert: true, new: true }
                    );
                    console.log(`🛑 [STOP] ${member.user.tag}: +${durationSeconds}s saved.`);
                } catch (err) {
                    console.error("❌ Error saving to DB:", err);
                }
            }
        }
    }
});

// --- FUNCTION: WEEKLY CHECK ---
async function checkWeeklyActivity() {
    console.log("🔄 Starting activity check...");
    
    if (!GUILD_ID || !ROLE_ID) {
        console.log("⚠️ Missing GUILD_ID or ROLE_ID in .env, skipping check.");
        return;
    }

    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return;

    const role = await guild.roles.fetch(ROLE_ID);
    if (!role) return console.error("❌ Role not found on server.");

    const allUsers = await UserModel.find({});

    for (const dbUser of allUsers) {
        try {
            if (!dbUser.discordId) continue;
            
            const member = await guild.members.fetch(dbUser.discordId).catch(() => null);
            if (!member) continue;

            // CHECK: Has enough hours?
            if (dbUser.totalSeconds >= REQUIRED_SECONDS) {
                if (!member.roles.cache.has(ROLE_ID)) {
                    await member.roles.add(role);
                    console.log(`✅ Role ADDED: ${member.user.tag} (${(dbUser.totalSeconds/3600).toFixed(1)}h)`);
                }
            } 
        } catch (e) {
            console.error("Error processing user:", e);
        }
    }
}

client.login(TOKEN);