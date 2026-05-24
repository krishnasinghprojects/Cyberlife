/**
 * Cyberlife Node Agent — MacBookPro (AI Node)
 * ─────────────────────────────────────────────────────────────────────────────
 * Deploy this file (and package.json) on the MacBook Pro.
 *
 * Setup:
 *   1. Edit CONFIG below (HUB_URL, PORT, UID, NAME)
 *   2. npm install
 *   3. node macbook-node.js
 *
 * What this does:
 *   • Registers itself with the Cyberlife Hub
 *   • Sends a heartbeat every 30 s so the hub knows it is alive
 *   • Pushes CPU / RAM / disk metrics every 5 s (shown live on dashboard)
 *   • Exposes POST /execute-command so the hub can run shell commands here
 *   • Exposes POST /ai for AI inference with Ollama (text-based with memory)
 *   • Supports multiple models with dynamic selection
 *   • Maintains conversation memory per session
 */

"use strict";

const express = require("express");
const axios   = require("axios");
const si      = require("systeminformation");
const os      = require("os");
const { exec } = require("child_process");

/* ─── CONFIGURATION — edit these ─────────────────────────────────────────── */
const CONFIG = {
    HUB_URL:  "http://10.120.0.250:8000",   // ← MacMini hub — static IP
    PORT:     3002,                          // ← port this agent listens on
    UID:      "MacBookPro",                  // ← unique ID for this machine
    NAME:     "MacBook Pro",                 // ← display name on dashboard

    SHELL: "/bin/zsh",   // change to /bin/bash if preferred

    HEARTBEAT_INTERVAL_MS: 30_000,   // 30 s
    METRICS_INTERVAL_MS:    5_000,   //  5 s

    CAPABILITIES: ["execute-command", "metrics", "ai-inference"],

    // Ollama configuration
    OLLAMA_URL: "http://localhost:11434",
    DEFAULT_MODEL: "llama3.1:8b",
    
    // Available models
    MODELS: ["llama3.1:8b", "qwen3:0.6b", "gemma3:latest", "phi3:latest", "gpt-oss:20b"],

    // System prompt
    SYSTEM_PROMPT: `You are Cyberlife AI, an intelligent assistant running on a MacBook Pro node. You are part of a distributed system and can help with various tasks including analysis, coding, and general assistance. Be concise, helpful, and accurate.`
};
/* ────────────────────────────────────────────────────────────────────────── */

// Memory store: sessionId -> conversation history
const conversationMemory = new Map();

const app = express();
app.use(express.json());

/* ─── HELPERS ─────────────────────────────────────────────────────────────── */
function getLocalIP() {
    for (const iface of Object.values(os.networkInterfaces())) {
        for (const addr of iface) {
            if (addr.family === "IPv4" && !addr.internal) return addr.address;
        }
    }
    return "127.0.0.1";
}

async function collectMetrics() {
    const [load, mem, disks] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize()
    ]);

    // Pick the primary disk (largest)
    const primaryDisk = disks.sort((a, b) => b.size - a.size)[0] || {};

    return {
        cpu:  Math.round(load.currentLoad),
        ram:  {
            used:    mem.used,
            total:   mem.total,
            percent: Math.round((mem.used / mem.total) * 100)
        },
        disk: {
            used:    primaryDisk.used  || 0,
            total:   primaryDisk.size  || 0,
            percent: Math.round(primaryDisk.use || 0)
        },
        platform: "darwin",
        uptime:   os.uptime()
    };
}

/* ─── AI HELPERS ──────────────────────────────────────────────────────────── */

// Get or create conversation history for a session
function getConversationHistory(sessionId) {
    if (!conversationMemory.has(sessionId)) {
        conversationMemory.set(sessionId, []);
    }
    return conversationMemory.get(sessionId);
}

// Add message to conversation history
function addToHistory(sessionId, role, content) {
    const history = getConversationHistory(sessionId);
    history.push({ role, content });
    
    // Keep only last 20 messages to prevent memory overflow
    if (history.length > 20) {
        history.splice(0, history.length - 20);
    }
}

// Clear conversation history for a session
function clearHistory(sessionId) {
    conversationMemory.delete(sessionId);
}

// Call Ollama API for text generation
async function callOllama(model, messages) {
    try {
        const response = await axios.post(`${CONFIG.OLLAMA_URL}/api/chat`, {
            model,
            messages,
            stream: false
        });
        return response.data;
    } catch (err) {
        throw new Error(`Ollama API error: ${err.message}`);
    }
}

/* ─── REGISTER WITH HUB ───────────────────────────────────────────────────── */
async function register() {
    try {
        await axios.post(`${CONFIG.HUB_URL}/register`, {
            uid:          CONFIG.UID,
            name:         CONFIG.NAME,
            ip:           getLocalIP(),
            port:         CONFIG.PORT,
            capabilities: CONFIG.CAPABILITIES
        });
        console.log("[REGISTERED] Connected to hub:", CONFIG.HUB_URL);
    } catch (err) {
        console.error("[REGISTER FAILED]", err.message, "— retrying in 10 s…");
        setTimeout(register, 10_000);
    }
}

/* ─── HEARTBEAT ───────────────────────────────────────────────────────────── */
async function heartbeat() {
    try {
        await axios.post(`${CONFIG.HUB_URL}/heartbeat`, {
            uid: CONFIG.UID,
            ip:  getLocalIP()
        });
    } catch (err) {
        console.warn("[HEARTBEAT FAILED]", err.message);
    }
}

/* ─── METRICS PUSH ────────────────────────────────────────────────────────── */
async function pushMetrics() {
    try {
        const metrics = await collectMetrics();
        await axios.post(`${CONFIG.HUB_URL}/metrics/${CONFIG.UID}`, metrics);
    } catch (err) {
        console.warn("[METRICS FAILED]", err.message);
    }
}

/* ─── ROUTES ──────────────────────────────────────────────────────────────── */

// Hub calls this to run a shell command on this machine
app.post("/execute-command", (req, res) => {

    const { command } = req.body;

    if (!command || typeof command !== "string") {
        return res.status(400).json({ error: "command field required" });
    }

    console.log("[CMD]", command);

    exec(command, { shell: CONFIG.SHELL, timeout: 30_000 },
        (err, stdout, stderr) => {
            res.json({
                stdout: stdout || "",
                stderr: stderr || "",
                error:  err ? err.message : null
            });
        }
    );
});

// AI inference endpoint with Ollama integration
// POST body format:
//   {
//     "prompt": "your question here",
//     "model": "llama3.1:8b" (optional, defaults to CONFIG.DEFAULT_MODEL),
//     "sessionId": "unique-session-id" (optional, for conversation memory),
//     "systemPrompt": "custom system prompt" (optional, overrides default),
//     "clearHistory": true (optional, clears conversation history for this session)
//   }
app.post("/ai", async (req, res) => {
    try {
        const { 
            prompt, 
            model = CONFIG.DEFAULT_MODEL, 
            sessionId = "default",
            systemPrompt = CONFIG.SYSTEM_PROMPT,
            clearHistory: shouldClearHistory = false
        } = req.body;

        // Validate prompt
        if (!prompt || typeof prompt !== "string") {
            return res.status(400).json({ 
                error: "prompt field required (string)" 
            });
        }

        // Validate model
        if (!CONFIG.MODELS.includes(model)) {
            return res.status(400).json({ 
                error: `Invalid model. Available: ${CONFIG.MODELS.join(", ")}` 
            });
        }

        // Clear history if requested
        if (shouldClearHistory) {
            clearHistory(sessionId);
            return res.json({
                message: "Conversation history cleared",
                sessionId,
                uid: CONFIG.UID
            });
        }

        console.log(`[AI] Session: ${sessionId}, Model: ${model}, Prompt: ${prompt.substring(0, 50)}...`);

        // Get conversation history
        const history = getConversationHistory(sessionId);

        // Build messages array for Ollama
        const messages = [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: prompt }
        ];

        // Call Ollama
        const startTime = Date.now();
        const response = await callOllama(model, messages);
        const responseTime = Date.now() - startTime;

        // Extract assistant's response
        const assistantMessage = response.message?.content || response.response || "No response";

        // Add to conversation history
        addToHistory(sessionId, "user", prompt);
        addToHistory(sessionId, "assistant", assistantMessage);

        // Send response
        res.json({
            response: assistantMessage,
            model,
            sessionId,
            responseTime: `${responseTime}ms`,
            conversationLength: history.length + 2,
            platform: "darwin",
            uid: CONFIG.UID
        });

    } catch (err) {
        console.error("[AI ERROR]", err.message);
        res.status(500).json({ 
            error: err.message,
            uid: CONFIG.UID
        });
    }
});

// Get available models
app.get("/ai/models", (_req, res) => {
    res.json({
        models: CONFIG.MODELS,
        default: CONFIG.DEFAULT_MODEL,
        uid: CONFIG.UID
    });
});

// Get conversation history for a session
app.get("/ai/history/:sessionId", (req, res) => {
    const { sessionId } = req.params;
    const history = getConversationHistory(sessionId);
    res.json({
        sessionId,
        history,
        length: history.length,
        uid: CONFIG.UID
    });
});

// Clear conversation history for a session
app.delete("/ai/history/:sessionId", (req, res) => {
    const { sessionId } = req.params;
    clearHistory(sessionId);
    res.json({
        message: "History cleared",
        sessionId,
        uid: CONFIG.UID
    });
});

// Health check
app.get("/ping", (_req, res) => res.json({ ok: true, uid: CONFIG.UID }));

/* ─── START ───────────────────────────────────────────────────────────────── */
app.listen(CONFIG.PORT, "0.0.0.0", async () => {
    console.log(`[CYBERLIFE AGENT] MacBookPro — port ${CONFIG.PORT}`);

    await register();

    setInterval(heartbeat,    CONFIG.HEARTBEAT_INTERVAL_MS);
    setInterval(pushMetrics,  CONFIG.METRICS_INTERVAL_MS);
});