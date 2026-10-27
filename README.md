# INEX CLIENT 🎮

> High-performance Black & Crimson Windows Minecraft Launcher with Profile Isolation & Modrinth Integration. Built with **Tauri v2**, **Rust**, and **Node.js**.

![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D6?style=flat-square&logo=windows)
![Backend](https://img.shields.io/badge/Backend-Rust%20%2B%20Node.js-DEA584?style=flat-square&logo=rust)
![Framework](https://img.shields.io/badge/Framework-Tauri%20v2-FFC131?style=flat-square&logo=tauri)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

---

## ✨ Features

- 🎮 **Complete Profile Isolation**:
  - Independent `.minecraft` game directories per profile so modpacks, saves, and configs never conflict.
  - Per-profile memory controls (RAM allocation) and custom JVM launch flags.
- ⚡ **Multi-Loader Support**:
  - Instant metadata resolution and installation for **Vanilla**, **Fabric**, **Quilt**, **Forge**, and **NeoForge**.
  - Intelligent processor pipeline runner for Forge/NeoForge modded clients.
- 📦 **Modrinth API v2 Content Browser**:
  - Search, download, and manage **Mods**, **Modpacks** (`.mrpack`), **Resource Packs**, **Shaders**, and **Data Packs** directly inside the launcher.
  - One-click mod toggle and dependency resolution.
- ☕ **Smart Java Runtime Management**:
  - Auto-detects installed Java environments (Java 8, 17, 21, 25) across your PC.
  - Resolves version compatibility automatically based on Mojang version manifests.
  - Portable JRE auto-bundler ensures the game always launches even without system Java installed.
- 👤 **Accounts & 3D Skin Studio**:
  - Supports official **Microsoft OAuth2** accounts and offline **Local** profiles.
  - 3D animated character preview with customizable skins and waving cape renderer.
- 🎧 **Discord Rich Presence & Live Logs**:
  - Live Discord RPC showing active profile, game status, and Minecraft version.
  - Integrated real-time game output console with instant error diagnostics.
- 🌑 **OLED Crimson Aesthetic**:
  - Deep black (`#050508`) palette with crimson accents, smooth animations, and frameless window controls.

---

## 🛠️ Architecture & Tech Stack

- **Shell**: Tauri v2 (Rust 2021) for ultra-fast startup, lightweight memory footprint, and native Windows NSIS installer creation.
- **Backend**: Node.js Sidecar process handling Mojang API downloads, hash verification, Java processes, and Modrinth v2 API calls.
- **Frontend**: Hardware-accelerated Vanilla HTML5, CSS3, and ES Modules.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- [Rust](https://rustup.rs/) (latest stable)
- Visual Studio C++ Build Tools

### Installation & Development

1. Clone the repository:
   ```bash
   git clone https://github.com/inrwxyz/inrwxyz-inex-client.git
   cd inrwxyz-inex-client
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm run dev
   ```

4. Build production installer:
   ```bash
   npm run build
   ```
   The compiled setup installer (`.exe`) and updater artifacts will be created in `src-tauri/target/release/bundle/nsis/`.

---

## 👨‍💻 Author

Developed by **[@inrwxyz](https://github.com/inrwxyz)** — INEX Studios.

---

## 📄 License

This project is licensed under the MIT License.
