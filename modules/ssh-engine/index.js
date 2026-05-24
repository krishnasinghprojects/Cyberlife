"use strict";

const { Client } = require("ssh2");

// Map WebSocket objects to active SSH sessions for atomicity
const activeSessions = new Map();

function init(config, hooks) {
    if (!hooks.registerListener) return;

    const { registerListener, sendTo } = hooks;

    registerListener("ssh-connect", (ws, msg) => {
        const { host, port = 22, username, password } = msg.payload;

        if (!host || !username || !password) {
            return sendTo(ws, { type: "ssh-error", error: "Missing SSH connection details" });
        }

        // Clean up any existing session for this specific WebSocket
        if (activeSessions.has(ws)) {
            const oldSession = activeSessions.get(ws);
            if (oldSession.stream) oldSession.stream.end();
            if (oldSession.conn) oldSession.conn.end();
            activeSessions.delete(ws);
        }

        const conn = new Client();

        conn.on("ready", () => {
            sendTo(ws, { type: "ssh-ready" });

            conn.shell({ term: 'xterm-256color' }, (err, stream) => {
                if (err) {
                    sendTo(ws, { type: "ssh-error", error: err.message });
                    conn.end();
                    return;
                }

                stream.on("data", (data) => {
                    sendTo(ws, { type: "ssh-data", data: data.toString("base64") });
                }).on("close", () => {
                    sendTo(ws, { type: "ssh-close" });
                    conn.end();
                });

                activeSessions.set(ws, { conn, stream });
            });
        }).on("error", (err) => {
            sendTo(ws, { type: "ssh-error", error: err.message });
        }).on("end", () => {
            sendTo(ws, { type: "ssh-close" });
            activeSessions.delete(ws);
        }).on("close", () => {
            sendTo(ws, { type: "ssh-close" });
            activeSessions.delete(ws);
        });

        try {
            conn.connect({ host, port, username, password, readyTimeout: 10000 });
        } catch (err) {
            sendTo(ws, { type: "ssh-error", error: err.message });
        }
    });

    registerListener("ssh-data", (ws, msg) => {
        const session = activeSessions.get(ws);
        if (session && session.stream) {
            session.stream.write(Buffer.from(msg.data, "base64"));
        }
    });

    registerListener("ssh-resize", (ws, msg) => {
        const session = activeSessions.get(ws);
        if (session && session.stream) {
            const { cols, rows } = msg.payload;
            // setWindow format: rows, cols, height, width
            session.stream.setWindow(rows, cols, 0, 0); 
        }
    });

    registerListener("disconnect", (ws) => {
        if (activeSessions.has(ws)) {
            const session = activeSessions.get(ws);
            if (session.stream) session.stream.end();
            if (session.conn) session.conn.end();
            activeSessions.delete(ws);
        }
    });
}

module.exports = {
    name: "ssh-engine",
    capability: "ssh-proxy",
    init
};
