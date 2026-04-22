require("dotenv").config();

module.exports = {
    token: process.env.DISCORD_TOKEN,
    despedidasChannel: process.env.DESPEDIDAS_CHANNEL,
    avisosChannel: process.env.AVISOS_CHANNEL,
    voiceAnnounceChannel: process.env.VOICE_ANNOUNCE_CHANNEL || null
};
