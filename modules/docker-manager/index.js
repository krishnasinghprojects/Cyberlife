"use strict";

const express = require("express");
const Docker = require("dockerode");

let docker = null;

const os = require("os");
const path = require("path");
const fs = require("fs");

function getDockerSocket() {
    if (process.env.DOCKER_SOCKET) return process.env.DOCKER_SOCKET;

    const paths = [
        path.join(os.homedir(), ".docker", "run", "docker.sock"),
        path.join(os.homedir(), ".orbstack", "run", "docker.sock"),
        path.join(os.homedir(), ".colima", "docker.sock"),
        "/var/run/docker.sock"
    ];

    for (const p of paths) {
        if (fs.existsSync(p)) return p;
    }
    
    return "/var/run/docker.sock"; // Fallback
}

function getDocker() {
    if (!docker) {
        docker = new Docker({ socketPath: getDockerSocket() });
    }
    return docker;
}

const router = express.Router();

router.get("/containers", async (req, res) => {
    try {
        const d = getDocker();
        const containers = await d.listContainers({ all: true });
        
        const results = await Promise.all(containers.map(async (c) => {
            let cpu = 0;
            let ramPercent = 0;
            
            if (c.State === "running") {
                try {
                    const container = d.getContainer(c.Id);
                    const stats = await container.stats({ stream: false });
                    
                    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
                    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
                    if (systemDelta > 0 && cpuDelta > 0) {
                        cpu = (cpuDelta / systemDelta) * (stats.cpu_stats.online_cpus || 1) * 100;
                    }
                    
                    const usedMemory = stats.memory_stats.usage;
                    const totalMemory = stats.memory_stats.limit;
                    if (totalMemory > 0) {
                        ramPercent = (usedMemory / totalMemory) * 100;
                    }
                } catch (e) {
                    // Fail silently for stats
                }
            }
            
            return {
                id: c.Id.substring(0, 12),
                name: c.Names[0].replace(/^\//, ''),
                image: c.Image,
                state: c.State,
                status: c.Status,
                cpu: parseFloat(cpu.toFixed(2)),
                ram: parseFloat(ramPercent.toFixed(2))
            };
        }));
        
        res.json(results);
    } catch (err) {
        console.error("[DOCKER] List Error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post("/containers/:id/:action", async (req, res) => {
    try {
        const d = getDocker();
        const container = d.getContainer(req.params.id);
        const action = req.params.action;
        
        if (action === "start") {
            await container.start();
        } else if (action === "stop") {
            await container.stop();
        } else if (action === "restart") {
            await container.restart();
        } else {
            return res.status(400).json({ error: "Invalid action" });
        }
        
        res.json({ success: true, action });
    } catch (err) {
        console.error(`[DOCKER] Action Error (${req.params.action}):`, err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = {
    name: "docker-manager",
    capability: "docker",

    routes: router,

    // Hub proxy routes — allows the dispatch layer to forward Docker
    // requests to any device that has the docker capability.
    proxy: [
        { method: "get",  hubPath: "/docker/:deviceId/containers",                nodePath: "/containers" },
        { method: "post", hubPath: "/docker/:deviceId/containers/:id/:action",    nodePath: "/containers/:id/:action" }
    ],

    init: async (config, { registerListener, sendTo } = {}) => {
        console.log(`[MODULE] docker-manager initialized`);
    },

    cleanup: async () => {
        docker = null;
    }
};
