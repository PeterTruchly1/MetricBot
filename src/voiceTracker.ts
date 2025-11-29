import { Client, VoiceState, ChannelType, Events } from 'discord.js';
import { UserModel } from './storage';

/**
 * Trackovanie aktivity vo voice kanáloch.
 * Drží si aktívne session v pamäti a pri odchode/move zapisuje do DB.
 */
export function setupVoiceTracking(
  client: Client,
  afkChannelId: string | null
) {
  // in-memory map (join -> leave)
  const activeSessions = new Map<
    string,
    { channelId: string; joinedAt: number }
  >();

  client.once(Events.ClientReady, async () => {
    try {
      console.log('🔍 Scanning voice channels for active members after startup...');

      for (const [, guild] of client.guilds.cache) {
        for (const [, channel] of guild.channels.cache) {
          if (
            channel.type !== ChannelType.GuildVoice &&
            channel.type !== ChannelType.GuildStageVoice
          ) {
            continue;
          }

          if (afkChannelId && channel.id === afkChannelId) {
            continue; // AFK nepočítame
          }

          for (const [, member] of channel.members) {
            if (member.user.bot) continue;

            const sessionKey = member.id;

            if (!activeSessions.has(sessionKey)) {
              activeSessions.set(sessionKey, {
                channelId: channel.id,
                joinedAt: Date.now(), // od teraz sa ráta čas
              });

              console.log(
                `🎙️ ${member.user.tag} was already in "${channel.name}", starting tracking from now.`
              );
            }
          }
        }
      }

      console.log('✅ Initial voice scan after startup finished.');
    } catch (err) {
      console.error('Error during initial voice scan:', err);
    }
  });

  client.on(
    'voiceStateUpdate',
    async (oldState: VoiceState, newState: VoiceState) => {
      try {
        const userId = newState.id;

        // Jedno meno na logovanie pre oba smery (JOIN aj LEAVE)
        const userName =
          newState.member?.user.tag ??
          oldState.member?.user.tag ??
          userId;

        const beforeChannelId = oldState.channelId;
        const afterChannelId = newState.channelId;

        const isOldAfk =
          beforeChannelId &&
          afkChannelId &&
          beforeChannelId === afkChannelId;

        const isNewAfk =
          afterChannelId && afkChannelId && afterChannelId === afkChannelId;

        const sessionKey = userId;

        //
        // 1) USER LEAVES VOICE / GOING TO AFK
        //
        if (activeSessions.has(sessionKey) && (!afterChannelId || isNewAfk)) {
          const session = activeSessions.get(sessionKey)!;
          activeSessions.delete(sessionKey);

          const now = Date.now();
          const seconds = Math.floor((now - session.joinedAt) / 1000);

          if (seconds > 0) {
            const updatedUser = await UserModel.findOneAndUpdate(
              { discordId: userId },
              { $inc: { totalSeconds: seconds } },
              { upsert: true, new: true }
            );

            console.log(
              `🕒 Saved ${seconds}s for ${userName} (total=${updatedUser.totalSeconds}s)`
            );
          }
        }

        //
        // 2) USER JOINS VOICE / COMES FROM AFK
        //
        const joinedFromNothing = !beforeChannelId && afterChannelId;
        const movedFromAfk = isOldAfk && afterChannelId && !isNewAfk;

        if ((joinedFromNothing || movedFromAfk) && afterChannelId && !isNewAfk) {
          activeSessions.set(sessionKey, {
            channelId: afterChannelId,
            joinedAt: Date.now(),
          });

          const channel = newState.channel;
          const channelName = channel?.name ?? afterChannelId ?? 'Unknown channel';

          console.log(
            `🎙️ ${userName} started tracking time in channel "${channelName}"`
          );
        }
      } catch (err) {
        console.error('Error in voiceStateUpdate handler:', err);
      }
    }
  );
}