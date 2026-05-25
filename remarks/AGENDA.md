# Cyberlife Hub — Project Agenda & Roadmap

This document outlines the complete agenda, architecture goals, and version-by-version roadmap for the **Cyberlife Hub** project, based on the system design diagram and the current state of the codebase. 

## Project Overview
Cyberlife Hub is a multi-layer smart home, self-hosted infrastructure hub, and AI assistant interface. It is designed to act as the central nervous system connecting IoT edge devices (ESP32), personal computing nodes (MacBook Pro, Dell G15), infrastructure services (Docker, Cloudflare), and immersive interfaces (Unity 3D Room Model).

The hub runs on a Mac Mini (10.120.0.250) and provides a unified WebSocket/REST API and a responsive web dashboard for monitoring and control.

---

## Roadmap & Objectives

### v0.1: Foundation & Node Architecture
*Establish the core communication layer between the Central Hub and the computing nodes.*

- [x] Initialize Express & HTTP Server on the Hub (Mac Mini).
- [x] Implement real-time WebSocket broadcasting for dashboard clients.
- [x] Create Node Agent scripts for managed machines.
- [x] Implement Device Registration (`/register`) and Heartbeat (`/heartbeat`) mechanism.
- [x] Implement Heartbeat Watchdog to mark unresponsive devices offline.
- [x] Set up In-Memory Store for Devices and Metrics.
- [x] Create the Base Dashboard shell (HTML/CSS).

### v0.2: Command Execution & AI Layer (Current State)
*Enable remote command execution, live telemetry, agentic workflows, and AI inference capabilities.*

- [x] Build Command Execution Proxy (`POST /command/:deviceId`) on the Hub.
- [x] Implement `systeminformation` metrics collection on Node Agents (CPU, RAM, Disk).
- [x] Update Dashboard UI to a premium, responsive Crimson theme with Lucide Icons.
- [x] Add real-time SVG Gauge animations for live telemetry monitoring.
- [x] Integrate AI Inference Proxy (`POST /ai/:deviceId`) on the Hub.
- [x] Implement Ollama-based AI endpoint on the MacBook Pro node with session memory.
- [x] Build Chat Interface in the Dashboard with Mode Toggle (Monitor vs. Chat).
- [x] Enable Hub Self-Registration and Self-Metrics monitoring.
- [x] Implement Agentic Workflow to execute commands and autonomously check data (Query resolution layer converting user requests into executable actions via native tool-calling).

### v0.3: Persistence & State Management
*Replace in-memory stores with a robust database for persistent state and logging.*

- [x] Implement Persistent Database (SQLite) as the Single Source of Truth (SSOT).
- [ ] Migrate Device Registry from in-memory to the persistent database.
- [ ] Implement System Logs and Event History storage.
- [ ] Store Task Management states.
- [x] Persist Conversation/Chat History across hub restarts.
- [ ] Add Authentication and Connection Management (Central Hub IP + Password validation).

### v0.4: IoT Edge & Microcontroller Integration
*Bring microcontrollers and sensors into the Cyberlife ecosystem.*

- [ ] Set up MQTT Broker / Pub-Sub Subscription layer on the Hub.
- [ ] Integrate ESP32 for Motion Detection and Ultrasonic Sensors.
- [ ] Integrate ESP32 for Electronics Control (Relay management API).
- [ ] Implement Live Video Streaming proxy (ESP32 Cam to WebSocket stream).
- [ ] Add IoT telemetry and camera feeds to the Dashboard UI.

### v0.5: Infrastructure & Network Automation
*Expand the Hub's reach into server management and external networking.*

- [ ] Implement API Gateway for Query Categorization and Request Construction.
- [x] Build Container Management API (Docker orchestration & service monitoring).
- [x] Implement robust SSH method (not just simple command proxy) and VNC integrations for remote desktops.
- [ ] Integrate Cloudflare Tunnels for secure external access.
- [ ] Map external domain (`krishnasingh.live`) for Webpage Resolution.

### v0.6: The Unity 3D Interface
*Introduce the immersive spatial computing interface.*

- [ ] Develop API endpoints specifically for Unity Queries and State Sync.
- [ ] Build Unity Digital Room Interface.
- [ ] Map 3D Room Model components to Hub APIs.
- [ ] Enable Electronics, Laptop, and Monitoring Controls directly from the Unity interface.

### v0.7: Advanced Architecture & Scalability
*Evolve the system into a robust, fault-tolerant, and autonomous ecosystem.*

- [ ] Implement Highly Modular and Extensible architecture patterns.
- [ ] Build Fault-Tolerant orchestration and recovery mechanisms.
- [ ] Develop Intelligent Service Discovery and auto-registration for zero-config onboarding.
- [ ] Establish an Event-Driven System architecture for synchronized operations across devices.
- [ ] Implement advanced Observability, logging, and infrastructure analytics.

---

## Component Checklist (from System Design)

### Central Hub (Mac Mini)
- [x] Connection Management
- [x] Request Processor
- [x] SSOT Database (SQLite)
- [ ] Microcontroller Management
- [x] Live Streaming (WebSocket scaffolding ready, video proxy pending)

### Devices / Nodes
- [x] MacBook Pro (AI Inference Engine)
- [x] Dell G15 (Windows Operations)
- [x] Mac Mini (Self Hosted Machine / Hub)
- [ ] ESP32 (Sensors / Relays)
- [ ] ESP32 Cam (Live Camera)

### Functions / Services
- [x] Remote Command Execution
- [x] System Monitoring Metrics
- [x] AI Agent APIs (Ollama)
- [x] Container Management
- [x] SSH Management
- [ ] Cloudflare Tunnels

### Interfaces
- [x] Web Dashboard (React/Vanilla JS)
- [ ] Unity Digital Room Interface (3D)
