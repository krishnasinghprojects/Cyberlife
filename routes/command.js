const express = require("express");

const axios = require("axios");

const { exec } = require("child_process");

const router = express.Router();

const DEVICES = require("../deviceStore");

router.post("/command/:deviceId", async (req, res) => {

    try {
        const deviceId = req.params.deviceId;
        const device = DEVICES[deviceId];

        if (!device) {
            return res.status(404).json({
                error: "device offline"
            });
        }

        const { command } = req.body;

        if (!command || typeof command !== "string") {
            return res.status(400).json({ error: "command field required" });
        }

        // If the target is the Hub itself, execute locally
        if (deviceId === "MacMini") {
            console.log("[HUB CMD]", command);
            exec(command, { shell: "/bin/zsh", timeout: 30_000 }, (err, stdout, stderr) => {
                res.json({
                    stdout: stdout || "",
                    stderr: stderr || "",
                    error: err ? err.message : null
                });
            });
            return;
        }

        // Otherwise, proxy the request to the target node
        const response = await axios.post(
            `http://${device.ip}:${device.port}/execute-command`,
            req.body
        );

        res.json(response.data);

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

module.exports = router;