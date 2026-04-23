const db = require("./database")
const achievements = require("./achievements")

async function checkAchievements(member, client) {

const user = db.prepare(`
SELECT *
FROM voice_users
WHERE user_id = ?
`).get(member.id)

if (!user) return

for (const ach of achievements) {

const unlocked = db.prepare(`
SELECT 1
FROM voice_achievements
WHERE user_id = ?
AND achievement_id = ?
`).get(member.id, ach.id)

if (unlocked) continue

if (!ach.check(user)) continue

db.prepare(`
INSERT INTO voice_achievements
(user_id, achievement_id, unlocked_at)
VALUES (?, ?, ?)
`).run(member.id, ach.id, new Date().toISOString())

db.prepare(`
UPDATE voice_users
SET voice_xp = voice_xp + ?
WHERE user_id = ?
`).run(ach.xp, member.id)

const channel = await client.channels.fetch(process.env.VOICE_ANNOUNCE_CHANNEL).catch(()=>null)

if (channel) {
channel.send(
`🏆 **${member.user.username}** ha desbloqueado un logro\n\n`+
`**${ach.name}**\n${ach.desc}\n\n`+
`✨ +${ach.xp} XP`
)
}

}

}

module.exports = { checkAchievements }