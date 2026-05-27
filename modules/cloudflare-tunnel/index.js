"use strict";

const express = require("express");
const { spawn } = require("child_process");
const { downloadCloudflared } = require("./downloader");

const router = express.Router();
const activeProcesses = {}; // tunnelId -> ChildProcess

router.post("/tunnels/start", async (req, res) => {
    try {
        const { port, token, tunnelId } = req.body;

        if (!port || !token || !tunnelId) {
            return res.status(400).json({ error: "Missing port, token, or tunnelId" });
        }

        const binPath = await downloadCloudflared();

        console.log(`[TUNNEL] Starting cloudflared for port ${port}...`);

        // cloudflared tunnel run --token <token>
        const cfProcess = spawn(binPath, ["tunnel", "--url", `http://localhost:${port}`, "run", "--token", token], {
            stdio: "ignore", // Or pipe to logs if we want
            detached: true
        });

        activeProcesses[tunnelId] = cfProcess;

        cfProcess.on("exit", (code) => {
            console.log(`[TUNNEL] Process ${tunnelId} exited with code ${code}`);
            delete activeProcesses[tunnelId];
        });

        res.json({ success: true, pid: cfProcess.pid });

    } catch (err) {
        console.error("[TUNNEL] Start Error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post("/tunnels/stop/:tunnelId", (req, res) => {
    const { tunnelId } = req.params;
    const cfProcess = activeProcesses[tunnelId];

    if (cfProcess) {
        try {
            process.kill(-cfProcess.pid); // Kill process group if detached
        } catch (e) {
            try { cfProcess.kill(); } catch(e2) {}
        }
        delete activeProcesses[tunnelId];
    }

    res.json({ success: true });
});

module.exports = {
    name: "cloudflare-tunnel",
    capability: "expose-port",
    routes: router,

    // Expose proxy route for the hub so it routes correctly
    proxy: [
        { method: "get",  hubPath: "/tunnels/:deviceId",                nodePath: "/tunnels" }, // We don't have a GET implemented on the node, hub holds state
        { method: "post", hubPath: "/tunnels/:deviceId/start",          nodePath: "/tunnels/start" },
        { method: "post", hubPath: "/tunnels/:deviceId/stop/:tunnelId", nodePath: "/tunnels/stop/:tunnelId" }
    ],

    init: async (config) => {
        console.log(`[MODULE] cloudflare-tunnel initialized`);
    },

    cleanup: async () => {
        // Kill all active tunnels on shutdown
        for (const tunnelId in activeProcesses) {
            const proc = activeProcesses[tunnelId];
            try { proc.kill(); } catch (e) {}
        }
    }
};
