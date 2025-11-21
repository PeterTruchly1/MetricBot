import { Client } from 'discord.js';
import { UserModel } from './storage';

interface RoleCheckOptions {
    guildId?: string;
    roleId?: string;
    requiredSeconds: number;
    intervalMs?: number; // default: 1 hodina
}

/**
 * Nastaví periodické prideľovanie/odobranie role podľa aktivity.
 */
export function setupRoleChecking(client: Client, options: RoleCheckOptions) {
    const { guildId, roleId, requiredSeconds } = options;
    const intervalMs = options.intervalMs ?? 3600 * 1000;

    if (!guildId || !roleId) {
        console.warn('⚠️ GuildId alebo RoleId nie je nastavené, roleManager sa nespustí.');
        return;
    }

    console.log(`⏱️ RoleManager: checking every ${intervalMs / 1000 / 60} minutes...`);

    setInterval(() => {
        checkWeeklyActivity(client, { guildId, roleId, requiredSeconds })
            .catch(err => console.error('❌ Error in weekly activity check:', err));
    }, intervalMs);
}

async function checkWeeklyActivity(
    client: Client,
    { guildId, roleId, requiredSeconds }: { guildId: string; roleId: string; requiredSeconds: number }
) {
    console.log("🔄 Starting weekly activity check...");

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
        console.error("❌ Guild not found.");
        return;
    }

    const role = await guild.roles.fetch(roleId);
    if (!role) {
        console.error("❌ Role not found on server.");
        return;
    }

    const allUsers = await UserModel.find({});

    for (const dbUser of allUsers) {
        try {
            if (!dbUser.discordId) continue;

            const member = await guild.members.fetch(dbUser.discordId).catch(() => null);
            if (!member) continue;

            const hasRole = member.roles.cache.has(role.id);
            const isActive = dbUser.totalSeconds >= requiredSeconds;

            if (isActive && !hasRole) {
                await member.roles.add(role).catch(() => {});
                console.log(`✅ Role ADDED: ${member.user.tag} (${(dbUser.totalSeconds / 3600).toFixed(1)}h)`);
            } else if (!isActive && hasRole) {
                await member.roles.remove(role).catch(() => {});
                console.log(`⚠️ Role REMOVED: ${member.user.tag} (${(dbUser.totalSeconds / 3600).toFixed(1)}h)`);
            }
        } catch (e) {
            console.error("❌ Error processing user:", e);
        }
    }
}
