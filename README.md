# INEX CLIENT 🎮

> A Black & Crimson Windows Minecraft launcher with isolated profiles, a built-in Modrinth browser, a one-click **server hosting panel** and **server-less P2P remote access**. Built with **Tauri v2**, **Rust** and **Node.js**.

![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D6?style=flat-square&logo=windows)
![Framework](https://img.shields.io/badge/Framework-Tauri%20v2-FFC131?style=flat-square&logo=tauri)
![Backend](https://img.shields.io/badge/Backend-Rust%20%2B%20Node.js-DEA584?style=flat-square&logo=rust)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

---

## ✨ Features

### 🎮 Launcher
- **Profile isolation**: every profile has its own game directory, so modpacks, saves and configs never mix. Per-profile RAM and custom JVM flags.
- **Mod loaders**: **Fabric** (default), **Forge** and **Vanilla** (the Forge client processors run automatically).
- **Smart Java management**: detects installed Java (8, 17, 21, 25), picks the right one from the Mojang version manifest and can fetch a portable runtime when none is installed.
- **Fast downloads**: configurable parallel downloads, optional snapshots in the version list.
- **Live game console** with real-time Minecraft output.
- **Performance helpers**: optional Fabric performance pack per profile, plus low-end defaults that are applied once on PCs that only have integrated graphics (they never override your own settings).
- **HUD mod support**: attach your own HUD `.jar` to a profile; it is only used if it supports that loader and Minecraft version.
- **Discord Rich Presence** with your active profile and game status.
- **Accounts**: Microsoft sign-in and offline (local) accounts, plus a **Skin Studio** with skin slots and skin sync.

### 📦 Modrinth content browser
Search and install **Mods**, **Modpacks** (`.mrpack`), **Resource Packs**, **Shaders** and **Data Packs** without leaving the launcher.

### 🖥️ Server hosting
Create and run Minecraft servers from the **Server** tab:
- **Vanilla, Paper, Purpur and Fabric** servers.
- Tabs for **Console**, **Players**, **Plugins & Mods**, **Files & Editor**, **Network** and **Properties**.
- Live console, start / stop / restart, player actions (OP, kick, ...), `server.properties` editor and a file editor.
- Enable / disable / remove installed plugins and mods.
- **Bedrock support** through Geyser, so Bedrock players can join a Java server.
- **Online-mode check**: optional instant kick for non-premium accounts.
- **Public address without port forwarding**: built-in tunnels (bore.pub for Java, SSH tunnels via pinggy / serveo, and Playit.gg) so friends can join over the internet.

### 🔑 Server access by code (no server, no account)
Give a friend control of **one** of your servers, directly from their launcher:

1. **Host:** `Give access` → pick a server → `Generate code`, then send the code to your friend.
2. **Friend:** `Friend servers` → paste the code → send the **reply code** back to the host.
3. **Host:** paste the reply code → `Connect`. The remote editor opens on the friend's side.

How it works:
- The WebRTC handshake is exchanged as two copy-paste codes, so **no signalling server or database is used**. After that, everything (console, files, commands) goes **peer-to-peer**.
- A code works **once** and expires after **15 minutes**. Only one person can be connected at a time.
- The friend can only reach the **one server you chose**, and only a fixed list of actions (console, players, properties, files, installed plugins / mods). Deleting servers, creating servers and tunnel control are blocked on the host side.
- The codes contain your public IP and the connection fingerprint. Only share them with people you trust, and press **Disconnect** to end a session at any time.
- Direct P2P can fail on some networks (for example mobile data with CGNAT, or strict firewalls). Same-network connections may also fail on routers without hairpin NAT.

### 🔄 Updates
Signed auto-updates through GitHub Releases: the launcher checks `latest.json`, downloads in the background and installs with a restart.

### ⚙️ Settings
Default Java and RAM, concurrent downloads, window size and fullscreen, close behaviour (keep open / minimize / close), snapshot toggle, glass (blur) intensity, Discord toggle and custom data / install directories.

---

## 🛠️ Tech stack

| Layer | Technology |
|-------|------------|
| Shell | Tauri v2 (Rust 2021), NSIS installer |
| Backend | Node.js sidecar (Mojang / Modrinth downloads, Java processes, server manager, tunnels) |
| Frontend | Vanilla HTML, CSS and JavaScript |
| P2P | WebRTC DataChannel with a compact copy-paste handshake (`src/p2p-codec.js`, `src/p2p-link.js`) |
| Extras | Java agent for skins (`agent-src/`) |

---

## 📁 Project structure

```
src/                 UI (HTML, CSS, JS) and the backend modules in src/main/
src/main/            Node backend: profiles, installer, loaders, Modrinth, Java, servers, tunnels, code access
src-tauri/           Rust shell, Tauri config, icons, installer hooks
sidecar/             Node sidecar entry point + Electron API shim
scripts/             Build helpers (prepare, bridge, UI build, Node fetch)
agent-src/           Source of the Java skin agent
test/                Backend tests
.github/workflows/   Release pipeline
```

---

## 🚀 Getting started

### Requirements
- [Node.js](https://nodejs.org/) 18 or newer (22 recommended)
- [Rust](https://rustup.rs/) (stable)
- Visual Studio C++ Build Tools (Windows)

### Run in development
```bash
git clone https://github.com/inrwxyz/inrwxyz-inex-client.git
cd inrwxyz-inex-client
npm install
npm run dev
```
`npm run dev` prepares the UI and the backend, downloads the bundled Node runtime once and starts Tauri.

### Build the installer
```bash
npm run build
```
The setup `.exe` and the updater files are created in `src-tauri/target/release/bundle/nsis/`.

### Tests
```bash
npm test
```

---

## 📦 Releasing a new version

1. Change `"version"` in `package.json` (it must be **higher** than the version users already have).
2. Commit and push to `main`.
3. Create and push a tag:
   ```bash
   git tag v1.1.1
   git push origin v1.1.1
   ```
4. GitHub Actions builds the installer and publishes a Release with the setup `.exe`, its `.sig` and `latest.json`.

The workflow needs these repository secrets: `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Never commit them.

---

## 👨‍💻 Author

Developed by **[@inrwxyz](https://github.com/inrwxyz)** — INEX Studios.

## 📄 License

Released under the MIT License.
