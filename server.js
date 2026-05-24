const express = require("express");

const http = require("http");

const cors = require("cors");

const path = require("path");

const os = require("os");

const si = require("systeminformation");

const registerRoutes   = require("./routes/register");

const commandRoutes    = require("./routes/command");

const monitoringRoutes = require("./routes/monitoring");

const metricsRoutes    = require("./routes/metrics");

const aiRoutes         = require("./routes/ai");

const { initWebSocket, broadcast } = require("./websocket/socket");

const DEVICES = require("./deviceStore");

const METRICS = require("./metricsStore");

const app    = express();

const server = http.createServer(app);

app.use(cors());

app.use(express.json());


// ROUTES
app.use(registerRoutes);
app.use(commandRoutes);
app.use(monitoringRoutes);
app.use(metricsRoutes);
app.use(aiRoutes);


// STATIC DASHBOARD
app.use(express.static(
    path.join(__dirname, "public")
));


// WEBSOCKET
initWebSocket(server);


// ── MACMINI SELF-REGISTRATION ────────────────────────────────────────────────
// The hub registers itself into the device store so it appears on the
// dashboard alongside the remote nodes. No HTTP call needed — we write
// directly into the shared in-memory store.
DEVICES["MacMini"] = {
    uid:           "MacMini",
    name:          "Mac Mini",
    ip:            "10.120.0.250",
    port:          8000,
    capabilities:  ["hub", "metrics", "execute-command"],
    status:        "online",
    lastHeartbeat: Date.now()
};

// Collect the hub's own CPU / RAM / disk every 5 s, store in METRICS,
// refresh lastHeartbeat so the watchdog never marks it offline, and
// broadcast a metrics-update so the dashboard gauges animate live.
async function pushHubMetrics() {
    try {
        const [load, mem, disks] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.fsSize()
        ]);

        const primaryDisk = disks.sort((a, b) => b.size - a.size)[0] || {};

        const metrics = {
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

        METRICS["MacMini"] = { ...metrics, timestamp: Date.now() };

        // Keep the watchdog happy — hub is always considered alive
        DEVICES["MacMini"].lastHeartbeat = Date.now();

        broadcast({
            type:     "metrics-update",
            deviceId: "MacMini",
            metrics:  METRICS["MacMini"]
        });

    } catch (err) {
        console.error("[HUB METRICS]", err.message);
    }
}

// Run once immediately on boot, then every 5 s
pushHubMetrics();
setInterval(pushHubMetrics, 5_000);


// ── HEARTBEAT WATCHDOG ───────────────────────────────────────────────────────
// MacMini is excluded — its lastHeartbeat is kept fresh by pushHubMetrics().
// Only remote devices that go silent for >60 s are marked offline.
const HEARTBEAT_TIMEOUT_MS = 60_000;
const WATCHDOG_INTERVAL_MS = 15_000;

setInterval(() => {

    const now = Date.now();
    let changed = false;

    Object.values(DEVICES).forEach(device => {

        if (
            device.uid    !== "MacMini"  &&
            device.status === "online"   &&
            (now - device.lastHeartbeat) > HEARTBEAT_TIMEOUT_MS
        ) {
            device.status = "offline";
            changed = true;
            console.log(`[OFFLINE] ${device.uid}`);
        }
    });

    if (changed) {
        broadcast({ type: "device-update", devices: DEVICES });
    }

}, WATCHDOG_INTERVAL_MS);


server.listen(8000, "0.0.0.0", () => {

    console.log("[CYBERLIFE HUB ONLINE] MacMini @ 10.120.0.250:8000");
});