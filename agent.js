"use strict";

require("dotenv").config();

const express = require("express");
const axios   = require("axios");
const os      = require("os");
const path    = require("path");

const { loadModules } = require("./hub/moduleLoader");

// ── Config from .env ─────────────────────────────────────────────────────────
const config = {
    HUB_URL:              process.env.HUB_URL,
    NODE_PORT:            parseInt(process.env.NODE_PORT)            || 3001,
    NODE_UID:             process.env.NODE_UID                      || "UnknownNode",
    NODE_NAME:            process.env.NODE_NAME                     || "Unknown Node",
    NODE_SHELL:           process.env.NODE_SHELL                    || "/bin/zsh",
    ENABLED_MODULES:      (process.env.ENABLED_MODULES || "").split(",").map(s => s.trim()).filter(Boolean),
    HEARTBEAT_INTERVAL_MS: parseInt(process.env.HEARTBEAT_INTERVAL_MS) || 30_000,
    METRICS_INTERVAL_MS:   parseInt(process.env.METRICS_INTERVAL_MS)   || 5_000,

    // Inference engine (passed through to module init)
    OLLAMA_URL:           process.env.OLLAMA_URL,
    OLLAMA_DEFAULT_MODEL: process.env.OLLAMA_DEFAULT_MODEL,
    OLLAMA_MODELS:        process.env.OLLAMA_MODELS,
    OLLAMA_SYSTEM_PROMPT: process.env.OLLAMA_SYSTEM_PROMPT
};

if (!config.HUB_URL) {
    console.error("[FATAL] HUB_URL is not set in .env");
    process.exit(1);
}

// ── Express ──────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// ── Helpers ──────────────────────────────────────────────────────────────────
function getLocalIP() {
    for (const iface of Object.values(os.networkInterfaces())) {
        for (const addr of iface) {
            if (addr.family === "IPv4" && !addr.internal) return addr.address;
        }
    }
    return "127.0.0.1";
}

// ── Hub Communication ────────────────────────────────────────────────────────

let capabilities = []; // Stored globally for recovery re-registration

async function register(caps = capabilities) {
    try {
        await axios.post(`${config.HUB_URL}/register`, {
            uid:          config.NODE_UID,
            name:         config.NODE_NAME,
            ip:           getLocalIP(),
            port:         config.NODE_PORT,
            capabilities: caps
        });
        console.log("[REGISTERED] Connected to hub:", config.HUB_URL);
    } catch (err) {
        console.error("[REGISTER FAILED]", err.message, "— retrying in 10s");
        setTimeout(() => register(capabilities), 10_000);
    }
}

async function heartbeat() {
    try {
        await axios.post(`${config.HUB_URL}/heartbeat`, {
            uid: config.NODE_UID,
            ip:  getLocalIP()
        });
    } catch (err) {
        console.warn("[HEARTBEAT FAILED]", err.message);
        
        // If the hub returns 404, it means it restarted and wiped its in-memory store.
        // We must re-register immediately to recover our connection.
        if (err.response && err.response.status === 404) {
            console.log("[RECOVERY] Hub lost registration state. Re-registering...");
            register();
        }
    }
}

// Health check
app.get("/ping", (_req, res) => res.json({ ok: true, uid: config.NODE_UID }));

// ── Boot ─────────────────────────────────────────────────────────────────────
(async () => {

    // 1. Load modules with hooks
    //    system-monitor gets a reportMetrics hook that pushes to the hub via HTTP
    const reportMetrics = async (metrics) => {
        try {
            await axios.post(
                `${config.HUB_URL}/metrics/${config.NODE_UID}`,
                metrics
            );
        } catch (err) {
            console.warn("[METRICS PUSH]", err.message);
        }
    };

    const modules = await loadModules(config.ENABLED_MODULES, config, { reportMetrics });

    // 2. Mount module routes on this agent's Express app
    for (const mod of modules) {
        if (mod.routes) app.use(mod.routes);
    }

    // 3. Build capabilities list from loaded modules
    capabilities = modules.map(m => m.capability);

    // 4. Start the agent
    app.listen(config.NODE_PORT, "0.0.0.0", async () => {
        console.log(`[CYBERLIFE AGENT] ${config.NODE_UID} — port ${config.NODE_PORT}`);
        console.log(`[CAPABILITIES] ${capabilities.join(", ")}`);

        await register();

        setInterval(heartbeat, config.HEARTBEAT_INTERVAL_MS);
    });

})();
