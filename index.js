"use strict";

require("dotenv").config();
const os = require("os");
const fs = require("fs");
const path = require("path");

function getLocalIP() {
    for (const iface of Object.values(os.networkInterfaces())) {
        for (const addr of iface) {
            if (addr.family === "IPv4" && !addr.internal) {
                return addr.address;
            }
        }
    }
    return "127.0.0.1";
}

// ── BOOT ROUTER ──────────────────────────────────────────────────────────────
if (!process.env.NODE_UID) {
    console.log("\x1b[33m[BOOT] No valid .env found. Entering Setup Mode...\x1b[0m");
    const express = require("express");
    const cors = require("cors");
    
    const setupApp = express();
    setupApp.use(cors());
    setupApp.use(express.json());
    
    // Serve setup.html
    setupApp.get("/", (req, res) => {
        const htmlPath = path.join(__dirname, "public", "setup.html");
        res.sendFile(htmlPath);
    });
    
    setupApp.use(express.static(path.join(__dirname, "public")));
    setupApp.use("/api", require("./routes/setup"));
    
    setupApp.listen(8000, "0.0.0.0", () => {
        const ip = getLocalIP();
        console.log(`\x1b[32m[SETUP] Web UI is running. Please open http://localhost:8000 or http://${ip}:8000 in your browser.\x1b[0m`);
    });

} else if (process.env.HUB_IP) {
    console.log("\x1b[36m[BOOT] Central Hub configuration detected. Booting Hub...\x1b[0m");
    require("./server.js");
} else if (process.env.HUB_URL) {
    console.log("\x1b[36m[BOOT] Remote Agent configuration detected. Booting Agent...\x1b[0m");
    require("./agent.js");
} else {
    console.error("\x1b[31m[BOOT ERROR] Invalid .env configuration. Missing HUB_IP or HUB_URL.\x1b[0m");
    process.exit(1);
}
