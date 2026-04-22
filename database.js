const Database = require("better-sqlite3");
const db = new Database("./data/tracker.db");

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
    voice_sessions_count INTEGER DEFAULT 0,
    first_voice_join_at TEXT,
    last_voice_join_at TEXT,
    last_voice_leave_at TEXT
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
    duration_ms INTEGER DEFAULT 0
)
`).run();

module.exports = db;
