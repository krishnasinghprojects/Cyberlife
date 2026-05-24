const WebSocket = require("ws");

let wss;
const listeners = {};

function initWebSocket(server) {

    wss = new WebSocket.Server({ server });

    wss.on("connection", (ws) => {

        console.log("[WS CONNECTED] Client joined");

        ws.on("message", (raw) => {
            try {
                const msg = JSON.parse(raw);
                if (msg.type && listeners[msg.type]) {
                    listeners[msg.type].forEach(cb => cb(ws, msg));
                }
            } catch (err) {
                // Ignore invalid JSON
            }
        });

        ws.on("close", () => {
            console.log("[WS DISCONNECTED] Client left");
            if (listeners["disconnect"]) {
                listeners["disconnect"].forEach(cb => cb(ws));
            }
        });
        
        ws.on("error", () => {
            if (listeners["disconnect"]) {
                listeners["disconnect"].forEach(cb => cb(ws));
            }
        });
    });
}

function registerListener(type, callback) {
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push(callback);
}

function sendTo(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function broadcast(data) {

    if (!wss) return;

    const json = JSON.stringify(data);

    wss.clients.forEach(client => {

        if (client.readyState === WebSocket.OPEN) {

            client.send(json);
        }
    });
}

module.exports = {
    initWebSocket,
    registerListener,
    sendTo,
    broadcast
};