"use strict";

const axios   = require("axios");
const DEVICES = require("../stores/devices");
const { query } = require("../stores/database");

// ══════════════════════════════════════════════════════════════════════════════
// Tool Executor
//
// Maps tool calls from Ollama's tool-calling response into actual HTTP
// requests against the Hub's own API endpoints. This way every tool call
// goes through the same dispatch/proxy layer as external requests.
//
// Safety guardrails block destructive shell commands before execution.
// ══════════════════════════════════════════════════════════════════════════════

// ── Safety: Blocked command patterns ────────────────────────────────────────

const BLOCKED_PATTERNS = [
    /\brm\s+.*-[a-zA-Z]*r/i,           // rm -r, rm -rf, rm -ri, etc.
    /\brm\s+.*-[a-zA-Z]*f/i,           // rm -f (force delete)
    /\brm\s+(-rf|-fr)\b/i,             // rm -rf / rm -fr explicitly
    /\brm\s+--recursive/i,             // rm --recursive
    /\brm\s+--force/i,                 // rm --force
    /\bsudo\s+rm\b/i,                  // sudo rm anything
    /\brmdir\b/i,                      // rmdir
    /\bmkfs\b/i,                       // mkfs (format filesystem)
    /\bdd\s+if=/i,                     // dd (disk destroyer)
    />\s*\/dev\//,                      // redirect to device files
    /\bformat\s+[a-zA-Z]:/i,           // Windows format
    /\bdel\s+\/[sS]/i,                 // Windows recursive delete
    /\bwipe\b/i,                       // wipe
    /\bshred\b/i,                      // shred
    /:\s*>\s*\//,                      // truncate files (: > /path)
    /\bunlink\b/i,                     // unlink
];

/**
 * isCommandBlocked(command)
 *
 * Returns true if the command matches any blocked pattern.
 */
function isCommandBlocked(command) {
    return BLOCKED_PATTERNS.some(pattern => pattern.test(command));
}

/**
 * executeTool(toolName, args, hubPort)
 *
 * Executes a single tool call by routing to the Hub's own HTTP API.
 * Returns a plain object that will be JSON-stringified for Ollama.
 *
 * @param {string} toolName — The tool name from Ollama's response
 * @param {object} args     — The arguments from Ollama's response
 * @param {number} hubPort  — The hub's port (for localhost HTTP calls)
 * @returns {object}        — The tool result
 */
async function executeTool(toolName, args, hubPort) {
    const baseUrl = `http://127.0.0.1:${hubPort}`;
    const timeout = 30_000;

    try {
        switch (toolName) {

            // ── List all devices ──────────────────────────────────────
            case "list_devices": {
                const resp = await axios.get(`${baseUrl}/monitoring`, { timeout });
                return resp.data;
            }

            // ── Get all current metrics ───────────────────────────────
            case "get_all_metrics": {
                const resp = await axios.get(`${baseUrl}/metrics`, { timeout });
                return resp.data;
            }

            // ── Execute a shell command on a device ───────────────────
            case "execute_command": {
                const { deviceId, command } = args;

                if (!deviceId || !command) {
                    return { error: "Both 'deviceId' and 'command' are required." };
                }

                // Safety guardrail
                if (isCommandBlocked(command)) {
                    return {
                        error: "BLOCKED: This command is blocked by safety guardrails. Destructive operations (rm -rf, rmdir, mkfs, dd, shred, etc.) are not permitted through the AI agent.",
                        blocked: true,
                        command
                    };
                }

                // Check device status
                const device = DEVICES[deviceId];
                if (device && device.status !== "online") {
                    return { error: `Device '${deviceId}' is currently ${device.status}. Cannot execute command.` };
                }

                const resp = await axios.post(
                    `${baseUrl}/command/${encodeURIComponent(deviceId)}`,
                    { command },
                    { timeout }
                );
                return resp.data;
            }

            // ── List Docker containers on a device ────────────────────
            case "list_docker_containers": {
                const { deviceId } = args;

                if (!deviceId) {
                    return { error: "'deviceId' is required." };
                }

                const device = DEVICES[deviceId];
                if (device && device.status !== "online") {
                    return { error: `Device '${deviceId}' is currently ${device.status}.` };
                }

                const resp = await axios.get(
                    `${baseUrl}/docker/${encodeURIComponent(deviceId)}/containers`,
                    { timeout }
                );
                return resp.data;
            }

            // ── Docker container action (start/stop/restart) ──────────
            case "docker_container_action": {
                const { deviceId, containerId, action } = args;

                if (!deviceId || !containerId || !action) {
                    return { error: "'deviceId', 'containerId', and 'action' are all required." };
                }

                if (!["start", "stop", "restart"].includes(action)) {
                    return { error: `Invalid action '${action}'. Must be: start, stop, or restart.` };
                }

                const device = DEVICES[deviceId];
                if (device && device.status !== "online") {
                    return { error: `Device '${deviceId}' is currently ${device.status}.` };
                }

                const resp = await axios.post(
                    `${baseUrl}/docker/${encodeURIComponent(deviceId)}/containers/${encodeURIComponent(containerId)}/${action}`,
                    {},
                    { timeout }
                );
                return resp.data;
            }

            // ── Query historical metrics from DB ──────────────────────
            case "get_metrics_history": {
                const deviceId = args.deviceId || null;
                const limit = Math.min(Math.max(parseInt(args.limit) || 20, 1), 100);

                let sql, params;
                if (deviceId) {
                    sql = `SELECT device_uid, cpu_usage, ram_percent, disk_percent, created_at
                           FROM metrics_log
                           WHERE device_uid = ?
                           ORDER BY created_at DESC
                           LIMIT ?`;
                    params = [deviceId, limit];
                } else {
                    sql = `SELECT device_uid, cpu_usage, ram_percent, disk_percent, created_at
                           FROM metrics_log
                           ORDER BY created_at DESC
                           LIMIT ?`;
                    params = [limit];
                }

                const rows = await query(sql, params);
                return { records: rows, count: rows.length };
            }

            // ── Expose a port via Cloudflare Tunnel ───────────────────
            case "expose_port": {
                const { deviceId, port, subdomain } = args;

                if (!deviceId || !port || !subdomain) {
                    return { error: "Missing required parameters: deviceId, port, subdomain" };
                }

                const resp = await axios.post(
                    `${baseUrl}/api/expose`,
                    { deviceId, port, subdomain },
                    { timeout: 60000 } // Tunnels might take a moment to provision
                );
                return resp.data;
            }

            // ── Unknown tool ──────────────────────────────────────────
            default:
                return { error: `Unknown tool: '${toolName}'. This tool is not registered.` };
        }

    } catch (err) {
        const status = err.response?.status || 500;
        const msg    = err.response?.data?.error || err.message;
        return { error: `Tool '${toolName}' execution failed (HTTP ${status}): ${msg}` };
    }
}

module.exports = { executeTool, isCommandBlocked };
