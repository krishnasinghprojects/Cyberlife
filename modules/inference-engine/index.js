"use strict";

const axios   = require("axios");
const express = require("express");
const router  = express.Router();

// ── State ────────────────────────────────────────────────────────────────────
let ollamaUrl    = "http://127.0.0.1:11434";
let defaultModel = "llama3.1:8b";
let models       = ["llama3.1:8b"];
let systemPrompt = "You are Cyberlife AI, an intelligent assistant.";

// ── Helpers ──────────────────────────────────────────────────────────────────

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

        const history = req.body.history || [];
        console.log(`[AI] Received history array of length: ${history.length}`);

        console.log(`[AI] Model: ${model}, Prompt: ${prompt.substring(0, 50)}...`);

        const messages = [
            { role: "system", content: customPrompt },
            ...history,
            { role: "user", content: prompt }
        ];

        const startTime = Date.now();
        const response  = await callOllama(model, messages);
        const elapsed   = Date.now() - startTime;

        const reply = response.message?.content || response.response || "No response";

        res.json({
            response:           reply,
            model,
            responseTime:       `${elapsed}ms`,
            platform:           process.platform
        });

    } catch (err) {
        const msg = err.response?.data?.error || err.message;
        console.error("[AI ERROR]", msg);
        res.status(500).json({ error: msg });
    }
});

// Available models
router.get("/ai/models", (_req, res) => {
    res.json({ models, default: defaultModel });
});

// End of routes

// ── Module Contract ──────────────────────────────────────────────────────────
module.exports = {
    name:       "inference-engine",
    capability: "ai-inference",

    routes: router,

    // Hub proxy routes — one entry per endpoint the hub needs to forward
    proxy: [
        { method: "post",   hubPath: "/ai/:deviceId",                    nodePath: "/ai" },
        { method: "get",    hubPath: "/ai/:deviceId/models",             nodePath: "/ai/models" }
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
