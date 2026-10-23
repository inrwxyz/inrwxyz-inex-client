//! INEX CLIENT — Tauri shell.
//!
//! The launcher's original backend (main.js + src/main/*) is Node code. It runs unchanged in a Node
//! "sidecar" process (`inex-node.exe sidecar/index.js`); this shell
//!   * shows the window (WebView2) with the existing HTML/CSS/JS UI,
//!   * forwards `window.inexAPI.*` calls from the UI to the sidecar (command `inex_invoke`),
//!   * forwards sidecar events (`event:*`) to the UI (Tauri event `inex-event`),
//!   * performs native things the sidecar asks for (dialogs, open URL/folder, quit).
//!
//! Protocol (newline-delimited JSON over the sidecar's stdin/stdout) is documented in sidecar/electron-shim.js.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::oneshot;

type Reply = Result<Value, String>;

struct Sidecar {
    stdin: Mutex<Option<ChildStdin>>,
    child: Mutex<Option<Child>>,
    pending: Mutex<HashMap<u64, oneshot::Sender<Reply>>>,
    next_id: AtomicU64,
    /// set once the app is shutting down (window closed / quit requested)
    closing: AtomicBool,
}

impl Sidecar {
    fn new() -> Self {
        Sidecar {
            stdin: Mutex::new(None),
            child: Mutex::new(None),
            pending: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
            closing: AtomicBool::new(false),
        }
    }

    fn write(&self, msg: &Value) -> Result<(), String> {
        let mut guard = self.stdin.lock().map_err(|_| "Backend lock poisoned".to_string())?;
        let stdin = guard.as_mut().ok_or_else(|| "The backend is not running.".to_string())?;
        let mut line = msg.to_string();
        line.push('\n');
        stdin
            .write_all(line.as_bytes())
            .and_then(|_| stdin.flush())
            .map_err(|e| format!("Could not talk to the backend: {e}"))
    }

    fn kill(&self) {
        // closing stdin makes the sidecar exit by itself; kill is the safety net
        if let Ok(mut s) = self.stdin.lock() {
            s.take();
        }
        if let Ok(mut c) = self.child.lock() {
            if let Some(child) = c.as_mut() {
                let _ = child.kill();
                let _ = child.wait();
            }
            c.take();
        }
    }

    fn fail_all_pending(&self, reason: &str) {
        if let Ok(mut p) = self.pending.lock() {
            for (_, tx) in p.drain() {
                let _ = tx.send(Err(reason.to_string()));
            }
        }
    }
}

/// UI -> backend. Mirrors ipcRenderer.invoke(channel, ...args).
#[tauri::command]
async fn inex_invoke(
    state: tauri::State<'_, Arc<Sidecar>>,
    channel: String,
    args: Vec<Value>,
) -> Result<Value, String> {
    let id = state.next_id.fetch_add(1, Ordering::SeqCst);
    let (tx, rx) = oneshot::channel::<Reply>();
    state
        .pending
        .lock()
        .map_err(|_| "Backend lock poisoned".to_string())?
        .insert(id, tx);

    let msg = json!({ "t": "invoke", "id": id, "channel": channel, "args": args });
    if let Err(e) = state.write(&msg) {
        if let Ok(mut p) = state.pending.lock() {
            p.remove(&id);
        }
        return Err(e);
    }
    match rx.await {
        Ok(reply) => reply,
        Err(_) => Err("The backend stopped unexpectedly.".to_string()),
    }
}

// ---------------------------------------------------------------------------------------------
// sidecar process
// ---------------------------------------------------------------------------------------------

/// Windows' `\\?\` verbatim prefix confuses Node and Java; strip it.
fn clean_path(p: PathBuf) -> PathBuf {
    let s = p.to_string_lossy().to_string();
    match s.strip_prefix(r"\\?\") {
        Some(rest) => PathBuf::from(rest),
        None => p,
    }
}

/// Folder that contains main.js + sidecar/ + src/main/ (the Node backend).
fn locate_backend(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    // `tauri dev`: run the backend straight from the repo, no copy needed
    #[cfg(debug_assertions)]
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".."));
    if let Ok(res) = app.path().resource_dir() {
        candidates.push(res.join("backend"));
    }
    for c in candidates {
        if c.join("main.js").is_file() && c.join("sidecar").join("index.js").is_file() {
            return Ok(clean_path(c));
        }
    }
    Err("Backend files (main.js / sidecar) were not found next to the launcher.".to_string())
}

/// The bundled Node runtime (installed next to the launcher as inex-node.exe); falls back to `node` from PATH in dev.
fn locate_node() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for name in ["inex-node.exe", "inex-node"] {
                let p = dir.join(name);
                if p.is_file() {
                    return p;
                }
            }
        }
    }
    PathBuf::from("node")
}

fn start_backend(app: AppHandle, sc: Arc<Sidecar>) -> Result<(), String> {
    let backend = locate_backend(&app)?;
    let node = locate_node();

    let mut cmd = Command::new(&node);
    cmd.arg(backend.join("sidecar").join("index.js"))
        .current_dir(&backend)
        .env("INEX_PACKAGED", if cfg!(debug_assertions) { "0" } else { "1" })
        .env("INEX_VERSION", app.package_info().version.to_string())
        .env("INEX_RESOURCES", &backend)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Could not start the backend ({}): {e}", node.display()))?;
    let stdin = child.stdin.take().ok_or("backend stdin unavailable")?;
    let stdout = child.stdout.take().ok_or("backend stdout unavailable")?;
    let stderr = child.stderr.take();

    *sc.stdin.lock().map_err(|_| "lock poisoned")? = Some(stdin);
    *sc.child.lock().map_err(|_| "lock poisoned")? = Some(child);

    // backend diagnostics -> <app log dir>/sidecar.log
    if let Some(mut err) = stderr {
        let log_path = app.path().app_log_dir().ok().map(|d| d.join("sidecar.log"));
        std::thread::spawn(move || {
            if let Some(path) = log_path {
                if let Some(parent) = path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                if let Ok(mut f) = std::fs::File::create(&path) {
                    let _ = std::io::copy(&mut err, &mut f);
                    return;
                }
            }
            let _ = std::io::copy(&mut err, &mut std::io::sink());
        });
    }

    start_reader(app, sc, stdout);
    Ok(())
}

fn start_reader(app: AppHandle, sc: Arc<Sidecar>, stdout: ChildStdout) {
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let line = match line {
                Ok(l) => l,
                Err(_) => break,
            };
            let msg: Value = match serde_json::from_str(&line) {
                Ok(v) => v,
                Err(_) => continue,
            };
            match msg.get("t").and_then(Value::as_str) {
                Some("res") => {
                    let id = msg.get("id").and_then(Value::as_u64).unwrap_or(0);
                    let tx = sc.pending.lock().ok().and_then(|mut p| p.remove(&id));
                    if let Some(tx) = tx {
                        let ok = msg.get("ok").and_then(Value::as_bool).unwrap_or(false);
                        let reply = if ok {
                            Ok(msg.get("result").cloned().unwrap_or(Value::Null))
                        } else {
                            Err(msg
                                .get("error")
                                .and_then(Value::as_str)
                                .unwrap_or("Unknown backend error")
                                .to_string())
                        };
                        let _ = tx.send(reply);
                    }
                }
                Some("event") => {
                    let payload = json!({
                        "channel": msg.get("channel").cloned().unwrap_or(Value::Null),
                        "data": msg.get("data").cloned().unwrap_or(Value::Null),
                    });
                    let _ = app.emit("inex-event", payload);
                }
                Some("host") => {
                    // dialogs block, so every host call gets its own thread
                    let app = app.clone();
                    let sc = sc.clone();
                    std::thread::spawn(move || handle_host(app, sc, msg));
                }
                _ => {}
            }
        }
        // stdout closed => backend is gone
        sc.fail_all_pending("The backend stopped unexpectedly.");
    });
}

// ---------------------------------------------------------------------------------------------
// native things the backend asks for (Electron's dialog / shell / app / BrowserWindow)
// ---------------------------------------------------------------------------------------------

fn handle_host(app: AppHandle, sc: Arc<Sidecar>, msg: Value) {
    let id = msg.get("id").and_then(Value::as_u64).unwrap_or(0);
    let method = msg.get("method").and_then(Value::as_str).unwrap_or("").to_string();
    let args: Vec<Value> = msg
        .get("args")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let reply = match host_call(&app, &sc, &method, &args) {
        Ok(v) => json!({ "t": "hostres", "id": id, "ok": true, "result": v }),
        Err(e) => json!({ "t": "hostres", "id": id, "ok": false, "error": e }),
    };
    let _ = sc.write(&reply);
}

fn str_list(v: Option<&Value>) -> Vec<String> {
    v.and_then(Value::as_array)
        .map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default()
}

fn host_call(app: &AppHandle, sc: &Arc<Sidecar>, method: &str, args: &[Value]) -> Reply {
    let a0 = args.first().cloned().unwrap_or(Value::Null);
    match method {
        "quit" => {
            sc.closing.store(true, Ordering::SeqCst);
            app.exit(0);
            Ok(Value::Null)
        }
        "window.minimize" => {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.minimize();
            }
            Ok(Value::Null)
        }
        "window.maximize" => {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.maximize();
            }
            Ok(Value::Null)
        }
        "window.unmaximize" => {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unmaximize();
            }
            Ok(Value::Null)
        }
        "shell.openExternal" => {
            let url = a0.as_str().ok_or_else(|| "Invalid URL.".to_string())?;
            if !(url.starts_with("http://") || url.starts_with("https://")) {
                return Err("Invalid external URL.".to_string());
            }
            app.opener()
                .open_url(url, None::<&str>)
                .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "shell.openPath" => {
            let path = a0.as_str().ok_or_else(|| "Invalid path.".to_string())?;
            app.opener()
                .open_path(path, None::<&str>)
                .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "dialog.open" => {
            let mut b = app.dialog().file();
            if let Some(t) = a0.get("title").and_then(Value::as_str) {
                b = b.set_title(t);
            }
            if let Some(d) = a0.get("defaultPath").and_then(Value::as_str) {
                let p = PathBuf::from(d);
                if p.is_dir() {
                    b = b.set_directory(p);
                } else if let Some(parent) = p.parent() {
                    if parent.is_dir() {
                        b = b.set_directory(parent.to_path_buf());
                    }
                }
            }
            if let Some(filters) = a0.get("filters").and_then(Value::as_array) {
                for f in filters {
                    let name = f.get("name").and_then(Value::as_str).unwrap_or("Files");
                    let exts = str_list(f.get("extensions"));
                    let refs: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
                    b = b.add_filter(name, &refs);
                }
            }
            let want_dir = str_list(a0.get("properties")).iter().any(|p| p == "openDirectory");
            let picked = if want_dir { b.blocking_pick_folder() } else { b.blocking_pick_file() };
            match picked {
                Some(fp) => {
                    let path = fp.into_path().map_err(|e| e.to_string())?;
                    Ok(json!({ "canceled": false, "filePaths": [clean_path(path).to_string_lossy()] }))
                }
                None => Ok(json!({ "canceled": true, "filePaths": [] })),
            }
        }
        "dialog.message" => {
            let message = a0.get("message").and_then(Value::as_str).unwrap_or("").to_string();
            let title = a0.get("title").and_then(Value::as_str).unwrap_or("INEX CLIENT").to_string();
            let buttons = str_list(a0.get("buttons"));
            let mut d = app.dialog().message(message).title(title);
            if buttons.len() >= 2 {
                d = d.buttons(MessageDialogButtons::OkCancelCustom(
                    buttons[0].clone(),
                    buttons[1].clone(),
                ));
            }
            let first = d.blocking_show();
            Ok(json!({ "response": if first { 0 } else { 1 } }))
        }
        other => Err(format!("Unsupported host call: {other}")),
    }
}

// ---------------------------------------------------------------------------------------------

pub fn run() {
    let sidecar = Arc::new(Sidecar::new());
    let for_setup = sidecar.clone();
    let for_exit = sidecar.clone();

    tauri::Builder::default()
        // Must be the FIRST plugin: a second launch exits right away and just brings the running window to the front.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(sidecar)
        .invoke_handler(tauri::generate_handler![inex_invoke])
        .setup(move |app| {
            if let Err(e) = start_backend(app.handle().clone(), for_setup.clone()) {
                app.dialog()
                    .message(format!("INEX CLIENT could not start its backend.\n\n{e}"))
                    .title("INEX CLIENT")
                    .blocking_show();
                return Err(e.into());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() != "main" {
                    return;
                }
                // Let the backend stop running servers / tunnels first (same as the old window-all-closed handler).
                api.prevent_close();
                let app = window.app_handle().clone();
                let sc = app.state::<Arc<Sidecar>>();
                if sc.closing.swap(true, Ordering::SeqCst) {
                    return; // already shutting down
                }
                if sc.write(&json!({ "t": "window-all-closed" })).is_err() {
                    app.exit(0);
                    return;
                }
                // safety net if the backend hangs while stopping
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(20));
                    app.exit(0);
                });
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building INEX CLIENT")
        .run(move |_app, event| {
            if let RunEvent::Exit = event {
                for_exit.kill();
            }
        });
}
