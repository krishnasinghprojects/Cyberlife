"use strict";

const axios   = require("axios");
const express = require("express");
const router  = express.Router();

// ── State ────────────────────────────────────────────────────────────────────
let ollamaUrl    = "http://127.0.0.1:11434";
let defaultModel = "llama3.1:8b";
let models       = ["llama3.1:8b"];
let systemPrompt = "You are Cyberlife AI, an intelligent assistant.";

// Session memory: sessionId → [{ role, content }]
const conversationMemory = new Map();

// ── Helpers ──────────────────────────────────────────────────────────────────
function getHistory(sessionId) {
    if (!conversationMemory.has(sessionId)) {
        conversationMemory.set(sessionId, []);
    }
    return conversationMemory.get(sessionId);
}

function addToHistory(sessionId, role, content) {
    const history = getHistory(sessionId);
    history.push({ role, content });
    if (history.length > 20) history.splice(0, history.length - 20);
}

function clearHistory(sessionId) {
    conversationMemory.delete(sessionId);
}

async function callOllama(model, messages) {
    const response = await axios.post(`${ollamaUrl}/api/chat`, {
        model,
        messages,
        stream: false
    });
    return response.data;
}

// ── Routes ───────────────────────────────────────────────────────────────────

// Main inference endpoint
router.post("/ai", async (req, res) => {
    try {
        const {
            prompt,
            model = defaultModel,
            sessionId = "default",
            systemPrompt: customPrompt = systemPrompt,
            clearHistory: shouldClear = false
        } = req.body;

        if (!prompt || typeof prompt !== "string") {
            return res.status(400).json({ error: "prompt field required (string)" });
        }

        if (!models.includes(model)) {
            return res.status(400).json({
                error: `Invalid model. Available: ${models.join(", ")}`
            });
        }

        if (shouldClear) {
            clearHistory(sessionId);
            return res.json({ message: "Conversation history cleared", sessionId });
        }

        console.log(`[AI] Session: ${sessionId}, Model: ${model}, Prompt: ${prompt.substring(0, 50)}...`);

        const history  = getHistory(sessionId);
        const messages = [
            { role: "system", content: customPrompt },
            ...history,
            { role: "user", content: prompt }
        ];

        const startTime = Date.now();
        const response  = await callOllama(model, messages);
        const elapsed   = Date.now() - startTime;

        const reply = response.message?.content || response.response || "No response";

        addToHistory(sessionId, "user",      prompt);
        addToHistory(sessionId, "assistant", reply);

        res.json({
            response:           reply,
            model,
            sessionId,
            responseTime:       `${elapsed}ms`,
            conversationLength: history.length + 2,
            platform:           process.platform
        });

    } catch (err) {
        console.error("[AI ERROR]", err.message);
        res.status(500).json({ error: err.message });
    }
});

// Available models
router.get("/ai/models", (_req, res) => {
    res.json({ models, default: defaultModel });
});

// Get conversation history
router.get("/ai/history/:sessionId", (req, res) => {
    const history = getHistory(req.params.sessionId);
    res.json({ sessionId: req.params.sessionId, history, length: history.length });
});

// Clear conversation history
router.delete("/ai/history/:sessionId", (req, res) => {
    clearHistory(req.params.sessionId);
    res.json({ message: "History cleared", sessionId: req.params.sessionId });
});

// ── Module Contract ──────────────────────────────────────────────────────────
module.exports = {
    name:       "inference-engine",
    capability: "ai-inference",

    routes: router,

    // Hub proxy routes — one entry per endpoint the hub needs to forward
    proxy: [
        { method: "post",   hubPath: "/ai/:deviceId",                    nodePath: "/ai" },
        { method: "get",    hubPath: "/ai/:deviceId/models",             nodePath: "/ai/models" },
        { method: "get",    hubPath: "/ai/:deviceId/history/:sessionId", nodePath: "/ai/history/:sessionId" },
        { method: "delete", hubPath: "/ai/:deviceId/history/:sessionId", nodePath: "/ai/history/:sessionId" }
    ],

    init: async (config) => {
        ollamaUrl    = config.OLLAMA_URL           || ollamaUrl;
        defaultModel = config.OLLAMA_DEFAULT_MODEL  || defaultModel;
        systemPrompt = config.OLLAMA_SYSTEM_PROMPT  || systemPrompt;

        if (config.OLLAMA_MODELS) {
            models = config.OLLAMA_MODELS.split(",").map(s => s.trim()).filter(Boolean);
        }
    }
};
