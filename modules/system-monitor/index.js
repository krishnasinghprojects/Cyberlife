"use strict";

const si = require("systeminformation");
const os = require("os");

let metricsInterval = null;

// ── Core Handler ─────────────────────────────────────────────────────────────
async function collectMetrics() {
    const [load, mem, disks] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize()
    ]);

    const primaryDisk = disks.sort((a, b) => b.size - a.size)[0] || {};

    return {
        cpu: Math.round(load.currentLoad),
        ram: {
            used:    mem.used,
            total:   mem.total,
            percent: Math.round((mem.used / mem.total) * 100)
        },
        disk: {
            used:    primaryDisk.used  || 0,
            total:   primaryDisk.size  || 0,
            percent: Math.round(primaryDisk.use || 0)
        },
        platform: process.platform,
        uptime:   os.uptime()
    };
}

// ── Module Contract ──────────────────────────────────────────────────────────
module.exports = {
    name:       "system-monitor",
    capability: "metrics",

    // No HTTP routes — this module is a background service that pushes metrics.
    routes: null,
    proxy:  [],

    // collectMetrics is exported so both agent.js and server.js can call it
    // to obtain a snapshot on demand.
    collectMetrics,

    // init starts the periodic metrics loop.
    // Caller passes a `reportMetrics(metrics)` callback that decides
    // WHERE the data goes (HTTP push for agents, direct store write for hub).
    init: async (config, { reportMetrics } = {}) => {

        if (!reportMetrics) return;

        const intervalMs = parseInt(config.METRICS_INTERVAL_MS) || 5_000;

        // Collect once immediately, then on interval
        const tick = async () => {
            try {
                const metrics = await collectMetrics();
                await reportMetrics(metrics);
            } catch (err) {
                console.warn("[METRICS]", err.message);
            }
        };

        await tick();
        metricsInterval = setInterval(tick, intervalMs);
    },

    cleanup: async () => {
        if (metricsInterval) clearInterval(metricsInterval);
    }
};
