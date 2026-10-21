# INEX CLIENT — Tauri migration (step 1: Tauri shell + Node backend)

Everything in this folder is an **overlay** on your existing repo: same folder structure
(`src/`, `src/main/`, `main.js`, `preload.js`, ...). Your UI and all backend code stay untouched.
Only these are new/replaced:

| Path | What |
|---|---|
| `package.json` | Tauri CLI instead of Electron (`firebase` removed: nothing used it) |
| `sidecar/` | Runs your existing `main.js` + `src/main/*` in a Node process (fake `electron` module) |
| `src-tauri/` | Rust shell, `tauri.conf.json`, permissions, installer hook |
| `scripts/` | build helpers (bridge generated from `preload.js`, backend copy, node.exe copy) |
| `.github/workflows/release.yml` | Windows build + GitHub Release + updater files |
| `.gitignore` | adds Tauri folders |

`src/index.html` is **not** edited: the build injects the 2 extra `<script>` tags into a copy (`dist-ui/`).
If you add a new IPC method to `preload.js` later, nothing else to do — the bridge is regenerated from it.

## One-time setup (Windows)
1. Install Rust: https://rustup.rs  (+ "Desktop development with C++" from Visual Studio Build Tools).
2. In the project folder: `npm install`
3. Make the update-signing key (YOUR key, never share/commit it):
   `npx tauri signer generate -w %USERPROFILE%\.tauri\inex.key`
   - copy the printed **public key** into `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`
   - on GitHub: repo → Settings → Secrets and variables → Actions → add
     `TAURI_SIGNING_PRIVATE_KEY` (full content of `inex.key`) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (the password you typed)

## Test locally
`npm run dev`  (runs the backend straight from the repo, using `node` from PATH)

## Release
1. bump `"version"` in `package.json` (e.g. 1.0.5)
2. `git commit -am "release 1.0.5"` → `git tag v1.0.5` → `git push --follow-tags`
3. GitHub Actions builds the installer and publishes the Release (setup `.exe`, `.sig`, `latest.json`).
   Installed apps check `latest.json` and show the same update card as before.

## Notes
- Your data (profiles, servers, accounts) lives in `%APPDATA%` / `%LOCALAPPDATA%` — unchanged, the new app reads it.
- Old Electron installs update through `latest.yml`; the Tauri build uses `latest.json`, so people on the old
  Electron version install the first Tauri build manually once. After that, updates are automatic.
- The Release must be public (or the updater cannot download it).
- Backend log: `%LOCALAPPDATA%\com.inexclient.launcher\logs\sidecar.log`
