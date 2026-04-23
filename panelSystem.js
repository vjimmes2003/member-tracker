const fs = require("fs");
const path = require("path");
const { EmbedBuilder, ChannelType } = require("discord.js");
const db = require("./database");
const config = require("./config");
const { formatDuration, formatShortDuration, formatDate } = require("./utils");

const PANEL_STATE_PATH = path.join(__dirname, "data", "panelState.json");

function loadPanelState() {
    try {
        if (!fs.existsSync(PANEL_STATE_PATH)) {
            return {};
        }
        return JSON.parse(fs.readFileSync(PANEL_STATE_PATH, "utf8"));
    } catch (error) {
        console.error("Error leyendo panelState.json:", error);
        return {};
    }
}

function savePanelState(state) {
    try {
        fs.mkdirSync(path.dirname(PANEL_STATE_PATH), { recursive: true });
        fs.writeFileSync(PANEL_STATE_PATH, JSON.stringify(state, null, 2), "utf8");
    } catch (error) {
        console.error("Error guardando panelState.json:", error);
    }
}

async function getPanelChannel(client) {
    if (!config.panelChannel) {
        console.log("PANEL_CHANNEL no está definido.");
        return null;
    }

    try {
        const channel = await client.channels.fetch(config.panelChannel);
        if (!channel) return null;
        if (channel.type !== ChannelType.GuildText) {
            console.log("PANEL_CHANNEL no es un canal de texto.");
            return null;
        }
        return channel;
    } catch (error) {
        console.error("No se pudo obtener el canal del panel:", error);
        return null;
    }
}

async function ensurePanelMessages(client) {
    const channel = await getPanelChannel(client);
    if (!channel) return null;

    const state = loadPanelState();

    if (!state[channel.id]) {
        state[channel.id] = {};
    }

    const channelState = state[channel.id];

    const requiredKeys = ["overview", "mainRanking", "secondaryRanking", "ranks"];
    const placeholders = {
        overview: "🎛️ Inicializando panel general...",
        mainRanking: "🏆 Inicializando ranking principal...",
        secondaryRanking: "📊 Inicializando ranking secundario...",
        ranks: "⭐ Inicializando rangos..."
    };

    for (const key of requiredKeys) {
        let message = null;

        if (channelState[key]) {
            try {
                message = await channel.messages.fetch(channelState[key]);
            } catch {
                message = null;
            }
        }

        if (!message) {
            message = await channel.send({ content: placeholders[key] });
            channelState[key] = message.id;
        }
    }

    savePanelState(state);
    return channelState;
}

function getOverviewData() {
    const totals = db.prepare(`
        SELECT
            COUNT(*) as users_count,
            COALESCE(SUM(total_voice_time_ms), 0) as voice_total,
            COALESCE(SUM(total_social_voice_time_ms), 0) as social_total,
            COALESCE(SUM(total_stream_time_ms), 0) as stream_total,
            COALESCE(SUM(days_connected), 0) as days_total,
            COALESCE(SUM(voice_xp), 0) as xp_total,
            COALESCE(MAX(voice_level), 0) as max_level
        FROM voice_users
    `).get();

    const recentAchievements = db.prepare(`
        SELECT va.user_id, va.achievement_id, va.unlocked_at
        FROM voice_achievements va
        ORDER BY va.unlocked_at DESC
        LIMIT 5
    `).all();

    const recentLevels = db.prepare(`
        SELECT user_id, voice_level, voice_xp
        FROM voice_users
        ORDER BY voice_xp DESC
        LIMIT 5
    `).all();

    return { totals, recentAchievements, recentLevels };
}

function buildOverviewEmbed() {
    const { totals, recentAchievements, recentLevels } = getOverviewData();

    const recentAchievementsText = recentAchievements.length
        ? recentAchievements.map(item =>
            `• <@${item.user_id}> → \`${item.achievement_id}\``
        ).join("\n")
        : "No hay logros recientes.";

    const recentLevelsText = recentLevels.length
        ? recentLevels.map(item =>
            `• <@${item.user_id}> — Nivel ${item.voice_level} · ${item.voice_xp} XP`
        ).join("\n")
        : "No hay niveles recientes.";

    return new EmbedBuilder()
        .setTitle("🎛️ Panel general del servidor")
        .setDescription("Resumen global del sistema de voz")
        .addFields(
            { name: "👥 Usuarios registrados", value: `${totals.users_count}`, inline: true },
            { name: "✨ XP total", value: `${totals.xp_total}`, inline: true },
            { name: "⭐ Nivel más alto", value: `${totals.max_level}`, inline: true },

            { name: "⏳ Tiempo total en voz", value: formatDuration(totals.voice_total), inline: false },
            { name: "🤝 Tiempo total social", value: formatDuration(totals.social_total), inline: false },
            { name: "🖥️ Tiempo total en stream", value: formatDuration(totals.stream_total), inline: false },
            { name: "📅 Días conectados acumulados", value: `${totals.days_total}`, inline: false },

            { name: "🏆 Logros recientes", value: recentAchievementsText, inline: false },
            { name: "🚀 Usuarios destacados por XP", value: recentLevelsText, inline: false }
        )
        .setColor(0x5865f2)
        .setFooter({ text: `Última actualización` })
        .setTimestamp();
}

function buildRankingBlock(title, rows, formatter) {
    if (!rows.length) {
        return `**${title}**\nSin datos.\n`;
    }

    const content = rows.map((row, index) => formatter(row, index)).join("\n");
    return `**${title}**\n${content}\n`;
}

function buildMainRankingEmbed() {
    const topXp = db.prepare(`
        SELECT user_id, voice_xp, voice_level
        FROM voice_users
        ORDER BY voice_xp DESC
        LIMIT 10
    `).all();

    const topVoice = db.prepare(`
        SELECT user_id, total_voice_time_ms, voice_level
        FROM voice_users
        ORDER BY total_voice_time_ms DESC
        LIMIT 10
    `).all();

    const xpBlock = buildRankingBlock(
        "⭐ Top XP",
        topXp,
        (row, index) => `**${index + 1}.** <@${row.user_id}> — ${row.voice_xp} XP · Nivel ${row.voice_level}`
    );

    const voiceBlock = buildRankingBlock(
        "🎙️ Top tiempo en voz",
        topVoice,
        (row, index) => `**${index + 1}.** <@${row.user_id}> — ${formatShortDuration(row.total_voice_time_ms)}`
    );

    return new EmbedBuilder()
        .setTitle("🏆 Ranking principal")
        .setDescription([xpBlock, voiceBlock].join("\n"))
        .setColor(0xf1c40f)
        .setFooter({ text: "Top principal del servidor" })
        .setTimestamp();
}

function buildSecondaryRankingEmbed() {
    const topSocial = db.prepare(`
        SELECT user_id, total_social_voice_time_ms
        FROM voice_users
        ORDER BY total_social_voice_time_ms DESC
        LIMIT 10
    `).all();

    const topStream = db.prepare(`
        SELECT user_id, total_stream_time_ms
        FROM voice_users
        ORDER BY total_stream_time_ms DESC
        LIMIT 10
    `).all();

    const topDays = db.prepare(`
        SELECT user_id, days_connected
        FROM voice_users
        ORDER BY days_connected DESC
        LIMIT 10
    `).all();

    const socialBlock = buildRankingBlock(
        "🤝 Top social",
        topSocial,
        (row, index) => `**${index + 1}.** <@${row.user_id}> — ${formatShortDuration(row.total_social_voice_time_ms)}`
    );

    const streamBlock = buildRankingBlock(
        "🖥️ Top stream",
        topStream,
        (row, index) => `**${index + 1}.** <@${row.user_id}> — ${formatShortDuration(row.total_stream_time_ms)}`
    );

    const daysBlock = buildRankingBlock(
        "📅 Top días conectados",
        topDays,
        (row, index) => `**${index + 1}.** <@${row.user_id}> — ${row.days_connected} días`
    );

    return new EmbedBuilder()
        .setTitle("📊 Ranking secundario")
        .setDescription([socialBlock, streamBlock, daysBlock].join("\n"))
        .setColor(0x2ecc71)
        .setFooter({ text: "Actividad social, stream y constancia" })
        .setTimestamp();
}

function buildRanksEmbed() {
    const lines = config.voiceLevelRoles.length
        ? config.voiceLevelRoles.map(role =>
            `**Nivel ${role.level}** — <@&${role.roleId}> · ${role.name}`
        ).join("\n")
        : "No hay rangos configurados.";

    return new EmbedBuilder()
        .setTitle("⭐ Rangos de voz")
        .setDescription(lines)
        .setColor(0x3498db)
        .setFooter({ text: "Progresión del sistema de voz" })
        .setTimestamp();
}

async function updatePanel(client) {
    const channel = await getPanelChannel(client);
    if (!channel) return;

    const panelMessages = await ensurePanelMessages(client);
    if (!panelMessages) return;

    const overviewMessage = await channel.messages.fetch(panelMessages.overview);
    const mainRankingMessage = await channel.messages.fetch(panelMessages.mainRanking);
    const secondaryRankingMessage = await channel.messages.fetch(panelMessages.secondaryRanking);
    const ranksMessage = await channel.messages.fetch(panelMessages.ranks);

    await overviewMessage.edit({ content: "", embeds: [buildOverviewEmbed()] });
    await mainRankingMessage.edit({ content: "", embeds: [buildMainRankingEmbed()] });
    await secondaryRankingMessage.edit({ content: "", embeds: [buildSecondaryRankingEmbed()] });
    await ranksMessage.edit({ content: "", embeds: [buildRanksEmbed()] });

    console.log(`[PANEL] Panel actualizado en #${channel.name}`);
}

module.exports = {
    updatePanel,
    ensurePanelMessages
};