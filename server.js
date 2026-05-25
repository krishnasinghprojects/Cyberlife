"use strict";

require("dotenv").config();

const express = require("express");
const http    = require("http");
const cors    = require("cors");
const path    = require("path");

const { initWebSocket, registerListener, sendTo, broadcast } = require("./websocket/socket");
const { loadModules }              = require("./hub/moduleLoader");
const { buildProxyRoutes }         = require("./hub/dispatch");
const { startWatchdog }            = require("./hub/watchdog");

const DEVICES = require("./stores/devices");
const METRICS = require("./stores/metrics");
const { initDB } = require("./stores/database");

// ── Config from .env ─────────────────────────────────────────────────────────
const config = {
    HUB_IP:               process.env.HUB_IP               || "0.0.0.0",
    HUB_PORT:             parseInt(process.env.HUB_PORT)    || 8000,
    NODE_UID:             process.env.NODE_UID              || "Hub",
    NODE_NAME:            process.env.NODE_NAME             || "Hub",
    NODE_SHELL:           process.env.NODE_SHELL            || "/bin/zsh",
    ENABLED_MODULES:      (process.env.ENABLED_MODULES || "").split(",").map(s => s.trim()).filter(Boolean),
    HEARTBEAT_TIMEOUT_MS: parseInt(process.env.HEARTBEAT_TIMEOUT_MS) || 60_000,
    WATCHDOG_INTERVAL_MS: parseInt(process.env.WATCHDOG_INTERVAL_MS) || 15_000,
    METRICS_INTERVAL_MS:  parseInt(process.env.METRICS_INTERVAL_MS)  || 5_000,

    // Inference engine (passed through to module init if enabled locally)
    OLLAMA_URL:           process.env.OLLAMA_URL,
    OLLAMA_DEFAULT_MODEL: process.env.OLLAMA_DEFAULT_MODEL,
    OLLAMA_MODELS:        process.env.OLLAMA_MODELS,
    OLLAMA_SYSTEM_PROMPT: process.env.OLLAMA_SYSTEM_PROMPT
};

// ── Express + HTTP ───────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// ── Static Routes (registration, monitoring, metrics ingestion) ──────────────
app.use("/", require("./routes/register"));
app.use(require("./routes/monitoring"));
app.use("/", require("./routes/metrics"));
app.use("/api/chats", require("./routes/chats"));
app.use("/api/chats", require("./routes/agent"));

// ── Static Dashboard ─────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ── Expose config for route handlers ─────────────────────────────────────────
app.set("hubConfig", config);

// ── WebSocket ────────────────────────────────────────────────────────────────
initWebSocket(server);

// ── Boot ─────────────────────────────────────────────────────────────────────
(async () => {
    
    await initDB();
    console.log("[DATABASE] SQLite Initialized");

    const { run, query } = require("./stores/database");

    // 0. Load existing devices from DB to memory
    try {
        const rows = await query(`SELECT * FROM devices`);
        for (const r of rows) {
            let caps = [];
            try { caps = JSON.parse(r.capabilities || "[]"); } catch (e) {}
            DEVICES[r.uid] = {
                uid: r.uid,
                name: r.name,
                os: r.os,
                ip: r.ip,
                port: r.port,
                capabilities: caps,
                status: "offline", // assume offline until heartbeat
                lastHeartbeat: 0
            };
        }
        console.log(`[DATABASE] Loaded ${rows.length} devices into memory`);
    } catch (e) {
        console.error("[DB ERROR] Failed to load devices:", e);
    }

    // 1. Self-register the hub into the device store
    DEVICES[config.NODE_UID] = {
        uid:           config.NODE_UID,
        name:          config.NODE_NAME,
        os:            "macOS",
        ip:            config.HUB_IP,
        port:          config.HUB_PORT,
        capabilities:  [],   // filled dynamically below
        status:        "online",
        lastHeartbeat: Date.now()
    };

    try {
        await run(`
            INSERT INTO devices (uid, name, os, ip, port, capabilities, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(uid) DO UPDATE SET 
                name=excluded.name, 
                os=excluded.os, 
                ip=excluded.ip,
                port=excluded.port,
                capabilities=excluded.capabilities,
                last_seen=CURRENT_TIMESTAMP
        `, [config.NODE_UID, config.NODE_NAME, "macOS", config.HUB_IP, config.HUB_PORT, "[]"]);
    } catch (e) {
        console.error("[DB ERROR] Hub failed to register in DB:", e);
    }

    // 2. Load modules
    //    system-monitor gets a special hook: reportMetrics writes directly
    //    into the METRICS store and broadcasts, instead of HTTP-pushing.
    const reportMetrics = async (metrics) => {
        METRICS[config.NODE_UID] = { ...metrics, timestamp: Date.now() };
        DEVICES[config.NODE_UID].lastHeartbeat = Date.now();
        
        try {
            await run(`
                INSERT INTO metrics_log (device_uid, cpu_usage, ram_percent, disk_percent)
                VALUES (?, ?, ?, ?)
            `, [config.NODE_UID, metrics.cpu || 0, metrics.ram || 0, metrics.disk || 0]);
        } catch (e) {}

        broadcast({
            type:     "metrics-update",
            deviceId: config.NODE_UID,
            metrics:  METRICS[config.NODE_UID]
        });
    };

    const modules = await loadModules(config.ENABLED_MODULES, config, { reportMetrics, registerListener, sendTo });

    // 3. Populate hub's capability list from loaded modules
    const capabilities = modules.map(m => m.capability);
    // Always include "hub" capability for identification
    capabilities.unshift("hub");
    DEVICES[config.NODE_UID].capabilities = capabilities;
    
    try {
        await run(`UPDATE devices SET capabilities = ? WHERE uid = ?`, [JSON.stringify(capabilities), config.NODE_UID]);
    } catch (e) {}

    // 4. Mount module routes locally (for hub self-execution)
    for (const mod of modules) {
        if (mod.routes) app.use(mod.routes);
    }

    // 5. Build proxy/dispatch routes from ALL known module proxy definitions
    //    This includes modules the hub DOESN'T have loaded — we still need
    //    to proxy for remote nodes that DO have them.
    //    Load ALL module definitions to discover their proxy routes.
    const allModuleNames = [
        "command-executor",
        "system-monitor",
        "inference-engine",
        "ssh-engine",
        "docker-manager"
    ];

    const allModules = [];
    for (const name of allModuleNames) {
        try {
            allModules.push(require(`./modules/${name}`));
        } catch (_) { /* module not installed, skip */ }
    }

    buildProxyRoutes(app, allModules, config.NODE_UID);

    // 6. Start heartbeat watchdog
    startWatchdog(config.NODE_UID, config.HEARTBEAT_TIMEOUT_MS, config.WATCHDOG_INTERVAL_MS);

    // 7. Listen
    server.listen(config.HUB_PORT, "0.0.0.0", () => {
        console.log(`[CYBERLIFE HUB ONLINE] ${config.NODE_UID} @ ${config.HUB_IP}:${config.HUB_PORT}`);
        console.log(`[CAPABILITIES] ${capabilities.join(", ")}`);
    });

})();