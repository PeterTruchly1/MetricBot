import { Client, VoiceState } from 'discord.js';
import { UserModel } from './storage';

/**
 * Trackovanie aktivity vo voice kanáloch.
 * Drží si aktívne session v pamäti a pri odchode/move zapisuje do DB.
 */
export function setupVoiceTracking(client: Client, afkChannelId: string | null) {
    // Lokálny cache: userId -> timestamp (ms)
    const activeSessions = new Map<string, number>();

    const isActiveChannel = (channelId: string | null): boolean => {
        if (!channelId) return false;
        if (afkChannelId && channelId === afkChannelId) return false;
        return true;
    };

    // Po štarte bota obnovíme session pre ľudí, ktorí už sú vo voice
    client.on('ready', () => {
        console.log('♻️ Restoring active voice sessions after startup...');

        client.guilds.cache.forEach(guild => {
            guild.channels.cache.forEach((channel: any) => {
                if (!channel.isVoiceBased || !channel.isVoiceBased()) return;

                for (const [memberId, member] of channel.members) {
                    if (!member.user.bot && isActiveChannel(channel.id)) {
                        if (!activeSessions.has(memberId)) {
                            activeSessions.set(memberId, Date.now());
                            console.log(`   ↪ Restored session for ${member.user.tag}`);
                        }
                    }
                }
            });
        });
    });

    client.on('voiceStateUpdate', async (oldState: VoiceState, newState: VoiceState) => {
        const member = newState.member || oldState.member;
        if (!member || member.user.bot) return;

        const userId = member.id;
        const now = Date.now();

        const wasActive = isActiveChannel(oldState.channelId);
        const nowActive = isActiveChannel(newState.channelId);

        // USER JOINED active voice (z ničoho / z AFK / z textu)
        if (!wasActive && nowActive) {
            activeSessions.set(userId, now);
            console.log(`🎙️ [START] ${member.user.tag} started tracking time.`);
            return;
        }

        // USER LEFT active voice (odišiel úplne alebo išiel do AFK)
        if (wasActive && !nowActive) {
            await endSessionAndSave(userId, now, member.user.tag);
            return;
        }

        // USER MOVED medzi aktívnymi voice kanálmi
        if (wasActive && nowActive && oldState.channelId !== newState.channelId) {
            await endSessionAndSave(userId, now, member.user.tag, '[MOVE]');
            // nový začiatok session v novom kanáli
            activeSessions.set(userId, now);
            return;
        }
    });

    async function endSessionAndSave(
        userId: string,
        now: number,
        tag: string,
        prefix: string = '[STOP]'
    ) {
        const startTimestamp = activeSessions.get(userId);
        if (!startTimestamp) return;

        activeSessions.delete(userId);

        const durationSeconds = Math.floor((now - startTimestamp) / 1000);
        if (durationSeconds <= 0) return;

        try {
            await UserModel.findOneAndUpdate(
                { discordId: userId },
                { $inc: { totalSeconds: durationSeconds } },
                { upsert: true }
            );
            console.log(`🛑 ${prefix} ${tag}: +${durationSeconds}s saved.`);
        } catch (error) {
            console.error("❌ Error saving to DB:", error);
        }
    }
}
