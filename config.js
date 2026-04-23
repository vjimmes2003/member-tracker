require("dotenv").config();

module.exports = {
    token: process.env.DISCORD_TOKEN,
    despedidasChannel: process.env.DESPEDIDAS_CHANNEL,
    avisosChannel: process.env.AVISOS_CHANNEL,
    voiceAnnounceChannel: process.env.VOICE_ANNOUNCE_CHANNEL || null,
    panelChannel: process.env.PANEL_CHANNEL || null,
    panelUpdateMinutes: Number(process.env.PANEL_UPDATE_MINUTES || 5),

    voiceLevelRoles: [
        { level: 1, roleId: process.env.VOICE_ROLE_LVL_1 || null, name: "🎧 Recluta de Voz" },
        { level: 5, roleId: process.env.VOICE_ROLE_LVL_5 || null, name: "🗣️ Explorador Sonoro" },
        { level: 10, roleId: process.env.VOICE_ROLE_LVL_10 || null, name: "📡 Operador de Escuadra" },
        { level: 15, roleId: process.env.VOICE_ROLE_LVL_15 || null, name: "🔥 Veterano de Canal" },
        { level: 25, roleId: process.env.VOICE_ROLE_LVL_25 || null, name: "⚔️ Comandante de Voz" },
        { level: 35, roleId: process.env.VOICE_ROLE_LVL_35 || null, name: "🛡️ Capitán de Frecuencia" },
        { level: 50, roleId: process.env.VOICE_ROLE_LVL_50 || null, name: "👑 Señor del Canal" },
        { level: 65, roleId: process.env.VOICE_ROLE_LVL_65 || null, name: "💠 Maestro de Resonancia" },
        { level: 80, roleId: process.env.VOICE_ROLE_LVL_80 || null, name: "🌌 Titán de la Voz" },
        { level: 100, roleId: process.env.VOICE_ROLE_LVL_100 || null, name: "🚀 Leyenda del Micro" }
    ].filter(entry => entry.roleId)
};