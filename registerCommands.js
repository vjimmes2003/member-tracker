require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
    new SlashCommandBuilder()
        .setName("voz-top-tiempo")
        .setDescription("Muestra el ranking de usuarios con más tiempo en voz"),

    new SlashCommandBuilder()
        .setName("voz-top-dias")
        .setDescription("Muestra el ranking de usuarios con más días activos en voz"),

    new SlashCommandBuilder()
        .setName("voz-perfil")
        .setDescription("Muestra la tarjeta de voz de un usuario")
        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuario a consultar")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("voz-nivel")
        .setDescription("Muestra el progreso de nivel de voz de un usuario")
        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuario a consultar")
                .setRequired(false)
        )
].map(command => command.toJSON());

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
        console.error("Error registrando comandos:", error);
    }
})();