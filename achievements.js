module.exports = [

{
id: "first_voice",
name: "Primera conexión",
desc: "5 minutos en voz",
xp: 5,
check: user => user.total_voice_time_ms >= 5 * 60000
},

{
id: "voice_1h",
name: "Conversador",
desc: "1 hora en voz",
xp: 20,
check: user => user.total_voice_time_ms >= 60 * 60000
},

{
id: "voice_10h",
name: "Veterano",
desc: "10 horas en voz",
xp: 50,
check: user => user.total_voice_time_ms >= 10 * 3600000
},

{
id: "voice_50h",
name: "Habitante",
desc: "50 horas en voz",
xp: 120,
check: user => user.total_voice_time_ms >= 50 * 3600000
},

{
id: "voice_200h",
name: "Leyenda",
desc: "200 horas en voz",
xp: 300,
check: user => user.total_voice_time_ms >= 200 * 3600000
},

{
id: "social_30m",
name: "No estás solo",
desc: "30 min acompañado",
xp: 15,
check: user => user.total_social_voice_time_ms >= 30 * 60000
},

{
id: "social_5h",
name: "Social",
desc: "5 horas acompañado",
xp: 50,
check: user => user.total_social_voice_time_ms >= 5 * 3600000
},

{
id: "stream_30m",
name: "Streamer",
desc: "30 min compartiendo pantalla",
xp: 20,
check: user => user.total_stream_time_ms >= 30 * 60000
},

{
id: "stream_5h",
name: "Creador",
desc: "5 horas compartiendo pantalla",
xp: 80,
check: user => user.total_stream_time_ms >= 5 * 3600000
},

{
id: "days_5",
name: "Constante",
desc: "5 días conectado",
xp: 30,
check: user => user.days_connected >= 5
},

{
id: "days_20",
name: "Veterano del server",
desc: "20 días conectado",
xp: 100,
check: user => user.days_connected >= 20
}

]