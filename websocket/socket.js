const WebSocket = require("ws");

let wss;

function initWebSocket(server) {

    wss = new WebSocket.Server({ server });

    wss.on("connection", () => {

        console.log("[WS CONNECTED]");
    });
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
    broadcast
};