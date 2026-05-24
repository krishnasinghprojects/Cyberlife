"use strict";

const path = require("path");

/**
 * loadModules(moduleNames, config, hooks)
 *
 * Dynamically loads each module from the modules/ directory,
 * calls init() with the config + any hooks the caller provides,
 * and returns an array of loaded module objects.
 *
 * @param {string[]}  moduleNames  — e.g. ["command-executor", "system-monitor"]
 * @param {object}    config       — parsed .env values
 * @param {object}    hooks        — per-module hooks (e.g. { reportMetrics })
 * @returns {Promise<object[]>}    — array of loaded module objects
 */
async function loadModules(moduleNames, config, hooks = {}) {

    const loaded = [];

    for (const name of moduleNames) {

        const modulePath = path.join(__dirname, "..", "modules", name);
        let mod;

        try {
            mod = require(modulePath);
        } catch (err) {
            console.error(`[MODULE LOAD ERROR] ${name}:`, err.message);
            continue;
        }

        // Platform check — skip if module declares platforms and we're not one
        if (mod.platforms && !mod.platforms.includes(process.platform)) {
            console.warn(`[MODULE SKIP] ${name} — not supported on ${process.platform}`);
            continue;
        }

        // Initialize the module
        if (typeof mod.init === "function") {
            try {
                await mod.init(config, hooks);
            } catch (err) {
                console.error(`[MODULE INIT ERROR] ${name}:`, err.message);
                continue;
            }
        }

        loaded.push(mod);
        console.log(`[MODULE LOADED] ${name} → capability: ${mod.capability}`);
    }

    return loaded;
}

module.exports = { loadModules };
