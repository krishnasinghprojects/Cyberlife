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
app.use(require("./routes/register"));
app.use(require("./routes/monitoring"));
app.use(require("./routes/metrics"));

// ── Static Dashboard ─────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ── WebSocket ────────────────────────────────────────────────────────────────
initWebSocket(server);

// ── Boot ─────────────────────────────────────────────────────────────────────
(async () => {

    // 1. Self-register the hub into the device store
    DEVICES[config.NODE_UID] = {
        uid:           config.NODE_UID,
        name:          config.NODE_NAME,
        ip:            config.HUB_IP,
        port:          config.HUB_PORT,
        capabilities:  [],   // filled dynamically below
        status:        "online",
        lastHeartbeat: Date.now()
    };

    // 2. Load modules
    //    system-monitor gets a special hook: reportMetrics writes directly
    //    into the METRICS store and broadcasts, instead of HTTP-pushing.
    const reportMetrics = (metrics) => {
        METRICS[config.NODE_UID] = { ...metrics, timestamp: Date.now() };
        DEVICES[config.NODE_UID].lastHeartbeat = Date.now();
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
        "inference-engine"
        // Future: "docker-manager", "ssh-engine"
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