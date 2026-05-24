const express = require("express");

const axios = require("axios");

const router = express.Router();

const DEVICES = require("../deviceStore");


// Resolve a device by UID or send a 404. Returns null when not found.
function getDevice(deviceId, res) {

    const device = DEVICES[deviceId];

    if (!device) {
        res.status(404).json({ error: `Device '${deviceId}' not found` });
        return null;
    }

    return device;
}


// ── POST /ai/:deviceId ───────────────────────────────────────────────────────
// Main inference proxy. Forwards the full request body to the node's
// POST /ai endpoint and streams the response back.
// Body: { prompt, model?, sessionId?, systemPrompt?, clearHistory? }
router.post("/ai/:deviceId", async (req, res) => {

    const device = getDevice(req.params.deviceId, res);
    if (!device) return;

    try {
        const response = await axios.post(
            `http://${device.ip}:${device.port}/ai`,
            req.body
        );
        res.json(response.data);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ── GET /ai/:deviceId/models ─────────────────────────────────────────────────
// Returns the list of available Ollama models on that node.
router.get("/ai/:deviceId/models", async (req, res) => {

    const device = getDevice(req.params.deviceId, res);
    if (!device) return;

    try {
        const response = await axios.get(
            `http://${device.ip}:${device.port}/ai/models`
        );
        res.json(response.data);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ── GET /ai/:deviceId/history/:sessionId ─────────────────────────────────────
// Returns the conversation history for a given session.
router.get("/ai/:deviceId/history/:sessionId", async (req, res) => {

    const device = getDevice(req.params.deviceId, res);
    if (!device) return;

    try {
        const response = await axios.get(
            `http://${device.ip}:${device.port}/ai/history/${req.params.sessionId}`
        );
        res.json(response.data);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ── DELETE /ai/:deviceId/history/:sessionId ───────────────────────────────────
// Clears the conversation history for a given session on the node.
router.delete("/ai/:deviceId/history/:sessionId", async (req, res) => {

    const device = getDevice(req.params.deviceId, res);
    if (!device) return;

    try {
        const response = await axios.delete(
            `http://${device.ip}:${device.port}/ai/history/${req.params.sessionId}`
        );
        res.json(response.data);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;
