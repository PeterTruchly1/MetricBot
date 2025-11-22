import { Client, GatewayIntentBits } from 'discord.js';
import * as dotenv from 'dotenv';
import express from 'express';
import { connectDB } from './storage';
import { setupRoleChecking } from './roleManager';
import { setupVoiceTracking } from './voiceTracker';
import { runStressTest } from './stressTest';

dotenv.config();

// --- ENV CONFIG --------------------------------------------------

const TOKEN = process.env.DISCORD_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const GUILD_ID = process.env.GUILD_ID;
const ROLE_ID = process.env.ROLE_ID;
const AFK_CHANNEL_ID = process.env.AFK_CHANNEL_ID;
const STRESS_TOKEN = process.env.STRESS_TOKEN;

// koľko sekúnd musí mať user za „obdobie“ (default 20h)
const REQUIRED_SECONDS = Number(process.env.REQUIRED_SECONDS ?? 20 * 3600);

// ako často kontrolovať rolu v minútach (default 60)
const ROLE_CHECK_INTERVAL_MINUTES = Number(
  process.env.ROLE_CHECK_INTERVAL_MINUTES ?? 60
);

if (!TOKEN) {
  throw new Error('DISCORD_TOKEN is missing in .env');
}

if (!MONGO_URI) {
  throw new Error('MONGO_URI is missing in .env');
}

// --- DISCORD CLIENT ----------------------------------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

// --- GLOBAL ERROR LOGGING ----------------------------------------

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

client.on('error', (err) => {
  console.error('DISCORD CLIENT ERROR:', err);
});

client.on('shardError', (err, id) => {
  console.error(`DISCORD SHARD ERROR (shard ${id}):`, err);
});

client.on('shardDisconnect', (event, id) => {
  console.warn(`Shard ${id} disconnected`, event);
});

client.on('shardReconnecting', (id) => {
  console.warn(`Shard ${id} reconnecting...`);
});

// --- MODULES -----------------------------------------------------

// trackovanie času vo voice (AFK kanál je voliteľný)
setupVoiceTracking(client, AFK_CHANNEL_ID ?? null);

// --- READY EVENT -------------------------------------------------

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user?.tag}`);

  // DB
  try {
    await connectDB(MONGO_URI);
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB', err);
  }

  // Role manager (weekly activity / active user role)
  if (GUILD_ID && ROLE_ID) {
    setupRoleChecking(client, {
      guildId: GUILD_ID,
      roleId: ROLE_ID,
      requiredSeconds: REQUIRED_SECONDS,
      intervalMs: ROLE_CHECK_INTERVAL_MINUTES * 60 * 1000, // min -> ms
    });
  } else {
    console.warn(
      '⚠️ GUILD_ID or ROLE_ID is missing – role manager will not start.'
    );
  }
});

// --- EXPRESS KEEP-ALIVE + STRESS TEST ---------------------------

const app = express();
const PORT = Number(process.env.PORT ?? 10000);

app.get('/', (_req, res) => {
  res.send('MetricBot is running');
});

app.post('/stress-test', async (req, res) => {
  const token = req.query.token;

  if (!STRESS_TOKEN || token !== STRESS_TOKEN) {
    return res.status(403).send('Forbidden');
  }

  await runStressTest();
  res.send('OK');
});

app.listen(PORT, () => {
  console.log(`🌐 HTTP server listening on port ${PORT}`);
});

// --- LOGIN -------------------------------------------------------

client.login(TOKEN).catch((err) => {
  console.error('❌ Failed to login to Discord:', err);
});