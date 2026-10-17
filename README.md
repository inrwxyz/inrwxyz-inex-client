# INEX CLIENT — Windows Minecraft Launcher

**INEX CLIENT** is a standalone black-and-crimson Windows desktop Minecraft launcher built with **Electron**, **Node.js**, **HTML5**, **CSS3**, and **JavaScript**. It features complete profile isolation, an official Mojang version & asset installation engine, automatic Java runtime detection, multi-loader support (**Vanilla, Fabric, Quilt, Forge**), account & skin management, and an integrated **Modrinth API v2** content browser for Mods, Modpacks (`.mrpack`), Resource Packs, Shaders, and Data Packs.

## Project Structure

```text
inex-client/
├── package.json                 # Electron & electron-builder Windows configuration
├── main.js                      # Secure Electron main process & IPC handlers
├── preload.js                   # Context-isolated preload bridge (window.inexAPI)
├── src/
│   ├── index.html               # Launcher desktop interface (all 8 sections & modals)
│   ├── style.css                # Black & crimson glassmorphic theme
│   ├── renderer.js              # Frontend state & IPC controller
│   ├── inex-logo.png            # High-resolution transparent INEX dripping-I emblem
│   └── main/
│       ├── settingsManager.js   # Persistent validated launcher & directory settings
│       ├── profileManager.js    # Profile CRUD, isolated gameDirs & install verification
│       ├── versionManager.js    # Official Mojang version_manifest_v2 fetcher & cache
│       ├── javaManager.js       # Windows/system Java detector & compatibility checker
│       ├── loaderManager.js     # Vanilla, Fabric, Quilt & Forge metadata resolver
│       ├── installer.js         # 12-step Minecraft JAR/library/asset downloader + SHA1 verify
│       ├── launcher.js          # Real child_process Java launcher & live log streamer
│       ├── modrinthManager.js   # Official Modrinth API v2 search & .mrpack/mod installer
│       ├── accountManager.js    # Microsoft OAuth2 + Local UUIDv3 accounts & Skin Slots
│       └── zipUtils.js          # Pure-Node ZIP extractor with path-traversal protection
└── test/
    └── test-backend.js          # Automated backend verification suite
```

## Quick Start on Windows

1. **Install Node.js** (v18 LTS or newer recommended) on your Windows PC.
2. Open PowerShell or Command Prompt inside the `inex-client` folder (e.g., `E:\inex client`):
   ```powershell
   npm install
   ```
3. **Run the automated backend verification tests**:
   ```powershell
   npm test
   ```
4. **Launch INEX CLIENT in desktop mode**:
   ```powershell
   npm start
   ```
5. **Build a standalone Windows `.exe` Installer & Portable executable**:
   ```powershell
   npm run build:win
   ```
   The compiled Windows installer and portable `.exe` will be output to the `dist/` directory.

## Replacing or Customizing the INEX Logo

The launcher loads `src/inex-logo.png` for both the top titlebar brand mark and the central faint background watermark (preserving its 1:1 aspect ratio without cropping or stretching). You can replace `src/inex-logo.png` with any updated transparent PNG and restart the launcher.
