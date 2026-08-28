"""SQLite database layer for the calendar app."""
import os
import sqlite3

DB_PATH = os.environ.get("CALENDAR_DB", os.path.join(os.path.dirname(__file__), "calendar.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    location TEXT DEFAULT '',
    all_day INTEGER NOT NULL DEFAULT 0,
    start_date TEXT NOT NULL,          -- YYYY-MM-DD
    start_time TEXT,                   -- HH:MM or NULL when all-day
    end_date TEXT NOT NULL,
    end_time TEXT,
    color TEXT DEFAULT 'blue',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'daily',   -- 'daily' | 'one_time'
    time TEXT,                            -- optional HH:MM for ordering
    due_date TEXT,                        -- for one_time tasks: YYYY-MM-DD
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    completed_date TEXT NOT NULL,         -- YYYY-MM-DD
    UNIQUE (task_id, completed_date)
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def get_db():
    """Return a connection; created lazily per call. Safe for single-user local use."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init_db():
    conn = get_db()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def get_setting(key, default=None):
    conn = get_db()
    try:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default
    finally:
        conn.close()


def set_setting(key, value):
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
        conn.commit()
    finally:
        conn.close()
