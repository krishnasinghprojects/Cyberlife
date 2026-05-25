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
            )`, (err) => {
                if (err) reject(err);
                else {
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
