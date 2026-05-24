const express = require("express");

const router = express.Router();

const DEVICES = require("../deviceStore");

const { broadcast } = require("../websocket/socket");

router.post("/register", (req, res) => {

    const device = req.body;

    DEVICES[device.uid] = {
        ...device,
        status: "online",
        lastHeartbeat: Date.now()
    };

    console.log(`[REGISTERED] ${device.uid}`);

    broadcast({
        type: "device-update",
        devices: DEVICES
    });

    res.json({
        success: true
    });
});

router.post("/heartbeat", (req, res) => {

    const { uid, ip } = req.body;

    if (!DEVICES[uid]) {

        return res.status(404).json({
            error: "device not found"
        });
    }

    DEVICES[uid].lastHeartbeat = Date.now();

    DEVICES[uid].status = "online";

    if (DEVICES[uid].ip !== ip) {

        DEVICES[uid].ip = ip;
    }

    broadcast({
        type: "device-update",
        devices: DEVICES
    });

    res.json({
        success: true
    });
});

module.exports = router;