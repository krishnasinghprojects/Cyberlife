const express = require("express");

const router = express.Router();

const DEVICES = require("../stores/devices");

const { broadcast } = require("../websocket/socket");

const { run } = require("../stores/database");

router.post("/register", async (req, res) => {
    const device = req.body;
    DEVICES[device.uid] = {
        ...device,
        status: "online",
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
        `, [
            device.uid, 
            device.name || "Unknown Device", 
            device.os || "Unknown OS", 
            device.ip || "0.0.0.0",
            device.port || 0,
            JSON.stringify(device.capabilities || [])
        ]);
    } catch (e) {
        console.error("[DB ERROR] Failed to register device:", e);
    }

    console.log(`[REGISTERED] ${device.uid}`);
    broadcast({ type: "device-update", devices: DEVICES });
    res.json({ success: true });
});

router.post("/heartbeat", async (req, res) => {
    const { uid, ip } = req.body;

    if (!DEVICES[uid]) {
        return res.status(404).json({ error: "device not found" });
    }

    DEVICES[uid].lastHeartbeat = Date.now();
    DEVICES[uid].status = "online";

    if (DEVICES[uid].ip !== ip) {
        DEVICES[uid].ip = ip;
    }

    try {
        await run(`UPDATE devices SET last_seen = CURRENT_TIMESTAMP, ip = ? WHERE uid = ?`, [ip, uid]);
    } catch (e) {
        console.error("[DB ERROR] Failed to update heartbeat:", e);
    }

    broadcast({ type: "device-update", devices: DEVICES });
    res.json({ success: true });
});

module.exports = router;