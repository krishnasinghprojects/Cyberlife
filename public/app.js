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
let chatSessionId    = null;
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
const btnDocker    = document.getElementById("btn-docker");
const viewDocker   = document.getElementById("view-docker");
const btnDockerRef = document.getElementById("btn-docker-refresh");
const dockerGrid   = document.getElementById("docker-grid");

const btnVnc       = document.getElementById("btn-vnc");
const viewVnc      = document.getElementById("view-vnc");
const vncDeviceSel = document.getElementById("vnc-device-select");

const btnExpose    = document.getElementById("btn-expose");
const viewExpose   = document.getElementById("view-expose");
const exposeDeviceSel = document.getElementById("expose-device-select");
const exposePortInput = document.getElementById("expose-port");
const exposeSubdomainInput = document.getElementById("expose-subdomain");
const exposeDomainInput = document.getElementById("expose-domain");
const btnExposeStart = document.getElementById("btn-expose-start");
const exposeGrid = document.getElementById("expose-grid");
let selectedExposeDevice = "";
const vncHostInput = document.getElementById("vnc-host-input");
const vncPassInput = document.getElementById("vnc-pass");
const btnVncConnect= document.getElementById("btn-vnc-connect");
const btnVncFullscreen = document.getElementById("btn-vnc-fullscreen");
const vncConnectLbl= document.getElementById("vnc-connect-label");
const vncContainer = document.getElementById("vnc-container");

let vncRfb = null;
let vncConnected = false;

let dockerLoop     = null;

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
const dockerDeviceSel = document.getElementById("docker-device-select");
let selectedDockerDevice = "";

const sessionBadge = document.getElementById("session-badge");
const chatMessages = document.getElementById("chat-messages");
const chatInput    = document.getElementById("chat-input");
const chatSendBtn  = document.getElementById("chat-send");
const btnNewChat   = document.getElementById("btn-new-chat");
const btnClear     = document.getElementById("btn-clear-history");

let ws = null;
let wsReconnectTimer = null;

function connectWebSocket() {
    if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.close();
    }

    ws = new WebSocket(`ws://${window.location.host}`);

    ws.onopen = () => {
        connDot.className    = "conn-dot online";
        connLabel.textContent = "Hub Connected";
        if (wsReconnectTimer) {
            clearTimeout(wsReconnectTimer);
            wsReconnectTimer = null;
        }
    };

    ws.onclose = () => {
        connDot.className    = "conn-dot offline";
        connLabel.textContent = "Hub Disconnected";
        if (!wsReconnectTimer) {
            wsReconnectTimer = setTimeout(connectWebSocket, 3000);
        }
    };

    ws.onerror = () => {
        connDot.className    = "conn-dot offline";
        connLabel.textContent = "Connection Error";
        // Let onclose handle the reconnect
    };

    ws.onmessage = ({ data }) => {
        const msg = JSON.parse(data);

        if (msg.type === "device-update") {
            allDevices = msg.devices;
            syncCards();
            updateHeaderStats();
            refreshAiDeviceSelect();
            if (typeof refreshDockerDeviceSelect === 'function') refreshDockerDeviceSelect();
            if (typeof refreshExposeDeviceSelect === 'function') refreshExposeDeviceSelect();

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
}

connectWebSocket();

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
function setMode(view) {
    currentMode = view;

    btnMonitor.classList.remove("active");
    btnChat.classList.remove("active");
    if (btnSsh) btnSsh.classList.remove("active");
    if (btnDocker) btnDocker.classList.remove("active");
    if (btnVnc) btnVnc.classList.remove("active");
    if (btnExpose) btnExpose.classList.remove("active");

    if (viewMonitor) viewMonitor.classList.add("hidden");
    if (viewChat) viewChat.classList.add("hidden");
    if (viewSsh) viewSsh.classList.add("hidden");
    if (viewDocker) viewDocker.classList.add("hidden");
    if (viewVnc) viewVnc.classList.add("hidden");
    if (viewExpose) viewExpose.classList.add("hidden");

    const isMonitor = (view === "monitoring");
    const isChat    = (view === "chat");
    const isSsh     = (view === "ssh");
    const isDocker  = (view === "docker");
    const isVnc     = (view === "vnc");
    const isExpose  = (view === "expose");

    if (isMonitor) btnMonitor.classList.add("active");
    if (isChat)    btnChat.classList.add("active");
    if (isSsh && btnSsh) btnSsh.classList.add("active");
    if (isDocker && btnDocker) btnDocker.classList.add("active");
    if (isVnc && btnVnc) btnVnc.classList.add("active");
    if (isExpose && btnExpose) btnExpose.classList.add("active");

    if (viewMonitor) viewMonitor.classList.toggle("hidden", !isMonitor);
    if (viewChat) viewChat.classList.toggle("hidden", !isChat);
    if (viewSsh) viewSsh.classList.toggle("hidden", !isSsh);
    if (viewDocker) viewDocker.classList.toggle("hidden", !isDocker);
    if (viewVnc) viewVnc.classList.toggle("hidden", !isVnc);
    if (viewExpose) viewExpose.classList.toggle("hidden", !isExpose);

    if (dockerLoop) { clearInterval(dockerLoop); dockerLoop = null; }
    if (window.exposeLoop) { clearInterval(window.exposeLoop); window.exposeLoop = null; }

    if (isChat) refreshAiDeviceSelect();
    if (isSsh) {
        refreshSshDeviceSelect();
        initTerminal();
        setTimeout(() => { if (xtermFit) xtermFit.fit(); }, 50);
    }
    if (isDocker) {
        if (typeof refreshDockerDeviceSelect === 'function') refreshDockerDeviceSelect();
        fetchContainers();
        dockerLoop = setInterval(fetchContainers, 3000);
    }
    if (isVnc) {
        refreshVncDeviceSelect();
    }
    if (isExpose) {
        if (typeof refreshExposeDeviceSelect === 'function') refreshExposeDeviceSelect();
        fetchTunnels();
        window.exposeLoop = setInterval(fetchTunnels, 5000);
    }

    if (!isMonitor) refreshIcons();
}

btnMonitor.addEventListener("click", () => setMode("monitoring"));
btnChat.addEventListener("click",    () => setMode("chat"));
if (btnSsh) btnSsh.addEventListener("click", () => setMode("ssh"));
if (btnDocker) btnDocker.addEventListener("click", () => setMode("docker"));
if (btnVnc) btnVnc.addEventListener("click", () => setMode("vnc"));
if (btnExpose) btnExpose.addEventListener("click", () => setMode("expose"));
if (btnDockerRef) btnDockerRef.addEventListener("click", fetchContainers);

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
        if (typeof refreshDockerDeviceSelect === 'function') refreshDockerDeviceSelect();
        if (typeof refreshExposeDeviceSelect === 'function') refreshExposeDeviceSelect();
        if (typeof refreshExposeDeviceSelect === 'function') refreshExposeDeviceSelect();

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
let chatHistory = [];
const sidebarSessions = document.getElementById("sidebar-sessions");
const chatSidebar = document.getElementById("chat-sidebar");
const btnToggleSidebar = document.getElementById("btn-toggle-sidebar");
const chatSidebarOverlay = document.getElementById("chat-sidebar-overlay");

function toggleSidebar() {
    chatSidebar.classList.toggle("collapsed");
    if (chatSidebarOverlay) {
        chatSidebarOverlay.classList.toggle("active", !chatSidebar.classList.contains("collapsed"));
    }
}

function closeSidebarOnMobile() {
    if (window.innerWidth <= 599 && !chatSidebar.classList.contains("collapsed")) {
        chatSidebar.classList.add("collapsed");
        if (chatSidebarOverlay) chatSidebarOverlay.classList.remove("active");
    }
}

if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener("click", toggleSidebar);
}
if (chatSidebarOverlay) {
    chatSidebarOverlay.addEventListener("click", toggleSidebar);
}

async function loadChatSessions() {
    try {
        const res = await fetch("/api/chats");
        const sessions = await res.json();
        
        if (sidebarSessions) sidebarSessions.innerHTML = "";
        
        if (sessions.length === 0) {
            createNewSession("New Session");
            return;
        }

        sessions.forEach(s => {
            const div = document.createElement("div");
            div.className = "session-item" + (s.id === chatSessionId ? " active" : "");
            div.textContent = s.title || "Chat Session";
            div.onclick = () => loadSession(s.id);
            if (sidebarSessions) sidebarSessions.appendChild(div);
        });

        // Auto-load latest session on boot if none selected
        if (!chatSessionId && sessions.length > 0) {
            loadSession(sessions[0].id);
        }
    } catch (e) {
        console.error("Failed to load sessions", e);
    }
}

async function createNewSession(title = "New Chat") {
    try {
        const res = await fetch("/api/chats", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title })
        });
        const data = await res.json();
        chatSessionId = data.id;
        chatHistory = [];
        clearChatUI();
        loadChatSessions();
    } catch (e) {
        console.error("Failed to create session", e);
    }
}

async function loadSession(id) {
    chatSessionId = id;
    chatHistory = [];
    clearChatUI();
    closeSidebarOnMobile();
    
    try {
        const res = await fetch(`/api/chats/${id}/messages`);
        const messages = await res.json();
        
        const welcome = document.getElementById("chat-welcome");
        if (welcome && messages.length > 0) welcome.remove();

        messages.forEach(m => {
            chatHistory.push({ role: m.role, content: m.content });
            const uiRole = m.role === "assistant" ? "ai" : m.role;
            let toolTrace = null;
            if (m.tool_calls) {
                try { toolTrace = JSON.parse(m.tool_calls); } catch (e) {}
            }
            appendMessage(uiRole, m.content, null, false, toolTrace);
        });
        
        loadChatSessions(); // Update active state
    } catch (e) {
        console.error("Failed to load messages", e);
    }
}

async function saveMessage(role, content) {
    chatHistory.push({ role, content });
    if (!chatSessionId) return;
    try {
        await fetch(`/api/chats/${chatSessionId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role, content })
        });
        loadChatSessions(); // Bump session to top
    } catch (e) {
        console.error("Failed to save message", e);
    }
}

btnNewChat.addEventListener("click", () => {
    createNewSession("New Session");
});

btnClear.addEventListener("click", async () => {
    if (!chatSessionId) return;
    try {
        await fetch(`/api/chats/${chatSessionId}`, { method: "DELETE" });
        chatSessionId = null;
        chatHistory = [];
        clearChatUI();
        loadChatSessions();
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

    if (!chatSessionId) {
        await createNewSession("New Session");
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
        const res = await fetch(`/api/chats/${chatSessionId}/agent`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ prompt, model: selectedModel, deviceId: selectedAiDevice })
        });

        const data = await res.json();
        removeThinking(thinkingId);
        loadChatSessions(); // Update sidebar (e.g. for auto-generated title)

        if (data.error) {
            appendMessage("ai", `Error: ${data.error}`, null, true);
        } else {
            const reply = data.response || "No response";
            appendMessage("ai", reply, data.responseTime, false, data.toolTrace);
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
function appendMessage(role, text, meta = null, isError = false, toolTrace = null) {
    const wrapper = document.createElement("div");
    wrapper.className = `msg msg-${role}`;

    const roleLabel = role === "user" ? "You" : "Cyberlife AI";
    const bubbleCls = isError ? "msg-bubble msg-error" : "msg-bubble";

    const contentHtml = (role === "ai" && window.marked) ? marked.parse(text) : esc(text);

    let toolsHtml = "";
    if (toolTrace && toolTrace.length > 0) {
        toolsHtml = `<div class="msg-tools">`;
        toolTrace.forEach(t => {
            const duration = t.duration || "";
            const formattedTool = (t.tool || "")
                .split('_')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');
                
            toolsHtml += `
                <div class="tool-badge" title="Called tool: ${escAttr(t.tool)}">
                    <i data-lucide="wrench"></i>
                    <span>${esc(formattedTool)}</span>
                    ${duration ? `<span class="tool-duration">${esc(duration)}</span>` : ""}
                </div>`;
        });
        toolsHtml += `</div>`;
    }

    const metaHtml = meta ? `<div class="msg-meta">${esc(meta)}</div>` : "";

    wrapper.innerHTML = `
        <div class="msg-role">${roleLabel}</div>
        ${toolsHtml}
        <div class="${bubbleCls} markdown-body">${contentHtml}</div>
        ${metaHtml}`;

    chatMessages.appendChild(wrapper);
    refreshIcons();
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

/* ─── DOCKER MANAGEMENT ───────────────────────────────────────────────────── */
function refreshDockerDeviceSelect() {
    if (!dockerDeviceSel) return;
    const prev = dockerDeviceSel.value;
    dockerDeviceSel.innerHTML = '<option value="">Select Node</option>';
    
    Object.values(allDevices).forEach(d => {
        if (d.status === "online" && d.capabilities?.includes("docker")) {
            const opt = document.createElement("option");
            opt.value = d.uid;
            opt.textContent = d.name || d.uid;
            dockerDeviceSel.appendChild(opt);
        }
    });

    if (prev && allDevices[prev] && allDevices[prev].status === "online") {
        dockerDeviceSel.value = prev;
    }
    selectedDockerDevice = dockerDeviceSel.value;
}

if (dockerDeviceSel) {
    dockerDeviceSel.addEventListener("change", () => {
        selectedDockerDevice = dockerDeviceSel.value;
        fetchContainers();
    });
}

async function fetchContainers() {
    if (currentMode !== "docker") return;
    if (!selectedDockerDevice) {
        if (dockerGrid) {
            dockerGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-dim);">Please select a Docker node.</div>`;
        }
        return;
    }
    try {
        const res = await fetch(`/docker/${encodeURIComponent(selectedDockerDevice)}/containers`);
        if (!res.ok) throw new Error("Fetch failed");
        const containers = await res.json();
        renderContainers(containers);
    } catch (err) {
        console.error("[DOCKER]", err);
        if (dockerGrid) {
            dockerGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; display:flex; flex-direction:column; align-items:center; color: var(--offline); opacity: 0.8; padding: 40px;">
                    <i data-lucide="alert-triangle" style="width:48px;height:48px;margin-bottom:16px;"></i>
                    <h3 style="margin: 0 0 8px 0; color: var(--text);">Docker Engine Unreachable</h3>
                    <p style="margin: 0; font-size: 0.9rem;">Please ensure Docker Desktop is running on the Hub machine.</p>
                </div>
            `;
            refreshIcons();
        }
    }
}

function renderContainers(containers) {
    if (!dockerGrid) return;
    if (containers.length === 0) {
        dockerGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-dim);">No containers found. Spin one up!</div>`;
        return;
    }

    const html = containers.map(c => {
        const isRun = c.state === "running";
        const statusClass = c.state.toLowerCase() === "running" ? "running" : 
                            c.state.toLowerCase() === "exited" ? "exited" : "created";
                            
        return `
        <div class="container-card">
            <div class="container-head">
                <div class="container-identity">
                    <div class="container-name">${esc(c.name)}</div>
                    <div class="container-image" title="${esc(c.image)}">${esc(c.image.substring(0, 30))}</div>
                </div>
                <div class="container-status ${statusClass}">${esc(c.state)}</div>
            </div>
            
            <div class="container-gauges">
                ${makeGauge("cpu", "CPU", "#dc143c")}
                ${makeGauge("ram", "RAM", "#f59e0b")}
            </div>

            <div class="container-actions">
                ${!isRun ? `<button class="toolbar-btn" onclick="dockerAction('${c.id}', 'start')">
                    <i data-lucide="play"></i> <span class="btn-label">Start</span>
                </button>` : ''}
                ${isRun ? `<button class="toolbar-btn" onclick="dockerAction('${c.id}', 'stop')">
                    <i data-lucide="square"></i> <span class="btn-label">Stop</span>
                </button>` : ''}
                <button class="toolbar-btn" onclick="dockerAction('${c.id}', 'restart')">
                    <i data-lucide="rotate-cw"></i> <span class="btn-label">Restart</span>
                </button>
            </div>
        </div>`;
    }).join("");

    dockerGrid.innerHTML = html;
    refreshIcons();
    
    const cards = Array.from(dockerGrid.querySelectorAll('.container-card'));
    containers.forEach((c, i) => {
        const card = cards[i];
        if (card) {
            setGauge(card, "cpu", c.state === "running" ? c.cpu : null);
            setGauge(card, "ram", c.state === "running" ? c.ram : null);
        }
    });
}

window.dockerAction = async function(id, action) {
    try {
        if (!selectedDockerDevice) return;
        await fetch(`/docker/${encodeURIComponent(selectedDockerDevice)}/containers/${id}/${action}`, { method: 'POST' });
        fetchContainers(); // fast refresh
    } catch (err) {
        console.error("[DOCKER Action]", err);
    }
};

/* ─── VNC ─────────────────────────────────────────────────────────────────── */
function refreshVncDeviceSelect() {
    if (!vncDeviceSel) return;
    const currentVal = vncDeviceSel.value;
    vncDeviceSel.innerHTML = '<option value="">Select Host</option>';
    
    Object.values(allDevices).forEach(d => {
        if (d.status === "online") {
            const opt = document.createElement("option");
            opt.value = d.uid;
            opt.textContent = `${d.name} (${d.ip})`;
            vncDeviceSel.appendChild(opt);
        }
    });
    
    if (allDevices[currentVal] && allDevices[currentVal].status === "online") {
        vncDeviceSel.value = currentVal;
    } else {
    }
}

/* ─── EXPOSE (CLOUDFLARE TUNNELS) ────────────────────────────────────────── */
function refreshExposeDeviceSelect() {
    if (!exposeDeviceSel) return;
    const prev = exposeDeviceSel.value;
    exposeDeviceSel.innerHTML = '<option value="">Select Node</option>';
    
    Object.values(allDevices).forEach(d => {
        if (d.status === "online" && d.capabilities?.includes("expose-port")) {
            const opt = document.createElement("option");
            opt.value = d.uid;
            opt.textContent = d.name || d.uid;
            exposeDeviceSel.appendChild(opt);
        }
    });

    if (prev && allDevices[prev] && allDevices[prev].status === "online") {
        exposeDeviceSel.value = prev;
    }
    selectedExposeDevice = exposeDeviceSel.value;
}

if (vncDeviceSel) {
    vncDeviceSel.addEventListener("change", (e) => {
        const uid = e.target.value;
        if (uid && allDevices[uid]) {
            vncHostInput.value = allDevices[uid].ip;
        } else {
            vncHostInput.value = "";
        }
    });
}

function disconnectVnc() {
    if (vncRfb) {
        vncRfb.disconnect();
        vncRfb = null;
    }
    vncConnected = false;
    vncContainer.innerHTML = `
        <div class="vnc-empty-state">
            <i data-lucide="monitor-off"></i>
            <p>Disconnected from VNC host.</p>
        </div>
    `;
    vncConnectLbl.textContent = "Connect";
    btnVncConnect.classList.remove("danger");
    if (btnVncFullscreen) btnVncFullscreen.style.display = "none";
    refreshIcons();
}

/* ─── EXPOSE TUNNELS ──────────────────────────────────────────────────────── */
function refreshExposeDeviceSelect() {
    if (!exposeDeviceSel) return;
    const prev = exposeDeviceSel.value;
    exposeDeviceSel.innerHTML = '<option value="">Select Node</option>';
    
    Object.values(allDevices).forEach(d => {
        if (d.status === "online" && d.capabilities?.includes("expose-port")) {
            const opt = document.createElement("option");
            opt.value = d.uid;
            opt.textContent = d.name || d.uid;
            exposeDeviceSel.appendChild(opt);
        }
    });

    if (prev && allDevices[prev] && allDevices[prev].status === "online") {
        exposeDeviceSel.value = prev;
    }
    selectedExposeDevice = exposeDeviceSel.value;
}

if (exposeDeviceSel) {
    exposeDeviceSel.addEventListener("change", () => {
        selectedExposeDevice = exposeDeviceSel.value;
        fetchTunnels();
    });
}

async function fetchTunnels() {
    if (currentMode !== "expose") return;
    if (!selectedExposeDevice) {
        if (exposeGrid) exposeGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-dim);">Please select a node to manage tunnels.</div>`;
        return;
    }
    try {
        const res = await fetch(`/api/tunnels/${encodeURIComponent(selectedExposeDevice)}`);
        const tunnels = await res.json();
        renderTunnels(tunnels);
    } catch (err) {
        console.error("[TUNNELS] Fetch failed:", err);
    }
}

function renderTunnels(tunnels) {
    if (!exposeGrid) return;
    if (tunnels.length === 0) {
        exposeGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-dim);">No active tunnels on this node.</div>`;
        return;
    }
    exposeGrid.innerHTML = tunnels.map(t => `
        <div class="container-card">
            <div class="container-head">
                <div class="container-identity">
                    <div class="container-name">Port ${t.port}</div>
                    <div class="container-image" style="color: var(--accent);"><a href="${t.url}" target="_blank">${t.url}</a></div>
                </div>
                <div class="container-status running">Live</div>
            </div>
            <div class="container-actions" style="margin-top: 15px;">
                <button class="toolbar-btn toolbar-btn-danger" onclick="stopTunnel('${t.id}')">
                    <i data-lucide="square"></i> <span class="btn-label">Stop Tunnel</span>
                </button>
            </div>
        </div>
    `).join("");
    refreshIcons();
}

if (btnExposeStart) {
    btnExposeStart.addEventListener("click", async () => {
        if (!selectedExposeDevice) return alert("Select a node first");
        const port = exposePortInput.value;
        const subdomain = exposeSubdomainInput.value;
        const domain = exposeDomainInput.value;
        if (!port || !subdomain || !domain) return alert("Please fill all fields");
        
        btnExposeStart.disabled = true;
        btnExposeStart.innerHTML = `<i data-lucide="loader"></i> <span class="btn-label">Starting...</span>`;
        
        try {
            const res = await fetch(`/api/tunnels/start`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ deviceId: selectedExposeDevice, port, subdomain, domain })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            fetchTunnels();
        } catch (err) {
            alert(`Failed to start tunnel: ${err.message}`);
        } finally {
            btnExposeStart.disabled = false;
            btnExposeStart.innerHTML = `<i data-lucide="globe"></i> <span class="btn-label">Expose</span>`;
            refreshIcons();
        }
    });
}

function showConfirmModal(message, onConfirm) {
    const overlay = document.getElementById("confirm-modal-overlay");
    const msgEl = document.getElementById("confirm-modal-msg");
    const btnOk = document.getElementById("confirm-btn-ok");
    const btnCancel = document.getElementById("confirm-btn-cancel");
    
    msgEl.textContent = message;
    overlay.classList.remove("hidden");
    
    const cleanup = () => {
        overlay.classList.add("hidden");
        btnOk.removeEventListener("click", onOkClick);
        btnCancel.removeEventListener("click", onCancelClick);
    };
    
    const onOkClick = () => {
        cleanup();
        onConfirm();
    };
    
    const onCancelClick = () => {
        cleanup();
    };
    
    btnOk.addEventListener("click", onOkClick);
    btnCancel.addEventListener("click", onCancelClick);
}

window.stopTunnel = function(id) {
    if (!selectedExposeDevice) return;
    showConfirmModal("Are you sure you want to stop and delete this tunnel? This will disconnect any active users immediately.", async () => {
        try {
            await fetch(`/api/tunnels/stop/${encodeURIComponent(id)}`, { method: 'POST' });
            fetchTunnels();
        } catch (err) {
            console.error("Failed to stop tunnel:", err);
        }
    });
};

const btnExposeRefresh = document.getElementById("btn-expose-refresh");
if (btnExposeRefresh) btnExposeRefresh.addEventListener("click", fetchTunnels);

if (exposeDeviceSel) {
    exposeDeviceSel.addEventListener("change", () => {
        selectedExposeDevice = exposeDeviceSel.value;
        fetchTunnels();
    });
}

async function fetchTunnels() {
    if (currentMode !== "expose") return;
    const grid = document.getElementById("expose-grid");
    if (!grid) return;

    if (!selectedExposeDevice) {
        grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-dim);">Please select a node to view its tunnels.</div>`;
        return;
    }

    try {
        const res = await fetch(`/api/tunnels/${encodeURIComponent(selectedExposeDevice)}`);
        if (!res.ok) throw new Error("Fetch failed");
        
        const tunnels = await res.json();
        
        if (tunnels.length === 0) {
            grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-dim);">No active tunnels on this node.</div>`;
            return;
        }

        grid.innerHTML = tunnels.map(t => `
            <div class="container-card">
                <div class="container-head">
                    <div class="container-identity">
                        <div class="container-name">
                            <i data-lucide="globe" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px; color: var(--accent);"></i>
                            ${esc(t.subdomain)}.${esc(t.domain)}
                        </div>
                        <div class="container-image">Port ${esc(t.port)}</div>
                    </div>
                    <div class="container-status running">ACTIVE</div>
                </div>
                
                <div style="padding: 16px; background: var(--surface-2); display: flex; align-items: center; justify-content: center; border-bottom: 1px solid var(--border);">
                    <a href="${esc(t.url)}" target="_blank" style="color: var(--text); font-weight: 500; font-family: var(--font-mono); text-decoration: none; word-break: break-all; font-size: 0.85rem; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-3); display: flex; align-items: center; gap: 8px; width: 100%; justify-content: center; transition: border-color 0.2s;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
                        ${esc(t.url)} <i data-lucide="external-link" style="width: 14px; height: 14px; color: var(--accent);"></i>
                    </a>
                </div>

                <div class="container-actions">
                    <button class="toolbar-btn toolbar-btn-danger" onclick="stopTunnel('${t.id}')">
                        <i data-lucide="power"></i> <span class="btn-label">Stop & Delete Tunnel</span>
                    </button>
                </div>
            </div>
        `).join("");
        
        refreshIcons();
    } catch (err) {
        grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--error);">Error loading tunnels: ${err.message}</div>`;
    }
}

if (btnVncFullscreen) {
    btnVncFullscreen.addEventListener("click", () => {
        if (!document.fullscreenElement) {
            if (vncContainer.requestFullscreen) {
                vncContainer.requestFullscreen();
            } else if (vncContainer.webkitRequestFullscreen) {
                vncContainer.webkitRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    });
}

if (btnVncConnect) {
    btnVncConnect.addEventListener("click", () => {
        if (vncConnected) {
            disconnectVnc();
            return;
        }

        const ip = vncHostInput.value;
        const pass = vncPassInput.value;

        if (!ip) return;

        vncContainer.innerHTML = ""; // Clear empty state
        
        const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
        const wsUrl = `${wsProtocol}://${window.location.host}/vnc-proxy?target=${ip}&port=5900`;

        try {
            vncRfb = new window.RFB(vncContainer, wsUrl, {
                credentials: { password: pass }
            });

            vncRfb.addEventListener("connect", () => {
                vncConnected = true;
                vncConnectLbl.textContent = "Disconnect";
                btnVncConnect.classList.add("danger");
                if (btnVncFullscreen) btnVncFullscreen.style.display = "inline-flex";
            });

            vncRfb.addEventListener("credentialsrequired", () => {
                disconnectVnc();
                vncContainer.innerHTML = `
                    <div class="vnc-empty-state">
                        <i data-lucide="shield-alert" style="color: var(--danger)"></i>
                        <p style="color: var(--danger)">Authentication Failed. Incorrect or missing VNC password.</p>
                    </div>
                `;
                refreshIcons();
            });

            vncRfb.addEventListener("disconnect", (e) => {
                disconnectVnc();
                if (e.detail && !e.detail.clean) {
                    vncContainer.innerHTML = `
                        <div class="vnc-empty-state">
                            <i data-lucide="wifi-off" style="color: var(--warning)"></i>
                            <p style="color: var(--warning)">Connection closed unexpectedly. Verify host VNC is running.</p>
                        </div>
                    `;
                    refreshIcons();
                }
            });

            // Scale to fit the container
            vncRfb.scaleViewport = true;
            vncRfb.resizeSession = true;

        } catch (e) {
            console.error("VNC Error:", e);
            vncContainer.innerHTML = `
                <div class="vnc-empty-state">
                    <p style="color: var(--danger)">Connection failed.</p>
                </div>
            `;
        }
    });
}

// Ensure resize updates noVNC
window.addEventListener("resize", () => {
    if (vncRfb) {
        // noVNC handles viewport scaling automatically when scaleViewport is true
    }
});

/* ─── BOOT ────────────────────────────────────────────────────────────────── */
initTheme();
loadChatSessions(); // Load past chats on boot

// Lucide may load after this script; wait for it
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { refreshIcons(); init(); });
} else {
    // DOMContentLoaded already fired (script is deferred inline)
    setTimeout(() => { refreshIcons(); init(); }, 0);
}