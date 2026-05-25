"use strict";

const express = require("express");
const crypto  = require("crypto");

const { runAgentLoop } = require("../hub/agentLoop");
const { query, run }   = require("../stores/database");

// ══════════════════════════════════════════════════════════════════════════════
// Agent Route
//
// POST /api/chats/:sessionId/agent
//
// Sends a user prompt through the agentic AI loop. The AI can autonomously
// call tools (execute commands, query metrics, manage Docker, etc.) and
// returns a synthesized response along with a trace of all tool calls made.
//
// Request body:  { prompt: string }
// Response:      { response, toolTrace, iterations, model, responseTime }
// ══════════════════════════════════════════════════════════════════════════════

const router = express.Router();

router.post("/:sessionId/agent", async (req, res) => {

    const { sessionId } = req.params;
    const { prompt }    = req.body;

    if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({ error: "prompt field required (string)" });
    }

    try {

        // ── 1. Verify session exists ─────────────────────────────────
        const session = await query(
            `SELECT id FROM chat_sessions WHERE id = ?`,
            [sessionId]
        );

        if (session.length === 0) {
            return res.status(404).json({ error: `Session '${sessionId}' not found. Create one first via POST /api/chats.` });
        }

        // ── 2. Load conversation history for context ─────────────────
        //    Only load 'text' messages (user + assistant), skip raw
        //    tool_call / tool_result entries to keep context clean.
        const history = await query(
            `SELECT role, content FROM chat_messages
             WHERE session_id = ? AND message_type = 'text'
             ORDER BY created_at ASC`,
            [sessionId]
        );

        // ── 3. Save user message to DB ───────────────────────────────
        const userMsgId = crypto.randomUUID();
        await run(
            `INSERT INTO chat_messages (id, session_id, role, content, message_type)
             VALUES (?, ?, ?, ?, ?)`,
            [userMsgId, sessionId, "user", prompt, "text"]
        );

        // Auto-title: set session title from first message
        const msgCount = await query(
            `SELECT COUNT(*) as count FROM chat_messages WHERE session_id = ?`,
            [sessionId]
        );
        if (msgCount[0].count === 1) {
            const title = prompt.substring(0, 50) + (prompt.length > 50 ? "..." : "");
            await run(
                `UPDATE chat_sessions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [title, sessionId]
            );
        }

        // ── 4. Get config (set on app during server boot) ────────────
        const config = req.app.get("hubConfig");
        if (!config) {
            return res.status(500).json({ error: "Hub config not available. Server may still be booting." });
        }

        // ── 5. Run the agentic loop ──────────────────────────────────
        console.log(`[AGENT] Session ${sessionId.substring(0, 8)}… | Prompt: "${prompt.substring(0, 60)}…"`);

        const result = await runAgentLoop(prompt, history, config);

        // ── 6. Save assistant response to DB ─────────────────────────
        const assistantMsgId = crypto.randomUUID();
        await run(
            `INSERT INTO chat_messages (id, session_id, role, content, message_type, tool_calls)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                assistantMsgId,
                sessionId,
                "assistant",
                result.response,
                "text",
                JSON.stringify(result.toolTrace)
            ]
        );

        // Update session timestamp
        await run(
            `UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [sessionId]
        );

        // ── 7. Return full response ──────────────────────────────────
        console.log(`[AGENT] Done — ${result.iterations} iteration(s), ${result.toolTrace.length} tool call(s), ${result.responseTime}`);

        res.json(result);

    } catch (err) {
        console.error("[AGENT ERROR]", err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
