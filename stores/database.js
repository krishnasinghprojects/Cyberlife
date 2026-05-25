"use strict";

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure db directory exists
const dbDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'cyberlife.db');
const db = new sqlite3.Database(dbPath);

function initDB() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Devices Table
            db.run(`CREATE TABLE IF NOT EXISTS devices (
                uid TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                os TEXT NOT NULL,
                ip TEXT NOT NULL,
                port INTEGER,
                capabilities TEXT,
                last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Chat Sessions
            db.run(`CREATE TABLE IF NOT EXISTS chat_sessions (
                id TEXT PRIMARY KEY,
                title TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Chat Messages
            db.run(`CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
            )`);

            // Metrics Log
            db.run(`CREATE TABLE IF NOT EXISTS metrics_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_uid TEXT NOT NULL,
                cpu_usage REAL,
                ram_percent REAL,
                disk_percent REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (device_uid) REFERENCES devices(uid) ON DELETE CASCADE
            )`);

            // ── Migrations ───────────────────────────────────────────
            // Add agentic workflow columns to chat_messages
            // (safe: checks if columns exist before ALTER TABLE)
            db.all(`PRAGMA table_info(chat_messages)`, [], (err, columns) => {
                if (err) {
                    console.error("[DB MIGRATION] Failed to read chat_messages schema:", err);
                    startMetricsPruning();
                    resolve();
                    return;
                }

                const names = columns.map(c => c.name);
                let pending = 0;

                const done = () => {
                    pending--;
                    if (pending <= 0) {
                        console.log("[DB MIGRATION] Schema up to date");
                        startMetricsPruning();
                        resolve();
                    }
                };

                if (!names.includes('tool_calls')) {
                    pending++;
                    db.run(`ALTER TABLE chat_messages ADD COLUMN tool_calls TEXT`, done);
                }

                if (!names.includes('message_type')) {
                    pending++;
                    db.run(`ALTER TABLE chat_messages ADD COLUMN message_type TEXT DEFAULT 'text'`, done);
                }

                if (pending === 0) {
                    startMetricsPruning();
                    resolve();
                }
            });
        });
    });
}

// Prune metrics older than 7 days every hour
function startMetricsPruning() {
    setInterval(async () => {
        try {
            await run(`DELETE FROM metrics_log WHERE created_at < datetime('now', '-7 days')`);
            console.log("[DB] Pruned old metrics logs");
        } catch (e) {
            console.error("[DB ERROR] Failed to prune metrics:", e);
        }
    }, 60 * 60 * 1000); // 1 hour
}

// ── Database Helpers ─────────────────────────────────────────────────────────

function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this); // this.lastID, this.changes
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

module.exports = {
    db,
    initDB,
    query,
    run,
    get
};
