# Cyberlife Ecosystem

**Cyberlife** is a modular, high-performance distributed networking framework designed to seamlessly connect, monitor, and manage autonomous machines, agents, and local hardware nodes. It bridges the gap between hardware infrastructure and software control via a sleek, zero-configuration Web Interface.

![System Design](docs/System%20Design%20-%20Cyberlife.png)

## Core Capabilities

Cyberlife nodes dynamically register their capabilities. The ecosystem natively supports:
- **Command Execution:** Run terminal commands securely across remote devices.
- **System Monitoring:** Live resource metrics (CPU, RAM, Disk, Temps) broadcasted via WebSockets.
- **SSH & VNC Engine:** Full interactive Web-Terminal and VNC integration for remote graphical desktop control over the browser.
- **Docker Manager:** View, manage, and restart containers across remote infrastructures.
- **AI Inference Engine:** Natively integrates with Ollama to run localized AI inference routing on edge hardware.
- **Cloudflare Tunnels:** Instantly expose any local port to the internet via automated Argo Tunnels and DNS record management.

## Project Structure

- **Hub:** The central nervous system (`server.js`). It hosts the main SQLite database, the real-time WebSocket broker, and the sleek Web Dashboard.
- **Agent:** The lightweight edge daemon (`agent.js`). It registers with the Hub and dynamically exposes the hardware's capabilities to the network.

---

## 🚀 Quick Start (Zero-Config Onboarding)

Cyberlife uses an intelligent Setup Wizard to handle all environment and configuration routing automatically. You do not need to manually edit `.env` files.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/krishnasinghprojects/Cyberlife.git
   cd Cyberlife
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Initialize the Node:**
   Simply start the server. Cyberlife will automatically detect that it is a fresh install and boot into Initialization Mode.
   ```bash
   npm start
   ```

4. **Follow the Wizard:**
   Open `http://localhost:8000` in your browser. The premium Setup UI will guide you through assigning the node's identity (Hub vs Agent) and configuring API keys (Ollama, Cloudflare). Once complete, it will natively reboot into the Cyberlife Ecosystem!

---

## 📖 API Documentation

Cyberlife provides full OpenAPI 3.0 documentation for developers looking to extend the ecosystem. 
Once the Hub is running, you can view the fully interactive API spec at:
**`http://localhost:8000/api-docs`**

## Architecture & Extensibility

Cyberlife is built entirely on pure Javascript and Node.js to ensure extreme portability across Mac, Linux, and lightweight edge devices like Raspberry Pis.

- **Frontend:** Pure HTML/CSS/JS (Zero framework bloat, instant load times, WebSocket native).
- **Backend:** Express & `ws` (Lightweight asynchronous networking).
- **Database:** SQLite (Embedded, high-speed configuration storage).
- **Routing:** Modules are hot-loaded and dynamically proxied based on the `ENABLED_MODULES` array.
