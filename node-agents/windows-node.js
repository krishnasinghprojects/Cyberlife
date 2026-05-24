/**
 * Cyberlife Node Agent — DellG15 (Windows)
 * ─────────────────────────────────────────────────────────────────────────────
 * Deploy this file (and package.json) on the Dell G15 laptop.
 *
 * Setup:
 *   1. Edit CONFIG below (HUB_URL, PORT, UID, NAME)
 *   2. npm install
 *   3. node windows-node.js
 *
 * What this does:
 *   • Registers itself with the Cyberlife Hub
 *   • Sends a heartbeat every 30 s so the hub knows it is alive
 *   • Pushes CPU / RAM / disk metrics every 5 s (shown live on dashboard)
 *   • Exposes POST /execute-command so the hub can run shell commands here
 */

"use strict";

const express = require("express");
const axios   = require("axios");
const si      = require("systeminformation");
const os      = require("os");
const { exec } = require("child_process");

/* ─── CONFIGURATION — edit these ─────────────────────────────────────────── */
const CONFIG = {
    HUB_URL:  "http://10.120.0.250:8000",   // ← MacMini hub — static IP
    PORT:     3001,                          // ← port this agent listens on
    UID:      "DellG15",                     // ← unique ID for this machine
    NAME:     "Dell G15",                    // ← display name on dashboard

    // Shell used for execute-command.
    // "powershell.exe" for PowerShell, or true to use cmd.exe
    SHELL: "powershell.exe",

    HEARTBEAT_INTERVAL_MS: 30_000,   // 30 s
    METRICS_INTERVAL_MS:    5_000,   //  5 s

    CAPABILITIES: ["execute-command", "metrics"],
};
/* ────────────────────────────────────────────────────────────────────────── */

const app = express();
app.use(express.json());

/* ─── HELPERS ─────────────────────────────────────────────────────────────── */
function getLocalIP() {
    for (const iface of Object.values(os.networkInterfaces())) {
        for (const addr of iface) {
            if (addr.family === "IPv4" && !addr.internal) return addr.address;
        }
    }
    return "127.0.0.1";
}

async function collectMetrics() {
    const [load, mem, disks] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize()
    ]);

    // Pick the primary disk (largest, or first)
    const primaryDisk = disks.sort((a, b) => b.size - a.size)[0] || {};

    return {
        cpu:  Math.round(load.currentLoad),
        ram:  {
            used:    mem.used,
            total:   mem.total,
            percent: Math.round((mem.used / mem.total) * 100)
        },
        disk: {
            used:    primaryDisk.used  || 0,
            total:   primaryDisk.size  || 0,
            percent: Math.round(primaryDisk.use || 0)
        },
        platform: "win32",
        uptime:   os.uptime()
    };
}

/* ─── REGISTER WITH HUB ───────────────────────────────────────────────────── */
async function register() {
    try {
        await axios.post(`${CONFIG.HUB_URL}/register`, {
            uid:          CONFIG.UID,
            name:         CONFIG.NAME,
            ip:           getLocalIP(),
            port:         CONFIG.PORT,
            capabilities: CONFIG.CAPABILITIES
        });
        console.log("[REGISTERED] Connected to hub:", CONFIG.HUB_URL);
    } catch (err) {
        console.error("[REGISTER FAILED]", err.message, "— retrying in 10 s…");
        setTimeout(register, 10_000);
    }
}

/* ─── HEARTBEAT ───────────────────────────────────────────────────────────── */
async function heartbeat() {
    try {
        await axios.post(`${CONFIG.HUB_URL}/heartbeat`, {
            uid: CONFIG.UID,
            ip:  getLocalIP()
        });
    } catch (err) {
        console.warn("[HEARTBEAT FAILED]", err.message);
    }
}

/* ─── METRICS PUSH ────────────────────────────────────────────────────────── */
async function pushMetrics() {
    try {
        const metrics = await collectMetrics();
        await axios.post(`${CONFIG.HUB_URL}/metrics/${CONFIG.UID}`, metrics);
    } catch (err) {
        console.warn("[METRICS FAILED]", err.message);
    }
}

/* ─── ROUTES ──────────────────────────────────────────────────────────────── */

// Hub calls this to run a command on this machine
app.post("/execute-command", (req, res) => {

    const { command } = req.body;

    if (!command || typeof command !== "string") {
        return res.status(400).json({ error: "command field required" });
    }

    console.log("[CMD]", command);

    exec(command, { shell: CONFIG.SHELL, timeout: 30_000, windowsHide: true },
        (err, stdout, stderr) => {
            res.json({
                stdout: stdout || "",
                stderr: stderr || "",
                error:  err ? err.message : null
            });
        }
    );
});

// Health check (optional)
app.get("/ping", (_req, res) => res.json({ ok: true, uid: CONFIG.UID }));

/* ─── START ───────────────────────────────────────────────────────────────── */
app.listen(CONFIG.PORT, "0.0.0.0", async () => {
    console.log(`[CYBERLIFE AGENT] DellG15 — port ${CONFIG.PORT}`);

    await register();

    setInterval(heartbeat,    CONFIG.HEARTBEAT_INTERVAL_MS);
    setInterval(pushMetrics,  CONFIG.METRICS_INTERVAL_MS);
});
