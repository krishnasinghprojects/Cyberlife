"use strict";

const { exec } = require("child_process");
const express  = require("express");
const router   = express.Router();

let shell = "/bin/zsh";

// ── Core Handler ─────────────────────────────────────────────────────────────
// Exported so the hub dispatch can call it directly for local execution
// without making a loopback HTTP request.
function executeCommand(command) {
    return new Promise((resolve) => {
        exec(
            command,
            {
                shell,
                timeout: 30_000,
                ...(process.platform === "win32" ? { windowsHide: true } : {})
            },
            (err, stdout, stderr) => {
                resolve({
                    stdout: stdout || "",
                    stderr: stderr || "",
                    error:  err ? err.message : null
                });
            }
        );
    });
}

// ── Route (mounted on node agents) ──────────────────────────────────────────
router.post("/execute-command", async (req, res) => {

    const { command } = req.body;

    if (!command || typeof command !== "string") {
        return res.status(400).json({ error: "command field required" });
    }

    console.log("[CMD]", command);
    const result = await executeCommand(command);
    res.json(result);
});

// ── Module Contract ──────────────────────────────────────────────────────────
module.exports = {
    name:       "command-executor",
    capability: "execute-command",

    routes: router,

    // Hub proxy configuration — tells the hub how to build proxy routes
    proxy: [
        { method: "post", hubPath: "/command/:deviceId", nodePath: "/execute-command" }
    ],

    // Direct handler for hub local dispatch (avoids HTTP loopback)
    handle: async (req, res) => {
        const { command } = req.body;
        if (!command || typeof command !== "string") {
            return res.status(400).json({ error: "command field required" });
        }
        console.log("[HUB CMD]", command);
        const result = await executeCommand(command);
        res.json(result);
    },

    init: async (config) => {
        shell = config.NODE_SHELL || "/bin/zsh";
    }
};
