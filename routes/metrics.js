const express = require("express");

const router = express.Router();

const METRICS = require("../stores/metrics");

const { broadcast } = require("../websocket/socket");

// Node agents POST their system metrics here every few seconds
router.post("/metrics/:deviceId", (req, res) => {

    const { deviceId } = req.params;

    METRICS[deviceId] = {
        ...req.body,
        timestamp: Date.now()
    };

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
