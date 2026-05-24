# Cyberlife Hub

**Cyberlife Hub** is an ambitious project that sits somewhere between a smart room OS, Homelab infrastructure manager, self-hosted cloud environment, and an AI-powered device orchestration platform. 

The core idea is to create a unified LAN ecosystem where IoT devices, remote desktops, infrastructure services, and AI inference systems connect into one centralized, intelligent control hub.

## 🌟 The Vision

One of the major goals is to make the system feel less like “controlling devices individually” and more like interacting with a **distributed intelligent environment**.

Instead of toggling switches or running separate scripts across different machines, the system abstracts devices through a query resolution layer, allowing for agentic, natural-language commands and high-level orchestration.

**Examples of what this system orchestrates:**
- *"Open CS2 on Gaming Machine"*
- *"Show Live Room Feed"*
- *"Sensor Monitoring"*
- *"Agentic AI Inference"*
- *"Deploy/restart Self-Hosted Services"*
- *"Remote Desktop Control"*
- *"Visualize and Control Devices in 3D room model"*

## 🏗️ Current Architecture

The ecosystem relies on a local-first infrastructure (with optional internet exposure) managed by a central hub.

- **Central Orchestration Hub**: Currently running on a Mac Mini (`10.120.0.250`), acting as the brain of the network.
- **Communication Layer**: REST + WebSocket APIs, alongside MQTT-based pub/sub for IoT devices, plus SSH and VNC integrations.
- **Device Abstraction**: Managed through unique IDs (`MacBookPro`, `DellG15`) and capability mapping (e.g., `ai-inference`, `execute-command`, `metrics`).
- **AI Integration**: Local AI inference powered by Ollama running on designated nodes (e.g., MacBook Pro), with agentic workflows to execute commands and autonomously check data.
- **Infrastructure Management**: Container orchestration, service monitoring, and Cloudflare tunnels for secure external exposure.
- **Digital Twin**: A Unity-based 3D digital room interface for real-time visualization and interaction with the physical space.

## 🔗 Supported Ecosystem Nodes

- **Personal Computing**: Remote Desktops (Windows, macOS) for command execution, VNC, and SSH management.
- **IoT & Sensors**: ESP32-Based IoT Devices handling Motion + Ultrasonic Sensors, and Live Camera Streams.
- **Self-Hosted Services**: Monitoring services, containerized workloads, and web applications.
- **Electronics**: Direct physical relays and environment controls.

## 🚀 Future Roadmap

If the base architecture executes successfully, the future plans include:

1. **Highly Modular & Extensible Design**: Refactoring the system so plugins and new device types can be added seamlessly.
2. **Fault-Tolerant Orchestration**: Building recovery mechanisms for when nodes drop offline or services crash.
3. **Zero-Config Onboarding**: Adding intelligent service discovery and auto-registration so devices integrate with minimal configuration.
4. **Event-Driven Synchronization**: Moving towards a fully event-driven system to synchronize operations across the LAN in real time.
5. **Advanced Observability**: Improving logging, infrastructure analytics, and system health monitoring.

---

*This project aims to merge smart automation, self-hosting, infrastructure management, AI orchestration, and real-time visualization into one unified platform. Feedback and contributions regarding distributed systems, IoT infrastructure, AI orchestration, and security architecture are highly appreciated!*
