require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [

new SlashCommandBuilder()
.setName("voz-top-tiempo")
.setDescription("Muestra el ranking de usuarios con más tiempo en voz"),

new SlashCommandBuilder()
.setName("voz-top-uniones")
.setDescription("Muestra el ranking de usuarios que más entran a voz"),

new SlashCommandBuilder()
.setName("voz-perfil")
.setDescription("Muestra estadísticas de voz de un usuario")
.addUserOption(option =>
option.setName("usuario")
.setDescription("Usuario a consultar")
.setRequired(false)
)

].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
try {

console.log("Registrando comandos slash...");

await rest.put(
Routes.applicationCommands(process.env.CLIENT_ID),
{ body: commands }
);

console.log("Comandos registrados correctamente");

} catch (error) {
console.error(error);
}
})();
