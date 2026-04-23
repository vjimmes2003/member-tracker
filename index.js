require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ChannelType,
    AttachmentBuilder
} = require("discord.js");

const db = require("./database");
const config = require("./config");

const {
    formatDuration,
    formatShortDuration,
    formatDate,
    truncate,
    getMadridDateKey,
    levelFromXp,
    getXpProgress,
    makeProgressBar,
    formatHours
} = require("./utils");

const { checkAchievements } = require("./achievementSystem");
const { generateVoiceCard } = require("./cardGenerator");
const { updatePanel, ensurePanelMessages } = require("./panelSystem");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const VOICE_TICK_MS = 60 * 1000;
const DAILY_CONNECTED_MINUTES = 60;
const DAILY_MISSION_30_XP = 10;
const DAILY_MISSION_60_XP = 25;
const DAILY_STREAM_15_XP = 15;
const DAILY_SOCIAL_30_XP = 15;

client.once("clientReady", async () => {
    console.log(`Bot conectado como ${client.user.tag}`);
    console.log(`Servidores totales: ${client.guilds.cache.size}`);

    client.guilds.cache.forEach(guild => {
        console.log(`- ${guild.name} (${guild.id})`);
    });

    seedExistingVoiceUsers();

    for (const [, guild] of client.guilds.cache) {
        await syncAllVoiceRoles(guild);
    }

    await ensurePanelMessages(client);
    await updatePanel(client);

    setInterval(async () => {
        try {
            for (const [, guild] of client.guilds.cache) {
                await processGuildVoiceTick(guild);
            }
        } catch (error) {
            console.error("Error en el tick de voz:", error);
        }
    }, VOICE_TICK_MS);

    setInterval(async () => {
        try {
            await updatePanel(client);
        } catch (error) {
            console.error("Error actualizando panel:", error);
        }
    }, config.panelUpdateMinutes * 60 * 1000);
});

client.on("error", (error) => {
    console.error("Error del cliente de Discord:", error);
});

process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
});

function saveName(userId, type, value) {
    if (!value) return;

    const exists = db.prepare(`
        SELECT 1
        FROM names
        WHERE user_id = ? AND type = ? AND value = ?
    `).get(userId, type, value);

    if (!exists) {
        db.prepare(`
            INSERT INTO names (user_id, type, value, seen_at)
            VALUES (?, ?, ?, ?)
        `).run(userId, type, value, new Date().toISOString());
    }
}

function ensureVoiceUserExists(userId) {
    db.prepare(`
        INSERT OR IGNORE INTO voice_users (
            user_id,
            total_voice_time_ms,
            total_stream_time_ms,
            total_social_voice_time_ms,
            voice_sessions_count,
            first_voice_join_at,
            last_voice_join_at,
            last_voice_leave_at,
            voice_xp,
            voice_level,
            days_connected,
            xp_seeded
        ) VALUES (?, 0, 0, 0, 0, NULL, NULL, NULL, 0, 0, 0, 1)
    `).run(userId);
}

function seedExistingVoiceUsers() {
    const rows = db.prepare(`
        SELECT user_id, total_voice_time_ms, voice_xp, xp_seeded
        FROM voice_users
        WHERE xp_seeded = 0
    `).all();

    for (const row of rows) {
        const seededXp = Math.max(row.voice_xp || 0, Math.floor((row.total_voice_time_ms || 0) / 60000));
        const seededLevel = levelFromXp(seededXp);

        db.prepare(`
            UPDATE voice_users
            SET voice_xp = ?, voice_level = ?, xp_seeded = 1
            WHERE user_id = ?
        `).run(seededXp, seededLevel, row.user_id);
    }

    if (rows.length > 0) {
        console.log(`[VOICE XP] Seed aplicados a ${rows.length} usuarios con histórico previo`);
    }
}

function isTrackableVoiceState(state) {
    if (!state.channelId) return false;
    if (state.guild.afkChannelId && state.channelId === state.guild.afkChannelId) return false;
    return true;
}

function getOpenVoiceSession(userId) {
    return db.prepare(`
        SELECT *
        FROM voice_sessions
        WHERE user_id = ? AND left_at IS NULL
        ORDER BY joined_at DESC
        LIMIT 1
    `).get(userId);
}

function ensureDailyRow(userId, dateKey) {
    const row = db.prepare(`
        SELECT *
        FROM voice_daily_stats
        WHERE user_id = ? AND stat_date = ?
    `).get(userId, dateKey);

    if (!row) {
        db.prepare(`
            INSERT INTO voice_daily_stats (
                user_id,
                stat_date,
                voice_minutes,
                stream_minutes,
                social_minutes,
                day_counted,
                mission_30_done,
                mission_60_done,
                mission_stream_15_done,
                mission_social_30_done
            ) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0)
        `).run(userId, dateKey);
    }
}

async function getVoiceAnnounceChannel(guild) {
    if (config.voiceAnnounceChannel) {
        try {
            const channel = await client.channels.fetch(config.voiceAnnounceChannel);
            if (channel) return channel;
        } catch (error) {
            console.log("No se pudo obtener VOICE_ANNOUNCE_CHANNEL, se intentará por nombre.");
        }
    }

    return guild.channels.cache.find(
        channel =>
            channel.type === ChannelType.GuildText &&
            channel.name === "comandos-voz"
    ) || null;
}

function getTargetVoiceRole(level) {
    let targetRole = null;

    for (const entry of config.voiceLevelRoles) {
        if (level >= entry.level) {
            targetRole = entry;
        }
    }

    return targetRole;
}

async function syncVoiceLevelRole(guild, userId, level) {
    if (!config.voiceLevelRoles || config.voiceLevelRoles.length === 0) return;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;

    const configuredRoleIds = config.voiceLevelRoles.map(entry => entry.roleId);
    const targetRole = getTargetVoiceRole(level);
    const targetRoleId = targetRole ? targetRole.roleId : null;

    const rolesToRemove = configuredRoleIds.filter(roleId =>
        roleId !== targetRoleId && member.roles.cache.has(roleId)
    );

    if (rolesToRemove.length > 0) {
        await member.roles.remove(rolesToRemove).catch(error => {
            console.error(`No se pudieron quitar roles de voz a ${userId}:`, error);
        });
    }

    if (targetRoleId && !member.roles.cache.has(targetRoleId)) {
        await member.roles.add(targetRoleId).catch(error => {
            console.error(`No se pudo añadir el rol de voz a ${userId}:`, error);
        });
    }
}

async function syncAllVoiceRoles(guild) {
    if (!config.voiceLevelRoles || config.voiceLevelRoles.length === 0) return;

    const rows = db.prepare(`
        SELECT user_id, voice_level
        FROM voice_users
    `).all();

    for (const row of rows) {
        await syncVoiceLevelRole(guild, row.user_id, row.voice_level);
    }

    console.log(`[VOICE ROLES] Roles sincronizados en ${guild.name}`);
}

async function announceLevelUp(guild, userId, oldLevel, newLevel) {
    const channel = await getVoiceAnnounceChannel(guild);
    if (!channel) return;

    const targetRole = getTargetVoiceRole(newLevel);

    let roleText = "";
    if (targetRole) {
        roleText = `\n🏅 Nuevo rango: <@&${targetRole.roleId}>`;
    }

    await channel.send(
        `🎉 <@${userId}> ha subido de **nivel de voz ${oldLevel}** a **nivel ${newLevel}**${roleText}`
    );
}

function getChannelHumanCount(member) {
    const channel = member.voice?.channel;
    if (!channel) return 0;

    return channel.members.filter(m => !m.user.bot).size;
}

function getMinuteXp(member) {
    if (member.voice?.selfMute && member.voice?.selfDeaf) {
        return 0;
    }

    const count = getChannelHumanCount(member);

    if (count <= 1) return 0;
    if (count === 2) return 1;
    if (count <= 4) return 2;
    return 3;
}

function openVoiceSession(member, channelId) {
    const now = new Date().toISOString();
    const userId = member.id;

    ensureVoiceUserExists(userId);

    const openSession = getOpenVoiceSession(userId);
    if (openSession) return;

    db.prepare(`
        INSERT INTO voice_sessions (
            user_id,
            guild_id,
            channel_id,
            joined_at,
            left_at,
            duration_ms,
            tracked_voice_ms,
            tracked_stream_ms,
            tracked_social_voice_ms,
            xp_earned,
            last_tick_at
        ) VALUES (?, ?, ?, ?, NULL, 0, 0, 0, 0, 0, ?)
    `).run(userId, member.guild.id, channelId, now, now);

    const voiceUser = db.prepare(`
        SELECT *
        FROM voice_users
        WHERE user_id = ?
    `).get(userId);

    if (!voiceUser.first_voice_join_at) {
        db.prepare(`
            UPDATE voice_users
            SET first_voice_join_at = ?, last_voice_join_at = ?
            WHERE user_id = ?
        `).run(now, now, userId);
    } else {
        db.prepare(`
            UPDATE voice_users
            SET last_voice_join_at = ?
            WHERE user_id = ?
        `).run(now, userId);
    }

    console.log(`[VOICE] ${member.user.tag} entró a voz en canal ${channelId}`);
}

async function applyVoiceProgress(member, nowDate = new Date()) {
    if (!member || member.user.bot) return;
    if (!member.voice?.channelId) return;
    if (member.guild.afkChannelId && member.voice.channelId === member.guild.afkChannelId) return;

    ensureVoiceUserExists(member.id);

    let session = getOpenVoiceSession(member.id);
    if (!session) {
        openVoiceSession(member, member.voice.channelId);
        session = getOpenVoiceSession(member.id);
        if (!session) return;
    }

    const lastTick = new Date(session.last_tick_at || session.joined_at);
    const diffMs = nowDate - lastTick;
    const fullMinutes = Math.floor(diffMs / 60000);

    if (fullMinutes <= 0) return;

    let baseXp = 0;
    let bonusXp = 0;
    let daysGained = 0;
    let streamMinutesAwarded = 0;
    let socialMinutesAwarded = 0;

    for (let i = 1; i <= fullMinutes; i++) {
        const minuteMark = new Date(lastTick.getTime() + (i * 60000));
        const dateKey = getMadridDateKey(minuteMark);
        ensureDailyRow(member.id, dateKey);

        const daily = db.prepare(`
            SELECT *
            FROM voice_daily_stats
            WHERE user_id = ? AND stat_date = ?
        `).get(member.id, dateKey);

        const minuteXp = getMinuteXp(member);
        const isStreaming = Boolean(member.voice.selfStream);
        const isSocialMinute = minuteXp > 0;

        const nextVoiceMinutes = daily.voice_minutes + 1;
        const nextStreamMinutes = daily.stream_minutes + (isStreaming ? 1 : 0);
        const nextSocialMinutes = daily.social_minutes + (isSocialMinute ? 1 : 0);

        let mission30Done = daily.mission_30_done;
        let mission60Done = daily.mission_60_done;
        let missionStream15Done = daily.mission_stream_15_done;
        let missionSocial30Done = daily.mission_social_30_done;
        let dayCounted = daily.day_counted;

        baseXp += minuteXp;

        if (isStreaming) {
            streamMinutesAwarded += 1;
            baseXp += 1;
        }

        if (isSocialMinute) {
            socialMinutesAwarded += 1;
        }

        if (!mission30Done && nextVoiceMinutes >= 30) {
            bonusXp += DAILY_MISSION_30_XP;
            mission30Done = 1;
        }

        if (!mission60Done && nextVoiceMinutes >= DAILY_CONNECTED_MINUTES) {
            bonusXp += DAILY_MISSION_60_XP;
            mission60Done = 1;
        }

        if (!dayCounted && nextVoiceMinutes >= DAILY_CONNECTED_MINUTES) {
            dayCounted = 1;
            daysGained += 1;
        }

        if (!missionStream15Done && nextStreamMinutes >= 15) {
            bonusXp += DAILY_STREAM_15_XP;
            missionStream15Done = 1;
        }

        if (!missionSocial30Done && nextSocialMinutes >= 30) {
            bonusXp += DAILY_SOCIAL_30_XP;
            missionSocial30Done = 1;
        }

        db.prepare(`
            UPDATE voice_daily_stats
            SET
                voice_minutes = ?,
                stream_minutes = ?,
                social_minutes = ?,
                day_counted = ?,
                mission_30_done = ?,
                mission_60_done = ?,
                mission_stream_15_done = ?,
                mission_social_30_done = ?
            WHERE user_id = ? AND stat_date = ?
        `).run(
            nextVoiceMinutes,
            nextStreamMinutes,
            nextSocialMinutes,
            dayCounted,
            mission30Done,
            mission60Done,
            missionStream15Done,
            missionSocial30Done,
            member.id,
            dateKey
        );
    }

    const awardVoiceMs = fullMinutes * 60000;
    const awardStreamMs = streamMinutesAwarded * 60000;
    const awardSocialMs = socialMinutesAwarded * 60000;
    const totalXpGain = baseXp + bonusXp;
    const newLastTick = new Date(lastTick.getTime() + (fullMinutes * 60000)).toISOString();

    const voiceUserBefore = db.prepare(`
        SELECT *
        FROM voice_users
        WHERE user_id = ?
    `).get(member.id);

    const newXp = (voiceUserBefore.voice_xp || 0) + totalXpGain;
    const oldLevel = voiceUserBefore.voice_level || 0;
    const newLevel = levelFromXp(newXp);

    db.prepare(`
        UPDATE voice_sessions
        SET
            tracked_voice_ms = tracked_voice_ms + ?,
            tracked_stream_ms = tracked_stream_ms + ?,
            tracked_social_voice_ms = tracked_social_voice_ms + ?,
            xp_earned = xp_earned + ?,
            last_tick_at = ?
        WHERE id = ?
    `).run(
        awardVoiceMs,
        awardStreamMs,
        awardSocialMs,
        totalXpGain,
        newLastTick,
        session.id
    );

    db.prepare(`
        UPDATE voice_users
        SET
            total_voice_time_ms = total_voice_time_ms + ?,
            total_stream_time_ms = total_stream_time_ms + ?,
            total_social_voice_time_ms = total_social_voice_time_ms + ?,
            voice_xp = ?,
            voice_level = ?,
            days_connected = days_connected + ?
        WHERE user_id = ?
    `).run(
        awardVoiceMs,
        awardStreamMs,
        awardSocialMs,
        newXp,
        newLevel,
        daysGained,
        member.id
    );

    await checkAchievements(member, client);

    const finalUser = db.prepare(`
        SELECT *
        FROM voice_users
        WHERE user_id = ?
    `).get(member.id);

    const finalLevel = levelFromXp(finalUser.voice_xp || 0);

    if (finalLevel !== finalUser.voice_level) {
        db.prepare(`
            UPDATE voice_users
            SET voice_level = ?
            WHERE user_id = ?
        `).run(finalLevel, member.id);
    }

    if (finalLevel > oldLevel) {
        await syncVoiceLevelRole(member.guild, member.id, finalLevel);
        await announceLevelUp(member.guild, member.id, oldLevel, finalLevel);
    }
}

async function closeVoiceSession(member, reason = "leave") {
    const now = new Date();
    const nowIso = now.toISOString();
    const userId = member.id;

    await applyVoiceProgress(member, now);

    const session = getOpenVoiceSession(userId);
    if (!session) return null;

    const joinedAt = new Date(session.joined_at);
    const actualDurationMs = Math.max(0, now - joinedAt);

    db.prepare(`
        UPDATE voice_sessions
        SET
            left_at = ?,
            duration_ms = ?,
            last_tick_at = ?
        WHERE id = ?
    `).run(
        nowIso,
        actualDurationMs,
        nowIso,
        session.id
    );

    db.prepare(`
        UPDATE voice_users
        SET
            voice_sessions_count = voice_sessions_count + 1,
            last_voice_leave_at = ?
        WHERE user_id = ?
    `).run(nowIso, userId);

    console.log(`[VOICE] ${member.user.tag} salió de voz (${reason}) tras ${formatDuration(actualDurationMs)}`);

    return {
        durationMs: actualDurationMs,
        channelId: session.channel_id,
        joinedAt: session.joined_at,
        leftAt: nowIso
    };
}

async function processGuildVoiceTick(guild) {
    const states = guild.voiceStates.cache;

    for (const [, state] of states) {
        const member = state.member;
        if (!member || member.user.bot) continue;
        if (!isTrackableVoiceState(state)) continue;

        await applyVoiceProgress(member, new Date());
    }
}

client.on("guildMemberAdd", async (member) => {
    const now = new Date().toISOString();
    const userId = member.id;

    const existing = db.prepare(`
        SELECT *
        FROM users
        WHERE user_id = ?
    `).get(userId);

    if (!existing) {
        db.prepare(`
            INSERT INTO users
            (user_id, is_bot, created_at, first_seen_at, last_join_at, join_count)
            VALUES (?, ?, ?, ?, ?, 1)
        `).run(
            userId,
            member.user.bot ? 1 : 0,
            member.user.createdAt.toISOString(),
            now,
            now
        );
    } else {
        db.prepare(`
            UPDATE users
            SET last_join_at = ?, join_count = join_count + 1
            WHERE user_id = ?
        `).run(now, userId);
    }

    db.prepare(`
        INSERT INTO sessions (user_id, joined_at)
        VALUES (?, ?)
    `).run(userId, now);

    saveName(userId, "username", member.user.username);
    saveName(userId, "global", member.user.globalName);
    saveName(userId, "nickname", member.nickname);

    const avisosChannel = await client.channels.fetch(config.avisosChannel);
    if (avisosChannel) {
        await avisosChannel.send(`📥 **Entrada registrada**\nUsuario: ${member.user.tag}\nID: ${userId}`);
    }
});

client.on("guildMemberRemove", async (member) => {
    const now = new Date().toISOString();
    const userId = member.id;

    await closeVoiceSession(member, "guild_leave");

    const session = db.prepare(`
        SELECT *
        FROM sessions
        WHERE user_id = ? AND left_at IS NULL
        ORDER BY joined_at DESC
        LIMIT 1
    `).get(userId);

    if (!session) {
        console.log(`No se encontró sesión abierta para ${userId}.`);
        return;
    }

    const joined = new Date(session.joined_at);
    const left = new Date(now);
    const duration = left - joined;

    db.prepare(`
        UPDATE sessions
        SET left_at = ?, duration_ms = ?
        WHERE id = ?
    `).run(now, duration, session.id);

    db.prepare(`
        UPDATE users
        SET
            last_leave_at = ?,
            leave_count = leave_count + 1,
            total_time_ms = total_time_ms + ?
        WHERE user_id = ?
    `).run(now, duration, userId);

    const user = db.prepare(`
        SELECT *
        FROM users
        WHERE user_id = ?
    `).get(userId);

    const despedidasChannel = await client.channels.fetch(config.despedidasChannel);
    const avisosChannel = await client.channels.fetch(config.avisosChannel);

    const embedPublic = new EmbedBuilder()
        .setTitle("📤 Usuario abandonó el servidor")
        .setDescription(`**<@${userId}>** ha salido del servidor.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: "⏳ Última estancia", value: formatDuration(duration), inline: true },
            { name: "🕓 Tiempo acumulado", value: formatDuration(user.total_time_ms), inline: true },
            { name: "🔁 Entradas registradas", value: `${user.join_count}`, inline: true },
            { name: "👥 Miembros restantes", value: `${member.guild.memberCount}`, inline: true }
        )
        .setColor(0xff5555)
        .setFooter({ text: `ID: ${userId}` })
        .setTimestamp();

    if (despedidasChannel) {
        await despedidasChannel.send({ embeds: [embedPublic] });
    }

    const names = db.prepare(`
        SELECT type, value
        FROM names
        WHERE user_id = ?
        ORDER BY seen_at ASC
    `).all(userId);

    const usernames = truncate(
        names.filter(n => n.type === "username").map(n => n.value).join(", ") || "N/A",
        1024
    );

    const globals = truncate(
        names.filter(n => n.type === "global").map(n => n.value).join(", ") || "N/A",
        1024
    );

    const nicks = truncate(
        names.filter(n => n.type === "nickname").map(n => n.value).join(", ") || "N/A",
        1024
    );

    const embedStaff = new EmbedBuilder()
        .setTitle("📋 Registro completo de salida")
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: "Usuario", value: member.user.tag || member.user.username, inline: false },
            { name: "ID", value: userId, inline: false },
            { name: "Cuenta creada", value: formatDate(user.created_at), inline: true },
            { name: "Primera vez visto", value: formatDate(user.first_seen_at), inline: true },
            { name: "Última entrada", value: formatDate(session.joined_at), inline: true },
            { name: "Última salida", value: formatDate(now), inline: true },
            { name: "Última estancia", value: formatDuration(duration), inline: true },
            { name: "Tiempo acumulado", value: formatDuration(user.total_time_ms), inline: true },
            { name: "Entradas", value: `${user.join_count}`, inline: true },
            { name: "Salidas", value: `${user.leave_count}`, inline: true },
            { name: "Usernames vistos", value: usernames, inline: false },
            { name: "Global names vistos", value: globals, inline: false },
            { name: "Nicknames vistos", value: nicks, inline: false }
        )
        .setColor(0x3498db)
        .setTimestamp();

    if (avisosChannel) {
        await avisosChannel.send({ embeds: [embedStaff] });
    }
});

client.on("voiceStateUpdate", async (oldState, newState) => {
    try {
        const member = newState.member || oldState.member;
        if (!member || member.user.bot) return;

        const wasTrackable = isTrackableVoiceState(oldState);
        const isNowTrackable = isTrackableVoiceState(newState);

        if (!wasTrackable && isNowTrackable) {
            openVoiceSession(member, newState.channelId);
            return;
        }

        if (wasTrackable && !isNowTrackable) {
            await closeVoiceSession(member, "disconnect_or_afk");
            return;
        }

        if (wasTrackable && isNowTrackable && oldState.channelId !== newState.channelId) {
            await closeVoiceSession(member, "switch_channel");
            openVoiceSession(member, newState.channelId);
        }
    } catch (error) {
        console.error("Error en voiceStateUpdate:", error);
    }
});

client.on("interactionCreate", async (interaction) => {
    try {
        if (!interaction.isChatInputCommand()) return;

        await interaction.deferReply();

        const command = interaction.commandName;

        if (command === "voz-top-tiempo") {
            const rows = db.prepare(`
                SELECT user_id, total_voice_time_ms, voice_level
                FROM voice_users
                ORDER BY total_voice_time_ms DESC, voice_xp DESC
                LIMIT 10
            `).all();

            const description = rows.length
                ? rows.map((row, index) =>
                    `**${index + 1}.** <@${row.user_id}> — ${formatShortDuration(row.total_voice_time_ms)} · Nivel ${row.voice_level}`
                ).join("\n")
                : "No hay datos de voz todavía.";

            const embed = new EmbedBuilder()
                .setTitle("🎙️ Top tiempo en voz")
                .setDescription(description)
                .setColor(0x5865f2)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        if (command === "voz-top-dias") {
            const rows = db.prepare(`
                SELECT user_id, days_connected, voice_level, total_voice_time_ms
                FROM voice_users
                ORDER BY days_connected DESC, total_voice_time_ms DESC
                LIMIT 10
            `).all();

            const description = rows.length
                ? rows.map((row, index) =>
                    `**${index + 1}.** <@${row.user_id}> — ${row.days_connected} días · Nivel ${row.voice_level}`
                ).join("\n")
                : "No hay días conectados registrados todavía.";

            const embed = new EmbedBuilder()
                .setTitle("📅 Top días conectados")
                .setDescription(description)
                .setColor(0x57f287)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        if (command === "voz-top-xp") {
            const rows = db.prepare(`
                SELECT user_id, voice_xp, voice_level
                FROM voice_users
                ORDER BY voice_xp DESC
                LIMIT 10
            `).all();

            const description = rows.length
                ? rows.map((row, index) =>
                    `**${index + 1}.** <@${row.user_id}> — ${row.voice_xp} XP · Nivel ${row.voice_level}`
                ).join("\n")
                : "No hay XP de voz registrada todavía.";

            const embed = new EmbedBuilder()
                .setTitle("⭐ Top XP de voz")
                .setDescription(description)
                .setColor(0xf1c40f)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        if (command === "voz-top-social") {
            const rows = db.prepare(`
                SELECT user_id, total_social_voice_time_ms
                FROM voice_users
                ORDER BY total_social_voice_time_ms DESC
                LIMIT 10
            `).all();

            const description = rows.length
                ? rows.map((row, index) =>
                    `**${index + 1}.** <@${row.user_id}> — ${formatShortDuration(row.total_social_voice_time_ms)}`
                ).join("\n")
                : "No hay tiempo social registrado todavía.";

            const embed = new EmbedBuilder()
                .setTitle("🤝 Top social")
                .setDescription(description)
                .setColor(0x2ecc71)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        if (command === "voz-top-stream") {
            const rows = db.prepare(`
                SELECT user_id, total_stream_time_ms
                FROM voice_users
                ORDER BY total_stream_time_ms DESC
                LIMIT 10
            `).all();

            const description = rows.length
                ? rows.map((row, index) =>
                    `**${index + 1}.** <@${row.user_id}> — ${formatShortDuration(row.total_stream_time_ms)}`
                ).join("\n")
                : "No hay tiempo de stream registrado todavía.";

            const embed = new EmbedBuilder()
                .setTitle("🖥️ Top streamers")
                .setDescription(description)
                .setColor(0x3498db)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        if (command === "voz-perfil") {
            const targetUser = interaction.options.getUser("usuario") || interaction.user;

            const row = db.prepare(`
                SELECT *
                FROM voice_users
                WHERE user_id = ?
            `).get(targetUser.id);

            if (!row) {
                return interaction.editReply({
                    content: "Este usuario todavía no tiene actividad de voz registrada."
                });
            }

            const avgSessionMs = row.voice_sessions_count > 0
                ? Math.floor(row.total_voice_time_ms / row.voice_sessions_count)
                : 0;

            const progress = getXpProgress(row.voice_xp);
            const currentRole = getTargetVoiceRole(row.voice_level);
            const currentRoleText = currentRole ? `<@&${currentRole.roleId}>` : "Sin rango de voz";

            const cardProgress = {
                ...progress,
                current: row.voice_xp,
                next: progress.nextFloor
            };

            const buffer = await generateVoiceCard(
                targetUser,
                row,
                cardProgress,
                targetUser.displayAvatarURL({ extension: "png", forceStatic: true, size: 256 })
            );

            const attachment = new AttachmentBuilder(buffer, { name: "voice-card.png" });

            const embed = new EmbedBuilder()
                .setTitle("🎧 Perfil de voz")
                .setDescription(
                    [
                        `**<@${targetUser.id}>**`,
                        `⭐ Nivel **${row.voice_level}** · ✨ **${row.voice_xp} XP**`,
                        `🏅 Rango actual: ${currentRoleText}`,
                        `📅 Días conectados: **${row.days_connected}**`,
                        `⏳ Voz: **${formatDuration(row.total_voice_time_ms)}**`,
                        `🤝 Social: **${formatDuration(row.total_social_voice_time_ms)}**`,
                        `🖥️ Stream: **${formatDuration(row.total_stream_time_ms)}**`,
                        `📊 Media por sesión: **${formatDuration(avgSessionMs)}**`,
                        `🚀 Siguiente nivel: **${progress.remaining} XP restantes**`
                    ].join("\n")
                )
                .setColor(0xfee75c)
                .setImage("attachment://voice-card.png")
                .setFooter({ text: "Sistema de actividad en voz" })
                .setTimestamp();

            return interaction.editReply({
                embeds: [embed],
                files: [attachment]
            });
        }

        if (command === "voz-nivel") {
            const targetUser = interaction.options.getUser("usuario") || interaction.user;

            const row = db.prepare(`
                SELECT *
                FROM voice_users
                WHERE user_id = ?
            `).get(targetUser.id);

            if (!row) {
                return interaction.editReply({
                    content: "Este usuario todavía no tiene actividad de voz registrada."
                });
            }

            const progress = getXpProgress(row.voice_xp);
            const currentRole = getTargetVoiceRole(row.voice_level);
            const currentRoleText = currentRole ? `<@&${currentRole.roleId}>` : "Sin rango";

            const description = [
                `**<@${targetUser.id}>**`,
                `Progreso actual del sistema de experiencia en voz`,
                ``,
                `⭐ **Nivel actual:** ${row.voice_level}`,
                `✨ **XP actual:** ${row.voice_xp}`,
                `🧩 **XP restante:** ${progress.remaining}`,
                `🏅 **Rango:** ${currentRoleText}`,
                ``,
                `📈 **Progreso**`,
                `${makeProgressBar(progress.percent)} ${progress.percent}%`,
                ``,
                `🚀 **Próximo nivel**`,
                `Nivel ${row.voice_level + 1}`,
                ``,
                `⏳ **Tiempo aproximado restante**`,
                `${formatHours(progress.remaining / 60)}`
            ].join("\n");

            const embed = new EmbedBuilder()
                .setTitle("⭐ Nivel de voz")
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setDescription(description)
                .setColor(0xf1c40f)
                .setFooter({ text: "XP social: solo cuenta bien si no estás solo en voz" })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        return interaction.editReply({ content: "Comando no reconocido." });
    } catch (error) {
        console.error("Error en interactionCreate:", error);

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    content: "Ha ocurrido un error ejecutando el comando."
                });
            } else {
                await interaction.reply({
                    content: "Ha ocurrido un error ejecutando el comando.",
                    flags: 64
                });
            }
        } catch (replyError) {
            console.error("Error respondiendo al fallo del comando:", replyError);
        }
    }
});

client.login(config.token);