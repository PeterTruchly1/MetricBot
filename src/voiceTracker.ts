import { Client, VoiceState } from 'discord.js';
import { UserModel } from './storage';

/**
 * Trackovanie aktivity vo voice kanáloch.
 * Drží si aktívne session v pamäti a pri odchode/move zapisuje do DB.
 */
export function setupVoiceTracking(
  client: Client,
  afkChannelId: string | null
) {
  // in-memory mapa aktuálnych session (join -> leave)
  const activeSessions = new Map<
    string,
    { channelId: string; joinedAt: number }
  >();

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
        // 1) USER LEAVES VOICE / ide do AFK
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
        // 2) USER JOINS VOICE / príde z AFK
        //
        const joinedFromNothing = !beforeChannelId && afterChannelId;
        const movedFromAfk = isOldAfk && afterChannelId && !isNewAfk;

        if ((joinedFromNothing || movedFromAfk) && afterChannelId && !isNewAfk) {
          activeSessions.set(sessionKey, {
            channelId: afterChannelId,
            joinedAt: Date.now(),
          });

          console.log(
            `🎙️ ${userName} started tracking time in channel ${afterChannelId}`
          );
        }
      } catch (err) {
        console.error('Error in voiceStateUpdate handler:', err);
      }
    }
  );
}