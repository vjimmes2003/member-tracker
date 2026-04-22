const Database = require("better-sqlite3");
const db = new Database("./data/tracker.db");

db.pragma("journal_mode = WAL");

function columnExists(table, column) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    return columns.some(col => col.name === column);
}

function ensureColumn(table, column, definition) {
    if (!columnExists(table, column)) {
        db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
    }
}

db.prepare(`
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    is_bot INTEGER,
    created_at TEXT,
    first_seen_at TEXT,
    last_join_at TEXT,
    last_leave_at TEXT,
    join_count INTEGER DEFAULT 0,
    leave_count INTEGER DEFAULT 0,
    total_time_ms INTEGER DEFAULT 0
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    joined_at TEXT,
    left_at TEXT,
    duration_ms INTEGER
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS names (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    type TEXT,
    value TEXT,
    seen_at TEXT
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS voice_users (
    user_id TEXT PRIMARY KEY,
    total_voice_time_ms INTEGER DEFAULT 0,
    total_stream_time_ms INTEGER DEFAULT 0,
    voice_sessions_count INTEGER DEFAULT 0,
    first_voice_join_at TEXT,
    last_voice_join_at TEXT,
    last_voice_leave_at TEXT,
    voice_xp INTEGER DEFAULT 0,
    voice_level INTEGER DEFAULT 0,
    days_connected INTEGER DEFAULT 0,
    xp_seeded INTEGER DEFAULT 0
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS voice_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    joined_at TEXT NOT NULL,
    left_at TEXT,
    duration_ms INTEGER DEFAULT 0,
    tracked_voice_ms INTEGER DEFAULT 0,
    tracked_stream_ms INTEGER DEFAULT 0,
    xp_earned INTEGER DEFAULT 0,
    last_tick_at TEXT
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS voice_daily_stats (
    user_id TEXT NOT NULL,
    stat_date TEXT NOT NULL,
    voice_minutes INTEGER DEFAULT 0,
    stream_minutes INTEGER DEFAULT 0,
    day_counted INTEGER DEFAULT 0,
    mission_30_done INTEGER DEFAULT 0,
    mission_60_done INTEGER DEFAULT 0,
    mission_stream_15_done INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, stat_date)
)
`).run();

ensureColumn("voice_users", "total_stream_time_ms", "INTEGER DEFAULT 0");
ensureColumn("voice_users", "voice_xp", "INTEGER DEFAULT 0");
ensureColumn("voice_users", "voice_level", "INTEGER DEFAULT 0");
ensureColumn("voice_users", "days_connected", "INTEGER DEFAULT 0");
ensureColumn("voice_users", "xp_seeded", "INTEGER DEFAULT 0");

ensureColumn("voice_sessions", "tracked_voice_ms", "INTEGER DEFAULT 0");
ensureColumn("voice_sessions", "tracked_stream_ms", "INTEGER DEFAULT 0");
ensureColumn("voice_sessions", "xp_earned", "INTEGER DEFAULT 0");
ensureColumn("voice_sessions", "last_tick_at", "TEXT");

module.exports = db;