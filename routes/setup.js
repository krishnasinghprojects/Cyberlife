const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const { spawn } = require("child_process");

const os = require("os");

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

router.get("/setup/ip", (req, res) => {
    res.json({ ip: getLocalIP() });
});

router.post("/setup/complete", (req, res) => {
    const { type, uid, name, hubUrl, modules, ai, cf } = req.body;

    let envContent = "";

    if (type === "hub") {
        envContent = `HUB_IP=0.0.0.0
HUB_PORT=8000
NODE_UID=${uid || "MacMini"}
NODE_NAME="${name || "Central Hub"}"
NODE_SHELL=/bin/zsh
ENABLED_MODULES=${modules || "command-executor, system-monitor"}
HEARTBEAT_TIMEOUT_MS=60000
WATCHDOG_INTERVAL_MS=15000
METRICS_INTERVAL_MS=5000

# Optional configurations
OLLAMA_URL=${ai ? ai.url : ""}
OLLAMA_DEFAULT_MODEL=${ai ? ai.model : ""}
OLLAMA_MODELS=${ai ? ai.models : ""}
CLOUDFLARE_API_TOKEN=${cf ? cf.token : ""}
CLOUDFLARE_ZONE_ID=${cf ? cf.zone : ""}
CLOUDFLARE_ACCOUNT_ID=${cf ? cf.account : ""}
CLOUDFLARE_DOMAIN=${cf ? cf.domain : ""}
`;
    } else {
        envContent = `HUB_URL=${hubUrl || "http://127.0.0.1:8000"}
NODE_PORT=3001
NODE_UID=${uid || "AgentNode"}
NODE_NAME="${name || "Remote Agent"}"
NODE_SHELL=/bin/zsh
ENABLED_MODULES=${modules || "command-executor, system-monitor"}
HEARTBEAT_INTERVAL_MS=30000
METRICS_INTERVAL_MS=5000

# Optional configurations
OLLAMA_URL=${ai ? ai.url : ""}
OLLAMA_DEFAULT_MODEL=${ai ? ai.model : ""}
OLLAMA_MODELS=${ai ? ai.models : ""}
CLOUDFLARE_API_TOKEN=${cf ? cf.token : ""}
CLOUDFLARE_ZONE_ID=${cf ? cf.zone : ""}
CLOUDFLARE_ACCOUNT_ID=${cf ? cf.account : ""}
CLOUDFLARE_DOMAIN=${cf ? cf.domain : ""}
`;
    }

    try {
        fs.writeFileSync(path.join(__dirname, "..", ".env"), envContent, "utf8");
        res.json({ success: true });
        
        // Seamlessly reboot the server so the user doesn't have to restart manually
        setTimeout(() => {
            console.log("\x1b[32m[SETUP] Configuration generated. Rebooting ecosystem natively...\x1b[0m");
            process.emit("rebootEcosystem");
        }, 1000);
    } catch (e) {
        console.error("[SETUP ERROR] Failed to write .env:", e);
        res.status(500).json({ error: "Failed to write .env" });
    }
});

module.exports = router;
