import { Client } from 'discord.js';
import { UserModel } from './storage';

export interface RoleCheckOptions {
  guildId: string;
  roleId: string;
  requiredSeconds: number; 
  intervalMs?: number;    
}

/**
 * Nastaví periodické prideľovanie/odoberanie role podľa activity.
 */
export function setupRoleChecking(client: Client, options: RoleCheckOptions) {
  const { guildId, roleId, requiredSeconds } = options;
  const intervalMs = options.intervalMs ?? 60 * 60 * 1000; // default 1 hodina

  if (!guildId || !roleId) {
    console.warn(
      '⚠️ GuildId alebo RoleId nie je nastavené, role manager sa nespustí.'
    );
    return;
  }

  console.log(
    `⏱️ RoleManager: checking every ${Math.round(
      intervalMs / 1000 / 60
    )} minutes...`
  );

  const runCheck = () =>
    checkWeeklyActivity(client, { guildId, roleId, requiredSeconds }).catch(
      (err) => console.error('❌ Error in weekly activity check:', err)
    );

  // spusti hneď po štarte (nečakáme prvú hodinu)
  runCheck();

  // a potom periodicky
  setInterval(runCheck, intervalMs);
}

async function checkWeeklyActivity(
  client: Client,
  {
    guildId,
    roleId,
    requiredSeconds,
  }: {
    guildId: string;
    roleId: string;
    requiredSeconds: number;
  }
) {
  console.log('🔄 Starting weekly activity check...');

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    console.error('❌ Guild not found.');
    return;
  }

  const role = await guild.roles.fetch(roleId);
  if (!role) {
    console.error('❌ Role not found on server.');
    return;
  }

  const allUsers = await UserModel.find({});
  console.log(`📊 Checking roles for ${allUsers.length} users...`);

  for (const dbUser of allUsers) {
    try {
      if (!dbUser.discordId) continue;

      const member = await guild.members.fetch(dbUser.discordId).catch(() => null);
      if (!member) {
        console.log(`Skipping user without guild member: ${dbUser.discordId}`);
        continue;
      }

      const hasRole = member.roles.cache.has(role.id);
      const isActive = dbUser.totalSeconds >= requiredSeconds;

      console.log(
        `User ${member.user.tag}: totalSeconds=${dbUser.totalSeconds}, required=${requiredSeconds}, isActive=${isActive}, hasRole=${hasRole}`
      );

      if (isActive && !hasRole) {
        try {
          await member.roles.add(role);
          console.log(
            `✅ Role ADDED: ${member.user.tag} (${(
              dbUser.totalSeconds / 3600
            ).toFixed(1)}h)`
          );
        } catch (err) {
          console.error(`❌ Error adding role to ${member.user.tag}:`, err);
        }
      } else if (!isActive && hasRole) {
        try {
          await member.roles.remove(role);
          console.log(
            `⚠️ Role REMOVED: ${member.user.tag} (${(
              dbUser.totalSeconds / 3600
            ).toFixed(1)}h)`
          );
        } catch (err) {
          console.error(`❌ Error removing role from ${member.user.tag}:`, err);
        }
      }
    } catch (e) {
      console.error('❌ Error processing user:', e);
    }
  }

  console.log('✅ Weekly activity check finished.');
}