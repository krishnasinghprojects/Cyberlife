/* ═══════════════════════════════════════════════════════════════════════════
   CYBERLIFE HUB — Dashboard Client
   Two modes: Monitoring (device grid + live metrics) / Chat (AI inference)
   ═══════════════════════════════════════════════════════════════════════════ */

"use strict";

/* ─── CONSTANTS ───────────────────────────────────────────────────────────── */
const CIRCUMFERENCE = 175.929; // 2 * Math.PI * 28

/* ─── STATE ───────────────────────────────────────────────────────────────── */
let allDevices  = {};
let allMetrics  = {};
let currentMode = "monitoring"; // "monitoring" | "chat" | "ssh"

// Chat state
let chatSessionId    = newSessionId();
let selectedAiDevice = "";
let selectedModel    = "";
let chatBusy         = false;

/* ─── DOM REFS ────────────────────────────────────────────────────────────── */
const connDot      = document.getElementById("conn-dot");
const connLabel    = document.getElementById("conn-label");
const countTotal   = document.getElementById("count-total");
const countOnline  = document.getElementById("count-online");
const clockEl      = document.getElementById("clock");
const dateEl       = document.getElementById("dateline");
const grid         = document.getElementById("devices-grid");

const btnTheme     = document.getElementById("btn-theme");
const themeIcon    = document.getElementById("theme-icon");

const btnMonitor   = document.getElementById("btn-monitor");
const btnChat      = document.getElementById("btn-chat");
const btnSsh       = document.getElementById("btn-ssh");

const viewMonitor  = document.getElementById("view-monitoring");
const viewChat     = document.getElementById("view-chat");
const viewSsh      = document.getElementById("view-ssh");

const sshDeviceSel   = document.getElementById("ssh-device-select");
const sshHostInput   = document.getElementById("ssh-host-input");
const sshUserInput   = document.getElementById("ssh-user");
const sshPassInput   = document.getElementById("ssh-pass");
const btnSshConnect  = document.getElementById("btn-ssh-connect");
const sshConnectLbl  = document.getElementById("ssh-connect-label");
const terminalContainer = document.getElementById("terminal-container");

let xterm = null;
let xtermFit = null;
let sshConnected = false;

const aiDeviceSel  = document.getElementById("ai-device-select");
const modelSel     = document.getElementById("model-select");
const sessionBadge = document.getElementById("session-badge");
const chatMessages = document.getElementById("chat-messages");
const chatInput    = document.getElementById("chat-input");
const chatSendBtn  = document.getElementById("chat-send");
const btnNewChat   = document.getElementById("btn-new-chat");
const btnClear     = document.getElementById("btn-clear-history");

/* ─── WEBSOCKET ───────────────────────────────────────────────────────────── */
const ws = new WebSocket(`ws://${window.location.host}`);

ws.onopen = () => {
    connDot.className    = "conn-dot online";
    connLabel.textContent = "Hub Connected";
};

ws.onclose = () => {
    connDot.className    = "conn-dot offline";
    connLabel.textContent = "Hub Disconnected";
};

ws.onerror = () => {
    connDot.className    = "conn-dot offline";
    connLabel.textContent = "Connection Error";
};

ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);

    if (msg.type === "device-update") {
        allDevices = msg.devices;
        syncCards();
        updateHeaderStats();
        refreshAiDeviceSelect();

    } else if (msg.type === "metrics-update") {
        allMetrics[msg.deviceId] = msg.metrics;
        applyMetrics(msg.deviceId, msg.metrics);
    } else if (msg.type === "ssh-ready") {
        sshConnected = true;
        sshConnectLbl.textContent = "Disconnect";
        if (xtermFit) {
            xtermFit.fit();
            ws.send(JSON.stringify({ type: "ssh-resize", payload: { cols: xterm.cols, rows: xterm.rows } }));
        }
        xterm.write("\r\n\x1b[32m[Connected]\x1b[0m\r\n");
    } else if (msg.type === "ssh-data") {
        if (xterm) xterm.write(atob(msg.data));
    } else if (msg.type === "ssh-error") {
        if (xterm) xterm.write(`\r\n\x1b[31m[SSH Error: ${msg.error}]\x1b[0m\r\n`);
        resetSshState();
    } else if (msg.type === "ssh-close") {
        if (xterm) xterm.write("\r\n\x1b[33m[Connection closed]\x1b[0m\r\n");
        resetSshState();
    }
};

/* ─── THEME SWITCHING ─────────────────────────────────────────────────────── */
function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    
    if (themeIcon) {
        themeIcon.setAttribute("data-lucide", next === "dark" ? "sun" : "moon");
        refreshIcons();
    }

    if (xterm) {
        xterm.options.theme = {
            background: next === "dark" ? "#070306" : "#fef7f9",
            foreground: next === "dark" ? "#f2e6e9" : "#2e1820",
            cursor: "#dc143c",
            selectionBackground: "rgba(220, 20, 60, 0.3)"
        };
    }
}

if (btnTheme) btnTheme.addEventListener("click", toggleTheme);

function initTheme() {
    const savedTheme = localStorage.getItem("theme") || "dark";
    if (savedTheme === "light") {
        document.documentElement.setAttribute("data-theme", "light");
        if (themeIcon) themeIcon.setAttribute("data-lucide", "moon");
    } else {
        if (themeIcon) themeIcon.setAttribute("data-lucide", "sun");
    }
}

/* ─── MODE SWITCHING ──────────────────────────────────────────────────────── */
function setMode(mode) {
    currentMode = mode;

    const isMonitor = mode === "monitoring";
    const isChat    = mode === "chat";
    const isSsh     = mode === "ssh";

    btnMonitor.classList.toggle("active", isMonitor);
    btnChat.classList.toggle("active", isChat);
    if (btnSsh) btnSsh.classList.toggle("active", isSsh);

    btnMonitor.setAttribute("aria-selected", isMonitor);
    btnChat.setAttribute("aria-selected", isChat);
    if (btnSsh) btnSsh.setAttribute("aria-selected", isSsh);

    viewMonitor.classList.toggle("hidden", !isMonitor);
    viewChat.classList.toggle("hidden", !isChat);
    if (viewSsh) viewSsh.classList.toggle("hidden", !isSsh);

    if (isChat) refreshAiDeviceSelect();
    if (isSsh) {
        refreshSshDeviceSelect();
        initTerminal();
        setTimeout(() => { if (xtermFit) xtermFit.fit(); }, 50);
    }

    if (!isMonitor) refreshIcons();
}

btnMonitor.addEventListener("click", () => setMode("monitoring"));
btnChat.addEventListener("click",    () => setMode("chat"));
if (btnSsh) btnSsh.addEventListener("click", () => setMode("ssh"));

/* ─── INIT ────────────────────────────────────────────────────────────────── */
async function init() {
    try {
        const [devRes, metRes] = await Promise.all([
            fetch("/monitoring"),
            fetch("/metrics")
        ]);

        allDevices = await devRes.json();
        allMetrics = await metRes.json();

        syncCards();
        Object.entries(allMetrics).forEach(([id, m]) => applyMetrics(id, m));
        updateHeaderStats();
        refreshAiDeviceSelect();
        refreshSshDeviceSelect();

    } catch (err) {
        console.error("[INIT]", err.message);
    }
}

/* ─── MONITORING: SYNC CARDS ──────────────────────────────────────────────── */
function syncCards() {
    const deviceList = Object.values(allDevices);

    const emptyState = document.getElementById("empty-state");

    if (deviceList.length === 0) {
        if (!emptyState) {
            grid.innerHTML = `
                <div class="empty-state" id="empty-state">
                    <svg class="empty-ring" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="40" stroke="rgba(220,20,60,0.15)"
                                stroke-width="1.5" fill="none" stroke-dasharray="6 4"/>
                        <circle cx="50" cy="50" r="6" fill="rgba(220,20,60,0.25)"/>
                        <circle cx="50" cy="50" r="3" fill="rgba(220,20,60,0.7)"/>
                    </svg>
                    <p class="empty-title">Waiting for devices</p>
                    <span class="empty-sub">Devices will appear once they register with the hub</span>
                </div>`;
        }
        return;
    }

    if (emptyState) emptyState.remove();

    // Remove stale cards
    grid.querySelectorAll(".device-card").forEach(card => {
        if (!allDevices[card.dataset.uid]) card.remove();
    });

    // Add or patch each device
    deviceList.forEach(device => {
        const existing = grid.querySelector(`[data-uid="${escAttr(device.uid)}"]`);
        if (existing) {
            patchCard(existing, device);
        } else {
            const card = buildCard(device);
            grid.appendChild(card);
            if (allMetrics[device.uid]) applyMetrics(device.uid, allMetrics[device.uid]);
            refreshIcons(); // re-scan after adding card with data-lucide attrs
        }
    });
}

/* ─── BUILD CARD ──────────────────────────────────────────────────────────── */
function buildCard(device) {
    const card = document.createElement("div");
    card.className = `device-card ${device.status}`;
    card.dataset.uid = device.uid;
    card.innerHTML = cardHTML(device);

    const toggle = card.querySelector(".cmd-toggle");
    const panel  = card.querySelector(".cmd-panel");

    toggle.addEventListener("click", () => {
        toggle.classList.toggle("open");
        panel.classList.toggle("open");
    });

    card.querySelector(".cmd-run").addEventListener("click", () => runCommand(device.uid, card));
    card.querySelector(".cmd-input").addEventListener("keydown", e => {
        if (e.key === "Enter") runCommand(device.uid, card);
    });

    return card;
}

/* ─── PATCH CARD (status + last-seen only, no re-render) ─────────────────── */
function patchCard(card, device) {
    card.className = `device-card ${device.status}`;

    const badge = card.querySelector(".status-badge");
    if (badge) {
        badge.className   = `status-badge ${device.status}`;
        badge.textContent = device.status;
    }

    const seenEl = card.querySelector(".last-seen-val");
    if (seenEl) seenEl.textContent = fmtAge(device.lastHeartbeat);
}

/* ─── CARD HTML ───────────────────────────────────────────────────────────── */
function cardHTML(device) {
    const caps = (device.capabilities || []).join(", ") || "—";
    return `
        <div class="card-head">
            <div class="card-identity">
                <div class="device-icon">${deviceIconHtml(device.uid, device.capabilities)}</div>
                <div>
                    <div class="device-name">${esc(device.name || device.uid)}</div>
                    <div class="device-uid">${esc(device.uid)}</div>
                </div>
            </div>
            <span class="status-badge ${device.status}">${device.status}</span>
        </div>

        <div class="gauges-row">
            ${makeGauge("cpu",  "CPU",  "#dc143c")}
            ${makeGauge("ram",  "RAM",  "#f59e0b")}
            ${makeGauge("disk", "DISK", "#818cf8")}
        </div>

        <div class="device-info">
            <div class="info-row">
                <span class="info-key">IP</span>
                <span class="info-val mono">${esc(device.ip || "—")}</span>
            </div>
            <div class="info-row">
                <span class="info-key">PORT</span>
                <span class="info-val mono">${esc(String(device.port || "—"))}</span>
            </div>
            <div class="info-row">
                <span class="info-key">CAPS</span>
                <span class="info-val">${esc(caps)}</span>
            </div>
            <div class="info-row">
                <span class="info-key">SEEN</span>
                <span class="info-val last-seen-val">${fmtAge(device.lastHeartbeat)}</span>
            </div>
        </div>

        <div class="cmd-section">
            <button class="cmd-toggle">
                <i data-lucide="terminal"></i>
                Terminal
                <i data-lucide="chevron-down" class="cmd-arrow"></i>
            </button>
            <div class="cmd-panel">
                <div class="cmd-input-row">
                    <span class="cmd-prompt">$</span>
                    <input class="cmd-input" type="text"
                           placeholder="enter command…" spellcheck="false"
                           autocomplete="off" autocorrect="off"/>
                    <button class="cmd-run" title="Run command">
                        <i data-lucide="play"></i>
                    </button>
                </div>
                <div class="cmd-output"></div>
            </div>
        </div>`;
}

/* ─── GAUGE SVG ───────────────────────────────────────────────────────────── */
function makeGauge(type, label, color) {
    return `
        <div class="gauge-wrap">
            <svg class="gauge-svg" viewBox="0 0 80 80">
                <circle class="gauge-track" cx="40" cy="40" r="28"/>
                <circle class="gauge-fill gauge-fill-${type}" cx="40" cy="40" r="28"
                        stroke="${color}"
                        transform="rotate(-90 40 40)"/>
                <text class="gauge-pct gauge-pct-${type}"
                      x="40" y="44" text-anchor="middle">—</text>
            </svg>
            <span class="gauge-lbl">${label}</span>
        </div>`;
}

/* ─── APPLY METRICS IN-PLACE ──────────────────────────────────────────────── */
function applyMetrics(deviceId, metrics) {
    const card = grid.querySelector(`[data-uid="${escAttr(deviceId)}"]`);
    if (!card) return;

    setGauge(card, "cpu",  metrics.cpu ?? null);
    setGauge(card, "ram",  metrics.ram?.percent ?? null);
    setGauge(card, "disk", metrics.disk?.percent ?? null);
}

function setGauge(card, type, value) {
    const fill = card.querySelector(`.gauge-fill-${type}`);
    const text = card.querySelector(`.gauge-pct-${type}`);
    const v    = value !== null ? Math.min(100, Math.max(0, Math.round(value))) : null;

    if (fill) {
        fill.style.strokeDashoffset = v !== null 
            ? CIRCUMFERENCE - (v / 100) * CIRCUMFERENCE 
            : CIRCUMFERENCE;
    }

    if (text) text.textContent = v !== null ? `${v}%` : "—";
}

/* ─── COMMAND EXECUTION ───────────────────────────────────────────────────── */
async function runCommand(deviceId, card) {
    const input  = card.querySelector(".cmd-input");
    const output = card.querySelector(".cmd-output");
    const cmd    = input.value.trim();

    if (!cmd) return;

    output.innerHTML =
        `<div class="out-prompt">$ ${esc(cmd)}</div>` +
        `<div class="out-loading">Running…</div>`;

    input.value = "";

    try {
        const res  = await fetch(`/command/${encodeURIComponent(deviceId)}`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ command: cmd })
        });

        const data = await res.json();
        let html = `<div class="out-prompt">$ ${esc(cmd)}</div>`;

        if (data.stdout) html += `<div class="out-stdout">${esc(data.stdout)}</div>`;
        if (data.stderr) html += `<div class="out-stderr">${esc(data.stderr)}</div>`;
        if (data.error)  html += `<div class="out-stderr">Error: ${esc(data.error)}</div>`;
        if (!data.stdout && !data.stderr && !data.error) {
            html += `<div class="out-muted">No output.</div>`;
        }

        output.innerHTML = html;

    } catch (err) {
        output.innerHTML =
            `<div class="out-prompt">$ ${esc(cmd)}</div>` +
            `<div class="out-stderr">Request failed: ${esc(err.message)}</div>`;
    }

    output.scrollTop = output.scrollHeight;
}

/* ─── CHAT: AI DEVICE SELECT ──────────────────────────────────────────────── */
function refreshAiDeviceSelect() {
    const aiDevices = Object.values(allDevices).filter(
        d => d.capabilities?.includes("ai-inference") && d.status === "online"
    );

    const prev = aiDeviceSel.value;
    aiDeviceSel.innerHTML = "";

    if (aiDevices.length === 0) {
        aiDeviceSel.innerHTML = `<option value="">No AI nodes online</option>`;
        modelSel.innerHTML    = `<option value="">—</option>`;
        selectedAiDevice = "";
        return;
    }

    aiDevices.forEach(d => {
        const opt = document.createElement("option");
        opt.value = d.uid;
        opt.textContent = d.name || d.uid;
        aiDeviceSel.appendChild(opt);
    });

    // Restore previous selection if still valid
    if (prev && aiDevices.find(d => d.uid === prev)) {
        aiDeviceSel.value = prev;
    }

    const current = aiDeviceSel.value;

    if (current !== selectedAiDevice) {
        selectedAiDevice = current;
        loadModels(current);
    }
}

aiDeviceSel.addEventListener("change", () => {
    selectedAiDevice = aiDeviceSel.value;
    loadModels(selectedAiDevice);
});

/* ─── CHAT: LOAD MODELS ───────────────────────────────────────────────────── */
async function loadModels(deviceId) {
    if (!deviceId) return;

    modelSel.innerHTML = `<option value="">Loading…</option>`;

    try {
        const res  = await fetch(`/ai/${encodeURIComponent(deviceId)}/models`);
        const data = await res.json();

        if (data.error) throw new Error(data.error);

        const models = data.models || [];
        modelSel.innerHTML = "";

        models.forEach(m => {
            const opt = document.createElement("option");
            opt.value = m;
            opt.textContent = m;
            modelSel.appendChild(opt);
        });

        // Default to the node's configured default
        if (data.default && models.includes(data.default)) {
            modelSel.value = data.default;
        }

        selectedModel = modelSel.value;

    } catch (err) {
        modelSel.innerHTML = `<option value="">Error: ${esc(err.message)}</option>`;
    }
}

modelSel.addEventListener("change", () => {
    selectedModel = modelSel.value;
});

/* ─── CHAT: SESSION MANAGEMENT ────────────────────────────────────────────── */
function updateSessionBadge() {
    sessionBadge.textContent = chatSessionId.slice(0, 16) + "…";
    sessionBadge.title = chatSessionId;
}

btnNewChat.addEventListener("click", () => {
    chatSessionId = newSessionId();
    updateSessionBadge();
    clearChatUI();
});

btnClear.addEventListener("click", async () => {
    if (!selectedAiDevice || !chatSessionId) return;

    try {
        await fetch(`/ai/${encodeURIComponent(selectedAiDevice)}/history/${chatSessionId}`, {
            method: "DELETE"
        });
        clearChatUI();
    } catch (err) {
        console.error("[CLEAR HISTORY]", err.message);
    }
});

function clearChatUI() {
    chatMessages.innerHTML = `
        <div class="chat-welcome" id="chat-welcome">
            <i data-lucide="brain" class="welcome-icon"></i>
            <p class="welcome-title">Cyberlife AI</p>
            <span class="welcome-sub">Ollama-powered inference via MacBook Pro node</span>
            <span class="welcome-hint">Select a node and model above to begin</span>
        </div>`;
    refreshIcons();
}

/* ─── CHAT: SEND MESSAGE ──────────────────────────────────────────────────── */
async function sendMessage() {
    const prompt = chatInput.value.trim();
    if (!prompt || chatBusy) return;

    selectedModel = modelSel.value;

    if (!selectedAiDevice) {
        alert("No AI node selected.");
        return;
    }

    if (!selectedModel) {
        alert("No model selected.");
        return;
    }

    // Remove welcome screen on first message
    const welcome = document.getElementById("chat-welcome");
    if (welcome) welcome.remove();

    chatBusy = true;
    chatInput.value = "";
    chatSendBtn.disabled = true;

    // Append user bubble
    appendMessage("user", prompt);

    // Append thinking indicator
    const thinkingId = "thinking-" + Date.now();
    appendThinking(thinkingId);

    try {
        const res = await fetch(`/ai/${encodeURIComponent(selectedAiDevice)}`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
                prompt,
                model:     selectedModel,
                sessionId: chatSessionId
            })
        });

        const data = await res.json();

        removeThinking(thinkingId);

        if (data.error) {
            appendMessage("ai", `Error: ${data.error}`, null, true);
        } else {
            appendMessage(
                "ai",
                data.response || "No response",
                data.responseTime
            );
        }

    } catch (err) {
        removeThinking(thinkingId);
        appendMessage("ai", `Request failed: ${err.message}`, null, true);
    }

    chatBusy = false;
    chatSendBtn.disabled = false;
    chatInput.focus();
}

chatSendBtn.addEventListener("click", sendMessage);
chatInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

/* ─── CHAT: APPEND MESSAGES ───────────────────────────────────────────────── */
function appendMessage(role, text, meta = null, isError = false) {
    const wrapper = document.createElement("div");
    wrapper.className = `msg msg-${role}`;

    const roleLabel = role === "user" ? "You" : "Cyberlife AI";
    const metaHtml  = meta ? `<div class="msg-meta">${esc(meta)}</div>` : "";
    const bubbleCls = isError ? "msg-bubble msg-error" : "msg-bubble";

    wrapper.innerHTML = `
        <div class="msg-role">${roleLabel}</div>
        <div class="${bubbleCls}">${esc(text)}</div>
        ${metaHtml}`;

    chatMessages.appendChild(wrapper);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendThinking(id) {
    const wrapper = document.createElement("div");
    wrapper.className = "msg msg-ai";
    wrapper.id = id;
    wrapper.innerHTML = `
        <div class="msg-role">Cyberlife AI</div>
        <div class="thinking-dots">
            <span></span><span></span><span></span>
        </div>`;
    chatMessages.appendChild(wrapper);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeThinking(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

/* ─── HEADER STATS ────────────────────────────────────────────────────────── */
function updateHeaderStats() {
    const list   = Object.values(allDevices);
    const online = list.filter(d => d.status === "online").length;
    countTotal.textContent  = list.length;
    countOnline.textContent = online;
}

/* ─── DEVICE ICON (Lucide, no emoji) ─────────────────────────────────────── */
function deviceIconHtml(uid, capabilities = []) {
    if (uid === "MacMini")    return `<i data-lucide="server"></i>`;
    if (uid === "MacBookPro") return `<i data-lucide="brain"></i>`;
    if (uid === "DellG15")    return `<i data-lucide="monitor"></i>`;
    if (capabilities.includes("ai-inference"))    return `<i data-lucide="brain"></i>`;
    if (capabilities.includes("execute-command")) return `<i data-lucide="monitor"></i>`;
    return `<i data-lucide="box"></i>`;
}

/* ─── CLOCK + LAST-SEEN TICKER ────────────────────────────────────────────── */
setInterval(() => {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    dateEl.textContent  = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

    grid.querySelectorAll(".device-card").forEach(card => {
        const device = allDevices[card.dataset.uid];
        const el     = card.querySelector(".last-seen-val");
        if (device && el) el.textContent = fmtAge(device.lastHeartbeat);
    });
}, 1000);

/* ─── HELPERS ─────────────────────────────────────────────────────────────── */
function newSessionId() {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

function refreshIcons() {
    if (window.lucide) lucide.createIcons();
}

function fmtAge(ts) {
    if (!ts) return "—";
    const d = Date.now() - ts;
    if (d < 5_000)     return "just now";
    if (d < 60_000)    return `${Math.floor(d / 1000)}s ago`;
    if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
    return `${Math.floor(d / 3_600_000)}h ago`;
}

function esc(str) {
    return String(str ?? "")
        .replace(/&/g,  "&amp;")
        .replace(/</g,  "&lt;")
        .replace(/>/g,  "&gt;")
        .replace(/"/g,  "&quot;")
        .replace(/\n/g, "<br>");
}

// Safe attribute value escaping (no spaces/quotes)
function escAttr(str) {
    return String(str ?? "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* ─── SSH TERMINAL LOGIC ──────────────────────────────────────────────────── */

function initTerminal() {
    if (xterm) return;
    if (typeof Terminal === "undefined") return;

    const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";

    xterm = new Terminal({
        theme: {
            background: currentTheme === "dark" ? "#070306" : "#fef7f9",
            foreground: currentTheme === "dark" ? "#f2e6e9" : "#2e1820",
            cursor: "#dc143c",
            selectionBackground: "rgba(220, 20, 60, 0.3)"
        },
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 14,
        cursorBlink: true
    });

    xtermFit = new FitAddon.FitAddon();
    xterm.loadAddon(xtermFit);

    xterm.open(terminalContainer);
    xtermFit.fit();

    xterm.write("\x1b[31mCyberlife SSH Terminal\x1b[0m\r\nSelect a host and click connect.\r\n");

    xterm.onData(data => {
        if (!sshConnected) return;
        ws.send(JSON.stringify({
            type: "ssh-data",
            data: btoa(data) // Send base64 to avoid encoding issues with raw terminal bits
        }));
    });

    window.addEventListener("resize", () => {
        if (currentMode === "ssh" && xtermFit) {
            xtermFit.fit();
            if (sshConnected) {
                ws.send(JSON.stringify({
                    type: "ssh-resize",
                    payload: { cols: xterm.cols, rows: xterm.rows }
                }));
            }
        }
    });
}

function refreshSshDeviceSelect() {
    if (!sshDeviceSel) return;
    const prev = sshDeviceSel.value;
    sshDeviceSel.innerHTML = `<option value="">Custom IP</option>`;
    
    Object.values(allDevices).forEach(d => {
        if (d.ip && d.status === "online") {
            const opt = document.createElement("option");
            opt.value = d.ip;
            opt.textContent = `${d.name || d.uid} (${d.ip})`;
            sshDeviceSel.appendChild(opt);
        }
    });

    if (prev) sshDeviceSel.value = prev;
}

if (sshDeviceSel) {
    sshDeviceSel.addEventListener("change", () => {
        if (sshDeviceSel.value) sshHostInput.value = sshDeviceSel.value;
    });
}

function resetSshState() {
    sshConnected = false;
    if (sshConnectLbl) sshConnectLbl.textContent = "Connect";
}

if (btnSshConnect) {
    btnSshConnect.addEventListener("click", () => {
        if (sshConnected) {
            ws.send(JSON.stringify({ type: "disconnect" }));
            resetSshState();
            return;
        }

        const host = sshHostInput.value.trim();
        const username = sshUserInput.value.trim();
        const password = sshPassInput.value;

        if (!host || !username) {
            xterm.write("\r\n\x1b[31mError: Host and User required.\x1b[0m\r\n");
            return;
        }

        xterm.write(`\r\n\x1b[36mConnecting to ${username}@${host}...\x1b[0m\r\n`);
        sshConnectLbl.textContent = "Connecting...";

        ws.send(JSON.stringify({
            type: "ssh-connect",
            payload: { host, username, password, port: 22 }
        }));
    });
}

/* ─── BOOT ────────────────────────────────────────────────────────────────── */
initTheme();
updateSessionBadge();

// Lucide may load after this script; wait for it
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { refreshIcons(); init(); });
} else {
    // DOMContentLoaded already fired (script is deferred inline)
    setTimeout(() => { refreshIcons(); init(); }, 0);
}