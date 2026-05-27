"use strict";

const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const router = express.Router();

const activeTunnels = {}; // In-memory store mapping tunnelId -> { subdomain, domain, port, deviceId }

router.post("/start", async (req, res) => {
    const { deviceId, port, subdomain, domain } = req.body;

    if (!deviceId || !port || !subdomain || !domain) {
        return res.status(400).json({ error: "Missing required fields: deviceId, port, subdomain, domain" });
    }

    const config = req.app.get("hubConfig") || {};
    const apiToken = process.env.CLOUDFLARE_API_TOKEN || config.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || config.CLOUDFLARE_ACCOUNT_ID;
    const zoneId = process.env.CLOUDFLARE_ZONE_ID || config.CLOUDFLARE_ZONE_ID;

    if (!apiToken || !accountId || !zoneId) {
        return res.status(500).json({ error: "Cloudflare credentials not configured on the Hub." });
    }

    try {
        const tunnelName = `cyberlife-${deviceId}-${port}-${Date.now().toString().slice(-6)}`;
        const tunnelSecret = crypto.randomBytes(32).toString('base64');

        // 1. Create Tunnel
        const tunnelRes = await axios.post(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel`,
            { name: tunnelName, tunnel_secret: tunnelSecret },
            { headers: { "Authorization": `Bearer ${apiToken}`, "Content-Type": "application/json" } }
        );

        if (!tunnelRes.data.success) {
            throw new Error(`Cloudflare API Error: ${JSON.stringify(tunnelRes.data.errors)}`);
        }

        const tunnelId = tunnelRes.data.result.id;

        // 2. Route Tunnel via DNS
        const dnsRes = await axios.post(
            `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
            {
                type: "CNAME",
                name: `${subdomain}.${domain}`,
                content: `${tunnelId}.cfargotunnel.com`,
                ttl: 1, // Automatic
                proxied: true
            },
            { headers: { "Authorization": `Bearer ${apiToken}`, "Content-Type": "application/json" } }
        );

        if (!dnsRes.data.success) {
            // Rollback tunnel creation would be ideal here, but skipping for simplicity
            throw new Error(`DNS Creation Error: ${JSON.stringify(dnsRes.data.errors)}`);
        }
        
        const dnsRecordId = dnsRes.data.result.id;

        // 3. Generate Token
        const tokenData = { a: accountId, t: tunnelId, s: tunnelSecret };
        const runToken = Buffer.from(JSON.stringify(tokenData)).toString('base64');

        // 4. Send token to Node
        // Using the internal proxy mechanism: the hub routes /tunnels/:deviceId/start to the node
        const nodePort = 3001; // We assume node port or fetch it from active devices
        // Wait, the hub doesn't need to know the node's port directly if it uses the unified toolExecutor or if we just look up the IP
        // Let's look up the device in DEVICES store
        const DEVICES = require("../stores/devices");
        const device = DEVICES[deviceId];
        
        if (!device || device.status !== "online") {
            throw new Error(`Device ${deviceId} is not online.`);
        }

        const nodeUrl = `http://${device.ip}:${device.port}/tunnels/start`;
        
        await axios.post(nodeUrl, { port, token: runToken, tunnelId });

        activeTunnels[tunnelId] = {
            id: tunnelId,
            dnsId: dnsRecordId,
            subdomain,
            domain,
            port,
            deviceId,
            url: `https://${subdomain}.${domain}`
        };

        res.json({ success: true, tunnel: activeTunnels[tunnelId] });

    } catch (err) {
        console.error("[TUNNELS] Start Error:", err.response?.data || err.message);
        res.status(500).json({ error: err.response?.data?.errors?.[0]?.message || err.message });
    }
});

router.post("/stop/:tunnelId", async (req, res) => {
    const { tunnelId } = req.params;
    const tunnel = activeTunnels[tunnelId];

    if (!tunnel) {
        return res.status(404).json({ error: "Tunnel not found in active sessions." });
    }

    const config = req.app.get("hubConfig") || {};
    const apiToken = process.env.CLOUDFLARE_API_TOKEN || config.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || config.CLOUDFLARE_ACCOUNT_ID;
    const zoneId = process.env.CLOUDFLARE_ZONE_ID || config.CLOUDFLARE_ZONE_ID;

    try {
        // 1. Tell node to stop cloudflared process
        const DEVICES = require("../stores/devices");
        const device = DEVICES[tunnel.deviceId];
        if (device && device.status === "online") {
            const nodeUrl = `http://${device.ip}:${device.port}/tunnels/stop/${tunnelId}`;
            await axios.post(nodeUrl).catch(e => console.error("Node stop error", e.message));
        }

        // 2. Delete DNS record
        await axios.delete(
            `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${tunnel.dnsId}`,
            { headers: { "Authorization": `Bearer ${apiToken}` } }
        ).catch(e => console.error("DNS delete error", e.message));

        // 3. Delete Tunnel
        await axios.delete(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel/${tunnelId}`,
            { headers: { "Authorization": `Bearer ${apiToken}` } }
        ).catch(e => console.error("Tunnel delete error", e.message));

        delete activeTunnels[tunnelId];

        res.json({ success: true });
    } catch (err) {
        console.error("[TUNNELS] Stop Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

router.get("/:deviceId", (req, res) => {
    const { deviceId } = req.params;
    const deviceTunnels = Object.values(activeTunnels).filter(t => t.deviceId === deviceId);
    res.json(deviceTunnels);
});

module.exports = router;
