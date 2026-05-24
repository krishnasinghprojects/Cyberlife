"use strict";

const DEVICES   = require("../stores/devices");
const { broadcast } = require("../websocket/socket");

/**
 * startWatchdog(hubUid, timeoutMs, intervalMs)
 *
 * Periodically scans all registered devices. Any device (other than the hub
 * itself) whose lastHeartbeat exceeds timeoutMs is marked offline and
 * a device-update is broadcast to all dashboard clients.
 *
 * @param {string} hubUid     — the hub's own UID (excluded from timeout checks)
 * @param {number} timeoutMs  — milliseconds before a silent device is marked offline
 * @param {number} intervalMs — how often to run the check
 */
function startWatchdog(hubUid, timeoutMs, intervalMs) {

    setInterval(() => {

        const now     = Date.now();
        let   changed = false;

        Object.values(DEVICES).forEach(device => {

            if (
                device.uid    !== hubUid   &&
                device.status === "online" &&
                (now - device.lastHeartbeat) > timeoutMs
            ) {
                device.status = "offline";
                changed = true;
                console.log(`[OFFLINE] ${device.uid}`);
            }
        });

        if (changed) {
            broadcast({ type: "device-update", devices: DEVICES });
        }

    }, intervalMs);

    console.log(`[WATCHDOG] Running every ${intervalMs / 1000}s, timeout ${timeoutMs / 1000}s (skip: ${hubUid})`);
}

module.exports = { startWatchdog };
