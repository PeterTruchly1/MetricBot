import { Client, GatewayIntentBits, Events } from 'discord.js';
import * as dotenv from 'dotenv';
import express from 'express';
import { connectDB } from './storage';
import { setupRoleChecking } from './roleManager';
import { setupVoiceTracking } from './voiceTracker';

dotenv.config();

// --- GLOBAL ERROR LOGGING ---------------------------------------

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

async function main() {
  // --- ENV CONFIG ------------------------------------------------
  const TOKEN = process.env.DISCORD_TOKEN;
  const MONGO_URI = process.env.MONGO_URI;
  const GUILD_ID = process.env.GUILD_ID;
  const ROLE_ID = process.env.ROLE_ID;
  const AFK_CHANNEL_ID = process.env.AFK_CHANNEL_ID;

  let REQUIRED_SECONDS = 20 * 3600;
  if (process.env.REQUIRED_SECONDS) {
  const parsed = Number(process.env.REQUIRED_SECONDS);
  if (!Number.isNaN(parsed)) {
    REQUIRED_SECONDS = parsed;
  } else {
    console.warn("⚠️ REQUIRED_SECONDS is NaN, using default 20h");
  }
}

  const ROLE_CHECK_INTERVAL_MINUTES = Number(
    process.env.ROLE_CHECK_INTERVAL_MINUTES ?? 60
  );

  if (!TOKEN) {
    console.error('❌ DISCORD_TOKEN is missing in env');
    process.exit(1);
  }

  if (!MONGO_URI) {
    console.error('❌ MONGO_URI is missing in env');
    process.exit(1);
  }

  // --- DISCORD CLIENT --------------------------------------------
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMembers,
    ],
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

  // --- MODULES ---------------------------------------------------
  setupVoiceTracking(client, AFK_CHANNEL_ID ?? null);

  // --- READY EVENT -----------------------------------------------
  client.once(Events.ClientReady, async () => {
    console.log(`✅ Logged in as ${client.user?.tag}`);

    try {
      await connectDB(MONGO_URI);
      console.log('✅ Connected to MongoDB');
    } catch (err) {
      console.error('❌ Failed to connect to MongoDB', err);
      process.exit(1);
    }

    if (GUILD_ID && ROLE_ID) {
      setupRoleChecking(client, {
        guildId: GUILD_ID,
        roleId: ROLE_ID,
        requiredSeconds: REQUIRED_SECONDS,
        intervalMs: ROLE_CHECK_INTERVAL_MINUTES * 60 * 1000,
      });
    } else {
      console.warn(
        '⚠️ GUILD_ID or ROLE_ID is missing – role manager will not start.'
      );
    }
  });

  // --- EXPRESS KEEP-ALIVE SERVER --------------------------------
  const app = express();
  const PORT = Number(process.env.PORT ?? 10000);

  app.get('/', (_req, res) => {
    res.send('MetricBot is running');
  });

  app.listen(PORT, () => {
    console.log(`🌐 HTTP server listening on port ${PORT}`);
  });

  // --- LOGIN -----------------------------------------------------
  await client.login(TOKEN);
}

main().catch((err) => {
  console.error('🚨 Fatal startup error in main():', err);
  process.exit(1);
});