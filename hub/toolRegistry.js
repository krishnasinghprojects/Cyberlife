"use strict";

const DEVICES = require("../stores/devices");

// ══════════════════════════════════════════════════════════════════════════════
// Tool Registry — Dynamic Auto-Discovery
//
// Every time buildTools() or buildSystemPrompt() is called, it reads the
// DEVICES store to build tool definitions and prompts that reflect the
// CURRENT state of the network. New devices, changed capabilities, and
// offline nodes are all reflected instantly — zero config.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * buildSystemPrompt()
 *
 * Dynamically generates the system prompt with current device inventory.
 * Called at the start of each agent loop so the AI always has an
 * up-to-date view of the network.
 */
function buildSystemPrompt() {
    const devices = Object.values(DEVICES);

    const deviceList = devices.map(d => {
        const caps = (d.capabilities || []).join(", ") || "none";
        return `  • ${d.uid} ("${d.name}") — ${d.status.toUpperCase()} — IP: ${d.ip}:${d.port} — Capabilities: [${caps}]`;
    }).join("\n");

    return `You are Cyberlife AI, an advanced, highly capable assistant for the Cyberlife Hub. 

You can converse naturally, answer general knowledge questions, perform math, and help with coding. In addition, you have native tool-calling capabilities to manage the user's smart home and homelab infrastructure.

CURRENT NETWORK DEVICES:
${deviceList || "  (no devices registered)"}

RULES:
1. General Questions: You are fully capable of answering general knowledge, math, and conversational questions. You are NOT restricted only to system management.
2. System Data: NEVER guess or fabricate system data — always call a tool to fetch real metrics or status.
3. Executing Actions: If the user asks you to perform an action or run a command, you MUST use the native tool-calling mechanism. DO NOT output the tool call JSON as conversational text. DO NOT say "Here is the JSON". ONLY output the raw tool call.
4. If a device's status is "offline", tell the user it is unreachable instead of calling tools on it.
5. When executing commands via tools, briefly explain what you're about to do, then report the result clearly.
6. If a tool call fails, report the error clearly and suggest alternatives if possible.
7. Be concise but informative. Format output beautifully using Markdown.
8. You may chain multiple tool calls in sequence if the user's request requires it.
9. Never attempt to run commands that delete files or destroy data.
10. EXTREMELY IMPORTANT: When calling a tool, you MUST NOT include any conversational text like "I will now call the tool" or print the JSON in a markdown block. Use the proper function calling format expected by the API.`;
}

/**
 * buildTools()
 *
 * Dynamically builds the Ollama-compatible tool definitions based on
 * which devices are currently registered and their capabilities.
 *
 * This is the "auto-discovery" mechanism: every time a new device registers
 * (or goes offline), the next agent invocation sees the updated state.
 *
 * @returns {object[]} Array of Ollama tool definitions
 */
function buildTools() {
    const tools = [];
    const allDevices = Object.values(DEVICES);

    // ── Always-available tools ─────────────────────────────────────────

    tools.push({
        type: "function",
        function: {
            name: "list_devices",
            description: "List all registered devices on the Cyberlife network, including their current status (online/offline), IP address, port, and capabilities. Use this to discover what devices are available.",
            parameters: {
                type: "object",
                properties: {},
                required: []
            }
        }
    });

    tools.push({
        type: "function",
        function: {
            name: "get_all_metrics",
            description: "Get the latest real-time system metrics (CPU usage %, RAM usage, Disk usage) for ALL devices that have reported metrics. Returns the most recent snapshot.",
            parameters: {
                type: "object",
                properties: {},
                required: []
            }
        }
    });

    // ── Command Execution (dynamic — only if devices have the capability) ──

    const commandDevices = allDevices
        .filter(d => d.capabilities?.includes("execute-command"))
        .map(d => d.uid);

    if (commandDevices.length > 0) {
        tools.push({
            type: "function",
            function: {
                name: "execute_command",
                description: `Execute a shell command on a specific device. Available devices with command execution: [${commandDevices.join(", ")}]. Use this to run system commands like 'uptime', 'df -h', 'ps aux', 'whoami', network diagnostics, etc.`,
                parameters: {
                    type: "object",
                    properties: {
                        deviceId: {
                            type: "string",
                            description: `The device UID to run the command on. Must be one of: ${commandDevices.join(", ")}`
                        },
                        command: {
                            type: "string",
                            description: "The shell command to execute (e.g., 'uptime', 'df -h', 'ps aux | head -20')"
                        }
                    },
                    required: ["deviceId", "command"]
                }
            }
        });
    }

    // ── Docker Management (dynamic) ───────────────────────────────────

    const dockerDevices = allDevices
        .filter(d => d.capabilities?.includes("docker"))
        .map(d => d.uid);

    if (dockerDevices.length > 0) {
        tools.push({
            type: "function",
            function: {
                name: "list_docker_containers",
                description: `List all Docker containers (running and stopped) on a device, including their name, image, state, status text, CPU and RAM usage. Available devices: [${dockerDevices.join(", ")}]`,
                parameters: {
                    type: "object",
                    properties: {
                        deviceId: {
                            type: "string",
                            description: `The device UID to list containers on. Must be one of: ${dockerDevices.join(", ")}`
                        }
                    },
                    required: ["deviceId"]
                }
            }
        });

        tools.push({
            type: "function",
            function: {
                name: "docker_container_action",
                description: `Perform an action (start, stop, or restart) on a Docker container. Available devices: [${dockerDevices.join(", ")}]`,
                parameters: {
                    type: "object",
                    properties: {
                        deviceId: {
                            type: "string",
                            description: `The device UID where the container runs. Must be one of: ${dockerDevices.join(", ")}`
                        },
                        containerId: {
                            type: "string",
                            description: "The Docker container ID or name"
                        },
                        action: {
                            type: "string",
                            description: "The action to perform",
                            enum: ["start", "stop", "restart"]
                        }
                    },
                    required: ["deviceId", "containerId", "action"]
                }
            }
        });
    }

    // ── Port Expose (dynamic) ─────────────────────────────────────────

    const exposeDevices = allDevices
        .filter(d => d.capabilities?.includes("expose-port"))
        .map(d => d.uid);

    if (exposeDevices.length > 0) {
        tools.push({
            type: "function",
            function: {
                name: "expose_port",
                description: `Expose a local port on a device to the internet using a Cloudflare tunnel. This will create a secure tunnel and a subdomain on the base domain. Available devices: [${exposeDevices.join(", ")}]`,
                parameters: {
                    type: "object",
                    properties: {
                        deviceId: {
                            type: "string",
                            description: `The device UID. Must be one of: ${exposeDevices.join(", ")}`
                        },
                        port: {
                            type: "number",
                            description: "The local port to expose (e.g. 3000, 8080)"
                        },
                        subdomain: {
                            type: "string",
                            description: "The desired subdomain (e.g. 'myapp' which becomes myapp.domain.com)"
                        }
                    },
                    required: ["deviceId", "port", "subdomain"]
                }
            }
        });
    }

    // ── Metrics History (always available — hub has DB) ────────────────

    tools.push({
        type: "function",
        function: {
            name: "get_metrics_history",
            description: "Query historical metrics data from the database. Useful for checking trends, past performance, or comparing metrics over time. Returns the most recent records sorted by time.",
            parameters: {
                type: "object",
                properties: {
                    deviceId: {
                        type: "string",
                        description: "Optional: filter by device UID. If not provided, returns metrics for all devices."
                    },
                    limit: {
                        type: "number",
                        description: "Number of recent records to return. Default: 20, Maximum: 100."
                    }
                },
                required: []
            }
        }
    });

    return tools;
}

module.exports = { buildTools, buildSystemPrompt };
