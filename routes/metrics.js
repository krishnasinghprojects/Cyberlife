const express = require("express");

const router = express.Router();

const METRICS = require("../stores/metrics");

const { broadcast } = require("../websocket/socket");

const { run } = require("../stores/database");

// Node agents POST their system metrics here every few seconds
router.post("/metrics/:deviceId", async (req, res) => {
    const { deviceId } = req.params;
    const data = req.body;

    METRICS[deviceId] = {
        ...data,
        timestamp: Date.now()
    };

    try {
        await run(`
            INSERT INTO metrics_log (device_uid, cpu_usage, ram_percent, disk_percent)
            VALUES (?, ?, ?, ?)
        `, [deviceId, data.cpu || 0, data.ram || 0, data.disk || 0]);
    } catch (e) {
        console.error("[DB ERROR] Failed to log metrics:", e);
    }

    broadcast({
        type: "metrics-update",
        deviceId,
        metrics: METRICS[deviceId]
    });

    res.json({ success: true });
});

// Dashboard fetches this on initial load to populate gauges immediately
router.get("/metrics", (req, res) => {

    res.json(METRICS);
});

module.exports = router;
