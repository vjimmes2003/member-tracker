function formatDuration(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) {
        return "Desconocido";
    }

    if (ms < 1000) {
        return "menos de 1 segundo";
    }

    const totalSeconds = Math.floor(ms / 1000);
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const totalHours = Math.floor(totalMinutes / 60);
    const hours = totalHours % 24;
    const days = Math.floor(totalHours / 24);

    const parts = [];

    if (days > 0) parts.push(`${days} día${days !== 1 ? "s" : ""}`);
    if (hours > 0) parts.push(`${hours} hora${hours !== 1 ? "s" : ""}`);
    if (minutes > 0) parts.push(`${minutes} minuto${minutes !== 1 ? "s" : ""}`);
    if (seconds > 0) parts.push(`${seconds} segundo${seconds !== 1 ? "s" : ""}`);

    return parts.join(", ");
}

function formatDate(date) {
    if (!date) return "Desconocido";

    return new Date(date).toLocaleString("es-ES", {
        timeZone: "Europe/Madrid"
    });
}

function truncate(text, max = 1024) {
    if (!text) return "N/A";
    if (text.length <= max) return text;
    return text.slice(0, max - 3) + "...";
}

module.exports = {
    formatDuration,
    formatDate,
    truncate
};
