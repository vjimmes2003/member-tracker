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

function formatShortDuration(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return "0m";

    const totalSeconds = Math.floor(ms / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const minutes = totalMinutes % 60;

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
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

function getMadridDateKey(date = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Madrid",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(date);
}

function xpForLevel(level) {
    if (level <= 0) return 0;
    return 30 * level * (level + 1);
}

function levelFromXp(xp) {
    let level = 0;
    while (xp >= xpForLevel(level + 1)) {
        level++;
    }
    return level;
}

function getXpProgress(xp) {
    const level = levelFromXp(xp);
    const currentFloor = xpForLevel(level);
    const nextFloor = xpForLevel(level + 1);
    const progress = xp - currentFloor;
    const needed = nextFloor - currentFloor;
    const remaining = nextFloor - xp;
    const percent = needed <= 0 ? 100 : Math.max(0, Math.min(100, Math.floor((progress / needed) * 100)));

    return {
        level,
        currentFloor,
        nextFloor,
        progress,
        needed,
        remaining,
        percent
    };
}

function makeProgressBar(percent, size = 12) {
    const safe = Math.max(0, Math.min(100, percent));
    const filled = Math.round((safe / 100) * size);
    const empty = size - filled;
    return "🟩".repeat(filled) + "⬜".repeat(empty);
}

function formatHours(hours) {
    if (hours === null || hours === undefined || isNaN(hours)) {
        return "Desconocido";
    }

    if (hours < 1) {
        return `${Math.round(hours * 60)} min`;
    }

    return `${hours.toFixed(2)} h`;
}

module.exports = {
    formatDuration,
    formatShortDuration,
    formatDate,
    truncate,
    getMadridDateKey,
    xpForLevel,
    levelFromXp,
    getXpProgress,
    makeProgressBar,
    formatHours
};