"use strict";

const axios   = require("axios");
const DEVICES = require("../stores/devices");

/**
 * buildProxyRoutes(app, modules, hubUid)
 *
 * For each loaded module's proxy[] definitions, registers Express routes
 * on the hub app. Each route resolves the target device and either:
 *   - Dispatches locally (if deviceId === hubUid and the module has a handle())
 *   - Proxies the request to the remote node via HTTP
 *
 * This replaces the old hand-written routes/command.js and routes/ai.js
 * with a single, generic, auto-generated dispatch layer.
 *
 * @param {express.Application} app      — the hub's Express app
 * @param {object[]}            modules  — loaded module objects from moduleLoader
 * @param {string}              hubUid   — the hub's own NODE_UID from .env
 */
function buildProxyRoutes(app, modules, hubUid) {

    for (const mod of modules) {

        if (!mod.proxy || mod.proxy.length === 0) continue;

        for (const route of mod.proxy) {

            const { method, hubPath, nodePath } = route;

            app[method](hubPath, async (req, res) => {

                const deviceId = req.params.deviceId;
                const device   = DEVICES[deviceId];

                if (!device) {
                    return res.status(404).json({ error: `Device '${deviceId}' not found` });
                }

                // ── Local dispatch (hub executing on itself) ─────────────
                if (deviceId === hubUid && typeof mod.handle === "function") {
                    return mod.handle(req, res);
                }

                // ── Remote proxy ─────────────────────────────────────────
                try {

                    // Substitute any :params in the node path
                    // e.g. "/ai/history/:sessionId" → "/ai/history/abc123"
                    let resolvedPath = nodePath;
                    for (const [key, val] of Object.entries(req.params)) {
                        if (key !== "deviceId") {
                            resolvedPath = resolvedPath.replace(`:${key}`, encodeURIComponent(val));
                        }
                    }

                    const targetIp = deviceId === hubUid ? "127.0.0.1" : device.ip;
                    const url = `http://${targetIp}:${device.port}${resolvedPath}`;

                    const axiosConfig = {
                        method,
                        url,
                        ...(method === "post" || method === "put" || method === "patch"
                            ? { data: req.body }
                            : {})
                    };

                    const response = await axios(axiosConfig);
                    res.json(response.data);

                } catch (err) {
                    const status = err.response?.status || 500;
                    const msg    = err.response?.data?.error || err.message;
                    res.status(status).json({ error: msg });
                }
            });

            console.log(`[DISPATCH] ${method.toUpperCase()} ${hubPath} → ${nodePath} (${mod.name})`);
        }
    }
}

module.exports = { buildProxyRoutes };
