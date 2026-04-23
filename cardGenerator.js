const { createCanvas, loadImage, registerFont } = require("canvas");
registerFont("/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf", {
    family: "NotoEmoji"
});

async function generateVoiceCard(user, stats, progress, avatarUrl) {

const canvas = createCanvas(900, 280)
const ctx = canvas.getContext("2d")



// fondo
ctx.fillStyle = "#2b2d31"
ctx.fillRect(0,0,900,280)

// avatar
const avatar = await loadImage(avatarUrl)
ctx.drawImage(avatar,40,60,160,160)

// nombre
ctx.fillStyle = "#ffffff"
ctx.font = "30px sans-serif"
ctx.fillText(user.username,240,80)

// nivel
ctx.font = "22px sans-serif"
ctx.fillText(`Nivel ${stats.voice_level}`,240,120)

// barra XP
const barWidth = 450
const barHeight = 28

ctx.fillStyle = "#444"
ctx.fillRect(240,150,barWidth,barHeight)

ctx.fillStyle = "#57F287"
ctx.fillRect(
240,
150,
barWidth*(progress.percent/100),
barHeight
)

// texto XP
ctx.fillStyle="#fff"
ctx.font = "22px NotoEmoji";
ctx.fillText(`${progress.current} / ${progress.next} XP`,240,200)

// estadísticas derecha
ctx.font="22px NotoEmoji";
ctx.fillText(
`⏱ ${Math.floor(stats.total_voice_time_ms/3600000)}h voz`,
700,
80
)

ctx.fillText(
`🤝 ${Math.floor(stats.total_social_voice_time_ms/3600000)}h social`,
700,
120
)

ctx.fillText(
`🖥 ${Math.floor(stats.total_stream_time_ms/3600000)}h stream`,
700,
160
)

ctx.fillText(
`📅 ${stats.days_connected} días`,
700,
200
)

return canvas.toBuffer()

}

module.exports = { generateVoiceCard }