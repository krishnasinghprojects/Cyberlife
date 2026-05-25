const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8000/vnc-proxy?target=127.0.0.1&port=5900', ['binary']);

ws.on('open', () => {
    console.log('Connected. Subprotocol:', ws.protocol);
    ws.close();
});

ws.on('error', (err) => {
    console.error('WS Error:', err);
});
