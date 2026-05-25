const WebSocket = require('ws');
const net = require('net');
const url = require('url');

// Create a WebSocket server that does not automatically attach to an HTTP server
const wss = new WebSocket.Server({ 
    noServer: true,
    handleProtocols: (protocols, request) => {
        // noVNC explicitly requires the 'binary' subprotocol.
        return 'binary';
    }
});

wss.on('connection', (ws, req) => {
    // Extract target IP and Port from the URL query
    // Example: ws://localhost:8000/vnc-proxy?target=10.120.0.100&port=5900
    const query = new URLSearchParams(url.parse(req.url).query);
    const targetHost = query.get('target');
    const targetPort = parseInt(query.get('port')) || 5900;

    if (!targetHost) {
        console.error('[VNC PROXY] Missing target host in query parameters');
        ws.close(1008, 'Missing target host');
        return;
    }

    console.log(`[VNC PROXY] Connecting to ${targetHost}:${targetPort}`);

    // Open a TCP connection to the target VNC server
    const tcpSocket = new net.Socket();
    let serverState = 0; // 0 = expecting RFB, 1 = expecting security types

    tcpSocket.connect(targetPort, targetHost, () => {
        console.log(`[VNC PROXY] Connected to ${targetHost}:${targetPort}`);
    });

    // Pipe WebSocket messages (from noVNC client) to the TCP socket
    ws.on('message', (msg) => {
        if (tcpSocket.readyState === 'open') {
            tcpSocket.write(msg);
        }
    });

    // Pipe TCP data (from VNC server) to the WebSocket
    tcpSocket.on('data', (data) => {
        
        // Intercept and rewrite security types to force Standard VNC Auth (Type 2)
        if (serverState === 0 && data.length >= 12 && data.toString().startsWith("RFB ")) {
            serverState = 1;
        } else if (serverState === 1) {
            const numTypes = data[0];
            if (numTypes > 0 && data.length >= 1 + numTypes) {
                let hasVncAuth = false;
                for (let i = 1; i <= numTypes; i++) {
                    if (data[i] === 2) hasVncAuth = true;
                }
                
                // If Mac OS offers Type 2, force it by stripping out the proprietary Apple ones
                if (hasVncAuth) {
                    console.log(`[VNC PROXY] Intercepted Security Types. Forcing VNC Auth (Type 2).`);
                    const forcedPacket = Buffer.from([1, 2]); // 1 type, Type 2
                    const remainder = data.subarray(1 + numTypes);
                    data = Buffer.concat([forcedPacket, remainder]);
                }
            }
            serverState = 2; // Done with security handshake
        }

        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
        }
    });

    // Error handling
    tcpSocket.on('error', (err) => {
        console.error(`[VNC PROXY] TCP Error (${targetHost}):`, err.message);
        if (ws.readyState === WebSocket.OPEN) ws.close(1011, 'TCP Socket Error');
    });

    ws.on('error', (err) => {
        console.error(`[VNC PROXY] WebSocket Error:`, err.message);
        tcpSocket.destroy();
    });

    // Close handling
    tcpSocket.on('close', () => {
        console.log(`[VNC PROXY] TCP Connection closed (${targetHost})`);
        if (ws.readyState === WebSocket.OPEN) ws.close(1000, 'TCP Closed');
    });

    ws.on('close', () => {
        console.log(`[VNC PROXY] WebSocket client disconnected`);
        tcpSocket.destroy();
    });
});

module.exports = {
    name: "vnc-engine",
    capability: "vnc",
    wss: wss, // Export the WSS to be mounted by server.js
    init: async (config) => {
        console.log(`[MODULE] vnc-engine initialized`);
    }
};
