const express = require("express");
const { query, run, get } = require("../stores/database");
const crypto = require("crypto");

const router = express.Router();

// 1. List all sessions
router.get("/", async (req, res) => {
    try {
        const sessions = await query(`SELECT * FROM chat_sessions ORDER BY updated_at DESC`);
        res.json(sessions);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. Create a new session
router.post("/", async (req, res) => {
    try {
        const sessionId = crypto.randomUUID();
        const title = req.body.title || "New Chat";
        await run(`INSERT INTO chat_sessions (id, title) VALUES (?, ?)`, [sessionId, title]);
        res.json({ id: sessionId, title });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. Get messages for a session
router.get("/:sessionId/messages", async (req, res) => {
    try {
        const { sessionId } = req.params;
        const messages = await query(`SELECT role, content, tool_calls, created_at FROM chat_messages WHERE session_id = ? AND message_type = 'text' ORDER BY created_at ASC`, [sessionId]);
        res.json(messages);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Save messages to a session
router.post("/:sessionId/messages", async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { role, content } = req.body;
        const msgId = crypto.randomUUID();
        await run(`INSERT INTO chat_messages (id, session_id, role, content) VALUES (?, ?, ?, ?)`, [msgId, sessionId, role, content]);
        
        // If it's the first message, set the title to a snippet of the content
        const msgs = await query(`SELECT COUNT(*) as count FROM chat_messages WHERE session_id = ?`, [sessionId]);
        if (msgs[0].count === 1 && role === "user") {
            const title = content.substring(0, 30) + (content.length > 30 ? "..." : "");
            await run(`UPDATE chat_sessions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [title, sessionId]);
        } else {
            await run(`UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [sessionId]);
        }
        
        res.json({ success: true, id: msgId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. Delete a session
router.delete("/:sessionId", async (req, res) => {
    try {
        await run(`DELETE FROM chat_sessions WHERE id = ?`, [req.params.sessionId]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
