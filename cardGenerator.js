const { createCanvas, loadImage } = require("canvas");

async function generateVoiceCard(user, stats, progress, avatarUrl) {
    const canvas = createCanvas(900, 280);
    const ctx = canvas.getContext("2d");

    // Fondo
    ctx.fillStyle = "#2b2d31";
    ctx.fillRect(0, 0, 900, 280);

    // Panel interior suave
    ctx.fillStyle = "#313338";
    ctx.fillRect(20, 20, 860, 240);

    // Avatar
    const avatar = await loadImage(avatarUrl);
    ctx.drawImage(avatar, 40, 60, 160, 160);

    // Nombre
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText(user.username, 240, 80);

    // Nivel
    ctx.fillStyle = "#d7dce2";
    ctx.font = "24px sans-serif";
    ctx.fillText(`Nivel ${stats.voice_level}`, 240, 120);

    // Barra XP
    const barX = 240;
    const barY = 150;
    const barWidth = 450;
    const barHeight = 28;

    ctx.fillStyle = "#4a4d55";
    ctx.fillRect(barX, barY, barWidth, barHeight);

    ctx.fillStyle = "#57F287";
    ctx.fillRect(barX, barY, Math.max(0, Math.min(barWidth, barWidth * (progress.percent / 100))), barHeight);

    // Texto XP
    ctx.fillStyle = "#ffffff";
    ctx.font = "20px sans-serif";
    ctx.fillText(`${progress.current} / ${progress.next} XP`, 240, 205);

    // Bloque derecho
    const rightX = 730;
    const startY = 80;
    const gap = 40;

    ctx.fillStyle = "#ffffff";
    ctx.font = "22px sans-serif";
    ctx.fillText(`${Math.floor(stats.total_voice_time_ms / 3600000)}h voz`, rightX, startY);
    ctx.fillText(`${Math.floor(stats.total_social_voice_time_ms / 3600000)}h social`, rightX, startY + gap);
    ctx.fillText(`${Math.floor(stats.total_stream_time_ms / 3600000)}h stream`, rightX, startY + gap * 2);
    ctx.fillText(`${stats.days_connected} días`, rightX, startY + gap * 3);

    return canvas.toBuffer("image/png");
}

module.exports = { generateVoiceCard };