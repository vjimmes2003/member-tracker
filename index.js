require("dotenv").config();

const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const db = require("./database");
const config = require("./config");
const { formatDuration, formatDate, truncate } = require("./utils");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.once("clientReady", () => {
    console.log(`Bot conectado como ${client.user.tag}`);
    console.log(`Servidores totales: ${client.guilds.cache.size}`);

    client.guilds.cache.forEach(guild => {
        console.log(`- ${guild.name} (${guild.id})`);
    });
});

function saveName(userId, type, value) {
    if (!value) return;

    const exists = db.prepare(`
        SELECT 1 FROM names
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
    const existing = db.prepare(`
        SELECT * FROM voice_users WHERE user_id = ?
    `).get(userId);

    if (!existing) {
        db.prepare(`
            INSERT INTO voice_users (
                user_id,
                total_voice_time_ms,
                voice_sessions_count,
                first_voice_join_at,
                last_voice_join_at,
                last_voice_leave_at
            ) VALUES (?, 0, 0, NULL, NULL, NULL)
        `).run(userId);
    }
}

function openVoiceSession(member, channelId) {
    const now = new Date().toISOString();
    const userId = member.id;

    ensureVoiceUserExists(userId);

    const openSession = db.prepare(`
        SELECT * FROM voice_sessions
        WHERE user_id = ? AND left_at IS NULL
        ORDER BY joined_at DESC
        LIMIT 1
    `).get(userId);

    if (openSession) {
        return;
    }

    db.prepare(`
        INSERT INTO voice_sessions (user_id, guild_id, channel_id, joined_at)
        VALUES (?, ?, ?, ?)
    `).run(userId, member.guild.id, channelId, now);

    const voiceUser = db.prepare(`
        SELECT * FROM voice_users WHERE user_id = ?
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

function closeVoiceSession(member, reason = "leave") {
    const now = new Date().toISOString();
    const userId = member.id;

    const openSession = db.prepare(`
        SELECT * FROM voice_sessions
        WHERE user_id = ? AND left_at IS NULL
        ORDER BY joined_at DESC
        LIMIT 1
    `).get(userId);

    if (!openSession) {
        return null;
    }

    const joinedAt = new Date(openSession.joined_at);
    const leftAt = new Date(now);
    const durationMs = Math.max(0, leftAt - joinedAt);

    db.prepare(`
        UPDATE voice_sessions
        SET left_at = ?, duration_ms = ?
        WHERE id = ?
    `).run(now, durationMs, openSession.id);

    ensureVoiceUserExists(userId);

    db.prepare(`
        UPDATE voice_users
        SET
            total_voice_time_ms = total_voice_time_ms + ?,
            voice_sessions_count = voice_sessions_count + 1,
            last_voice_leave_at = ?
        WHERE user_id = ?
    `).run(durationMs, now, userId);

    console.log(`[VOICE] ${member.user.tag} salió de voz (${reason}) tras ${formatDuration(durationMs)}`);

    return {
        durationMs,
        channelId: openSession.channel_id,
        joinedAt: openSession.joined_at,
        leftAt: now
    };
}

function buildVoiceLevel(totalVoiceMs) {
    const hours = totalVoiceMs / (1000 * 60 * 60);

    if (hours < 1) return 0;
    if (hours < 3) return 1;
    if (hours < 6) return 2;
    if (hours < 10) return 3;
    if (hours < 20) return 4;
    if (hours < 35) return 5;
    if (hours < 50) return 6;
    if (hours < 75) return 7;
    if (hours < 100) return 8;
    if (hours < 150) return 9;
    return 10;
}

client.on("guildMemberAdd", async (member) => {
    const now = new Date().toISOString();
    const userId = member.id;

    const existing = db.prepare(`
        SELECT * FROM users WHERE user_id = ?
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
        await avisosChannel.send(
            `📥 **Entrada registrada**\nUsuario: ${member.user.tag}\nID: ${userId}`
        );
    }
});

client.on("guildMemberRemove", async (member) => {
    const now = new Date().toISOString();
    const userId = member.id;

    closeVoiceSession(member, "guild_leave");

    const session = db.prepare(`
        SELECT * FROM sessions
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
        SELECT * FROM users WHERE user_id = ?
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
        SELECT type, value FROM names
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

        const oldChannelId = oldState.channelId;
        const newChannelId = newState.channelId;

        if (!oldChannelId && newChannelId) {
            openVoiceSession(member, newChannelId);
            return;
        }

        if (oldChannelId && !newChannelId) {
            closeVoiceSession(member, "disconnect");
            return;
        }

        if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
            closeVoiceSession(member, "switch_channel");
            openVoiceSession(member, newChannelId);
        }
    } catch (error) {
        console.error("Error en voiceStateUpdate:", error);
    }
});

client.on("interactionCreate", async (interaction) => {
    try {
        if (!interaction.isChatInputCommand()) return;

        const command = interaction.commandName;

        if (command === "voz-top-tiempo") {
            const rows = db.prepare(`
                SELECT user_id, total_voice_time_ms
                FROM voice_users
                ORDER BY total_voice_time_ms DESC
                LIMIT 10
            `).all();

            const description = rows.length
                ? rows.map((row, index) =>
                    `**${index + 1}.** <@${row.user_id}> — ${formatDuration(row.total_voice_time_ms)}`
                ).join("\n")
                : "No hay datos de voz todavía.";

            const embed = new EmbedBuilder()
                .setTitle("🎙️ Top tiempo en voz")
                .setDescription(description)
                .setColor(0x5865f2)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        if (command === "voz-top-uniones") {
            const rows = db.prepare(`
                SELECT user_id, voice_sessions_count, total_voice_time_ms
                FROM voice_users
                ORDER BY voice_sessions_count DESC, total_voice_time_ms DESC
                LIMIT 10
            `).all();

            const description = rows.length
                ? rows.map((row, index) =>
                    `**${index + 1}.** <@${row.user_id}> — ${row.voice_sessions_count} sesiones`
                ).join("\n")
                : "No hay datos de voz todavía.";

            const embed = new EmbedBuilder()
                .setTitle("🔁 Top uniones a voz")
                .setDescription(description)
                .setColor(0x57f287)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        if (command === "voz-perfil") {
            const targetUser = interaction.options.getUser("usuario") || interaction.user;

            const row = db.prepare(`
                SELECT *
                FROM voice_users
                WHERE user_id = ?
            `).get(targetUser.id);

            if (!row) {
                return interaction.reply({
                    content: "Este usuario todavía no tiene actividad de voz registrada.",
                    ephemeral: true
                });
            }

            const avgSessionMs = row.voice_sessions_count > 0
                ? Math.floor(row.total_voice_time_ms / row.voice_sessions_count)
                : 0;

            const voiceLevel = buildVoiceLevel(row.total_voice_time_ms);

            const embed = new EmbedBuilder()
                .setTitle("🎧 Perfil de voz")
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: "Usuario", value: `<@${targetUser.id}>`, inline: true },
                    { name: "⭐ Nivel de voz", value: `${voiceLevel}`, inline: true },
                    { name: "⏳ Tiempo total", value: formatDuration(row.total_voice_time_ms), inline: true },
                    { name: "🔁 Sesiones", value: `${row.voice_sessions_count}`, inline: true },
                    { name: "📊 Media por sesión", value: formatDuration(avgSessionMs), inline: true },
                    { name: "🎙️ Primera vez en voz", value: formatDate(row.first_voice_join_at), inline: false },
                    { name: "🟢 Última entrada a voz", value: formatDate(row.last_voice_join_at), inline: true },
                    { name: "🔴 Última salida de voz", value: formatDate(row.last_voice_leave_at), inline: true }
                )
                .setColor(0xfee75c)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }
    } catch (error) {
        console.error("Error en interactionCreate:", error);

        if (interaction.deferred || interaction.replied) {
            return interaction.followUp({
                content: "Ha ocurrido un error ejecutando el comando.",
                ephemeral: true
            });
        }

        return interaction.reply({
            content: "Ha ocurrido un error ejecutando el comando.",
            ephemeral: true
        });
    }
});

client.login(config.token);
