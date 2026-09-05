use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use serde_json::{json, Value};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

fn find_bridge_script() -> PathBuf {
    let mut candidates = Vec::new();

    // 1. Check relative to current working directory
    candidates.push(PathBuf::from("python_bridge.py"));
    candidates.push(PathBuf::from("../python_bridge.py"));
    candidates.push(PathBuf::from("resources/python_bridge.py"));
    candidates.push(PathBuf::from("resources/_up_/python_bridge.py"));

    // 2. Check relative to current executable location (installed app or dev target)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            candidates.push(exe_dir.join("python_bridge.py"));
            candidates.push(exe_dir.join("resources").join("python_bridge.py"));
            candidates.push(exe_dir.join("resources").join("_up_").join("python_bridge.py"));
            candidates.push(exe_dir.join("_up_").join("python_bridge.py"));
            candidates.push(exe_dir.join("..").join("Resources").join("python_bridge.py"));
            candidates.push(exe_dir.join("..").join("Resources").join("_up_").join("python_bridge.py"));
            candidates.push(exe_dir.join("..").join("..").join("Resources").join("python_bridge.py"));
            candidates.push(exe_dir.join("..").join("python_bridge.py"));
            candidates.push(exe_dir.join("..").join("..").join("python_bridge.py"));
            candidates.push(exe_dir.join("..").join("..").join("..").join("python_bridge.py"));
            candidates.push(exe_dir.join("..").join("..").join("..").join("..").join("python_bridge.py"));
        }
    }

    // 3. Known dev paths
    candidates.push(PathBuf::from(r"C:\Project\music convertor\python_bridge.py"));

    for c in &candidates {
        if c.exists() {
            if let Ok(canon) = c.canonicalize() {
                return canon;
            }
            return c.clone();
        }
    }

    // 4. Recursive search in resources folder
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let search_folders = [
                exe_dir.to_path_buf(),
                exe_dir.join("resources"),
                exe_dir.join("..").join("Resources"),
            ];
            for folder in &search_folders {
                if folder.exists() {
                    if let Ok(entries) = std::fs::read_dir(folder) {
                        for entry in entries.flatten() {
                            let p = entry.path().join("python_bridge.py");
                            if p.exists() {
                                return p;
                            }
                        }
                    }
                }
            }
        }
    }

    PathBuf::from(r"C:\Project\music convertor\python_bridge.py")
}

fn run_bridge(cmd: &str, payload: Value) -> Result<Value, String> {
    let script_path = find_bridge_script();
    let script_dir = script_path.parent().unwrap_or(&PathBuf::from(".")).to_path_buf();
    let req = json!({
        "cmd": cmd,
        "args": payload
    });
    let req_str = serde_json::to_string(&req).map_err(|e| e.to_string())?;

    let mut python_bins = Vec::new();
    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            python_bins.push(format!("{}\\Python\\pythoncore-3.11-64\\python.exe", local_app_data));
            python_bins.push(format!("{}\\Python\\pythoncore-3.12-64\\python.exe", local_app_data));
            python_bins.push(format!("{}\\Programs\\Python\\Python311\\python.exe", local_app_data));
            python_bins.push(format!("{}\\Programs\\Python\\Python312\\python.exe", local_app_data));
            python_bins.push(format!("{}\\Programs\\Python\\Python310\\python.exe", local_app_data));
        }
        python_bins.push("python".to_string());
        python_bins.push("python3".to_string());
        python_bins.push("py".to_string());
    }
    #[cfg(not(target_os = "windows"))]
    {
        // 1. PATH binaries first
        python_bins.push("python3".to_string());
        python_bins.push("python".to_string());

        // 2. User & system Conda/Anaconda/Miniconda environments
        if let Ok(home) = std::env::var("HOME") {
            python_bins.push(format!("{}/opt/anaconda3/bin/python3", home));
            python_bins.push(format!("{}/anaconda3/bin/python3", home));
            python_bins.push(format!("{}/opt/miniconda3/bin/python3", home));
            python_bins.push(format!("{}/miniconda3/bin/python3", home));
            python_bins.push(format!("{}/.pyenv/shims/python3", home));
        }
        python_bins.push("/opt/anaconda3/bin/python3".to_string());
        python_bins.push("/opt/miniconda3/bin/python3".to_string());

        // 3. Homebrew (Apple Silicon & Intel)
        python_bins.push("/opt/homebrew/bin/python3".to_string());
        python_bins.push("/usr/local/bin/python3".to_string());

        // 4. System / Xcode Command Line Tools fallbacks
        python_bins.push("/usr/bin/python3".to_string());
        python_bins.push("/Library/Developer/CommandLineTools/usr/bin/python3".to_string());
    }

    let payload_str = serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string());
    let mut last_spawn_err = String::new();
    let mut child_opt = None;

    for bin in &python_bins {
        let mut py_cmd = Command::new(bin);
        py_cmd.arg(&script_path)
            .arg(cmd)
            .arg(&payload_str)
            .current_dir(&script_dir)
            .env("PYTHONPATH", &script_dir)
            .env("PYTHONIOENCODING", "utf-8")
            .env("PYTHONUNBUFFERED", "1")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(target_os = "windows")]
        py_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        match py_cmd.spawn() {
            Ok(c) => {
                child_opt = Some(c);
                break;
            }
            Err(e) => {
                last_spawn_err = format!("Failed to spawn {}: {}", bin, e);
            }
        }
    }

    let child = child_opt.ok_or_else(|| {
        format!(
            "Could not find Python 3 executable on system. Please ensure Python 3 is installed.\nDetail: {}",
            last_spawn_err
        )
    })?;

    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    // Search for valid JSON from the last line backwards to filter out any stdout noise
    let mut parsed_opt: Option<Value> = None;
    for line in stdout.lines().rev() {
        let trimmed = line.trim();
        if trimmed.starts_with('{') && trimmed.ends_with('}') {
            if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
                parsed_opt = Some(val);
                break;
            }
        }
    }

    let parsed = match parsed_opt {
        Some(val) => val,
        None => {
            let err_msg = if !stderr.trim().is_empty() {
                format!("Python Error:\n{}\n\nOutput: {}", stderr.trim(), stdout.trim())
            } else if stdout.trim().is_empty() {
                "Python returned empty output. Please make sure Python 3 and dependencies (yt-dlp, mutagen, requests) are installed on your system.\nTry running: pip3 install yt-dlp mutagen requests".to_string()
            } else {
                format!("Invalid JSON from python: {}\nDetail: {}", stdout.trim(), stderr.trim())
            };
            return Err(err_msg);
        }
    };

    if let Some(err) = parsed.get("error") {
        return Err(err.as_str().unwrap_or("Unknown error").to_string());
    }

    Ok(parsed.get("result").cloned().unwrap_or(Value::Null))
}

#[tauri::command]
async fn check_system_health() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(|| run_bridge("check_system_health", json!({})))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn install_missing_modules() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(|| run_bridge("install_missing_modules", json!({})))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_output_dir() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(|| run_bridge("get_output_dir", json!({})))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_download_subfolders() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(|| run_bridge("get_download_subfolders", json!({})))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn fetch_metadata(url: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || run_bridge("fetch_metadata", json!({ "url": url })))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn scan_youtube_shazam(url: String, interval_sec: Option<i64>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_bridge("scan_youtube_shazam", json!({
            "url": url,
            "interval_sec": interval_sec.unwrap_or(45)
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn harmonic_sort(tracks: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || run_bridge("harmonic_sort", json!({ "tracks": tracks })))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn export_rekordbox(tracks: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || run_bridge("export_rekordbox", json!({ "tracks": tracks })))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn export_m3u8(tracks: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || run_bridge("export_m3u8", json!({ "tracks": tracks })))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn download_single(
    track: Value,
    audio_format: Option<String>,
    quality: Option<String>,
    stem_type: Option<String>,
    folder_mode: Option<String>,
    normalize_audio: Option<bool>,
    target_lufs: Option<f64>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_bridge("download_single", json!({
            "track": track,
            "audio_format": audio_format.unwrap_or_else(|| "MP3".to_string()),
            "quality": quality.unwrap_or_else(|| "320 kbps".to_string()),
            "stem_type": stem_type.unwrap_or_else(|| "full".to_string()),
            "folder_mode": folder_mode.unwrap_or_else(|| "playlist".to_string()),
            "normalize_audio": normalize_audio.unwrap_or(true),
            "target_lufs": target_lufs.unwrap_or(-14.0)
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn batch_normalize_tracks(filepaths: Vec<String>, target_lufs: Option<f64>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_bridge("batch_normalize_tracks", json!({
            "filepaths": filepaths,
            "target_lufs": target_lufs.unwrap_or(-14.0)
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_audio_data_url(filepath: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || run_bridge("get_audio_data_url", json!({ "filepath": filepath })))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_tags(track: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || run_bridge("save_tags", json!({ "track": track })))
        .await
        .map_err(|e| e.to_string())?
}

fn find_project_root() -> PathBuf {
    let script = find_bridge_script();
    if let Some(parent) = script.parent() {
        if !parent.as_os_str().is_empty() {
            return parent.to_path_buf();
        }
    }
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    if cwd.join("python_bridge.py").exists() {
        cwd
    } else if cwd.parent().map(|p| p.join("python_bridge.py").exists()).unwrap_or(false) {
        cwd.parent().unwrap().to_path_buf()
    } else {
        PathBuf::from(r"C:\Project\music convertor")
    }
}

#[tauri::command]
#[allow(non_snake_case)]
fn open_folder(path: Option<String>, playlist_name: Option<String>, playlistName: Option<String>) -> Result<bool, String> {
    let project_root = find_project_root();
    let default_downloads = project_root.join("downloads");

    // 1. Fetch user's active configured output directory from settings
    let active_output_dir = match run_bridge("get_output_dir", serde_json::json!({})) {
        Ok(Value::String(s)) => {
            let mut p = s.trim().to_string();
            if p.starts_with(r"\\?\") {
                p = p[4..].to_string();
            }
            if !p.is_empty() {
                PathBuf::from(p)
            } else {
                default_downloads
            }
        }
        _ => default_downloads,
    };

    let raw_p = path.unwrap_or_default().trim().to_string();
    let p_name = playlist_name.or(playlistName).unwrap_or_default().trim().to_string();

    let mut target_dir: Option<PathBuf> = None;

    // 1. If explicit filepath/folderpath is provided, prioritize it
    if !raw_p.is_empty() {
        let mut clean_raw = raw_p.clone();
        if clean_raw.starts_with(r"\\?\") {
            clean_raw = clean_raw[4..].to_string();
        }
        let p_buf = PathBuf::from(&clean_raw);
        let abs_buf = if p_buf.is_absolute() {
            p_buf
        } else {
            active_output_dir.join(&p_buf)
        };

        if abs_buf.is_file() || clean_raw.ends_with(".mp3") || clean_raw.ends_with(".m4a") || clean_raw.ends_with(".flac") || clean_raw.ends_with(".wav") || clean_raw.ends_with(".xml") || clean_raw.ends_with(".m3u8") || clean_raw.ends_with(".txt") {
            target_dir = abs_buf.parent().map(|p| p.to_path_buf());
        } else {
            target_dir = Some(abs_buf);
        }
    }

    // 2. If no valid path, check playlist_name inside active_output_dir
    if target_dir.is_none() && !p_name.is_empty() && p_name.to_lowercase() != "all" && p_name.to_lowercase() != "singles" {
        let clean_p = p_name.replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "_");
        let sub = active_output_dir.join(&clean_p);
        target_dir = Some(sub);
    }

    // 3. Fallback to active output dir
    let final_dir = target_dir.unwrap_or(active_output_dir);
    let _ = std::fs::create_dir_all(&final_dir);
    let final_str = final_dir.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("explorer");
        cmd.arg(&final_str);
        cmd.creation_flags(0x08000000);
        let _ = cmd.spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open").arg(&final_str).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("xdg-open").arg(&final_str).spawn();
    }
    Ok(true)
}

#[tauri::command]
async fn browse_folder() -> Result<Value, String> {
    let chosen_path = tauri::async_runtime::spawn_blocking(|| -> Result<Option<String>, String> {
        #[cfg(target_os = "macos")]
        {
            let script = r#"
                tell application "System Events"
                    activate
                end tell
                set chosen to choose folder with prompt "เลือกโฟลเดอร์สำหรับจัดเก็บเพลง DJMate"
                return POSIX path of chosen
            "#;
            let output = Command::new("osascript")
                .arg("-e")
                .arg(script)
                .output()
                .map_err(|e| format!("Failed to launch macOS folder dialog: {}", e))?;

            if output.status.success() {
                let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !s.is_empty() {
                    return Ok(Some(s));
                }
            }
            return Ok(None);
        }

        #[cfg(not(target_os = "macos"))]
        {
            if let Some(folder) = rfd::FileDialog::new().set_title("เลือกโฟลเดอร์สำหรับจัดเก็บเพลง DJMate").pick_folder() {
                let mut path_str = folder.to_string_lossy().to_string();
                if path_str.starts_with(r"\\?\") {
                    path_str = path_str[4..].to_string();
                }
                return Ok(Some(path_str));
            }
            return Ok(None);
        }
    })
    .await
    .map_err(|e| e.to_string())??;

    if let Some(path_str) = chosen_path {
        let res = tauri::async_runtime::spawn_blocking(move || {
            run_bridge("set_output_dir", json!({ "path": &path_str }))
        })
        .await
        .map_err(|e| e.to_string())??;
        return Ok(res);
    }

    tauri::async_runtime::spawn_blocking(|| run_bridge("get_output_dir", json!({})))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn set_output_dir(path: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || run_bridge("set_output_dir", json!({ "path": path })))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn build_smart_mixtape(
    tracks: Value,
    mode: Option<String>,
    genre_filter: Option<String>,
    min_bpm: Option<f64>,
    max_bpm: Option<f64>,
    min_stars: Option<i64>,
    max_stars: Option<i64>,
    target_count: Option<i64>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_bridge("build_smart_mixtape", json!({
            "tracks": tracks,
            "mode": mode.unwrap_or_else(|| "peak_climb".to_string()),
            "genre_filter": genre_filter.unwrap_or_else(|| "ALL".to_string()),
            "min_bpm": min_bpm,
            "max_bpm": max_bpm,
            "min_stars": min_stars,
            "max_stars": max_stars,
            "target_count": target_count
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn export_smart_mixtape_package(tracks: Value, title: Option<String>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_bridge("export_smart_mixtape_package", json!({
            "tracks": tracks,
            "title": title.unwrap_or_else(|| "Smart_Mixtape_DJ_Set".to_string())
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_history() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(|| run_bridge("get_history", json!({ "rescan": true })))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn sync_library(path: Option<String>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let payload = if let Some(p) = path {
            json!({ "path": p })
        } else {
            json!({})
        };
        run_bridge("sync_library", payload)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_history_track(
    filepath: Option<String>,
    track_id: Option<String>,
    delete_file: Option<bool>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_bridge("delete_history_track", json!({
            "filepath": filepath.unwrap_or_default(),
            "track_id": track_id,
            "delete_file": delete_file.unwrap_or(true)
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn search_spotify_tracks(queries: Vec<String>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_bridge("search_spotify_tracks", json!({ "queries": queries }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn batch_update_tracks(filepaths: Vec<String>, updated_fields: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_bridge("batch_update_tracks", json!({
            "filepaths": filepaths,
            "updated_fields": updated_fields
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn batch_delete_tracks(
    filepaths: Option<Vec<String>>,
    track_ids: Option<Vec<String>>,
    delete_files: Option<bool>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_bridge("batch_delete_tracks", json!({
            "filepaths": filepaths.unwrap_or_default(),
            "track_ids": track_ids.unwrap_or_default(),
            "delete_files": delete_files.unwrap_or(true)
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn export_to_dj_drive(tracks: Value, target_dir: Option<String>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_bridge("export_to_dj_drive", json!({
            "tracks": tracks,
            "target_dir": target_dir.unwrap_or_else(|| "".to_string())
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_removable_drives() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(|| run_bridge("get_removable_drives", json!({})))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_gig_crates(tracks: Option<Value>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_bridge("get_gig_crates", json!({ "tracks": tracks }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn build_gig_storage(tracks: Option<Value>, target_dir: Option<String>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_bridge("build_gig_storage", json!({
            "tracks": tracks,
            "target_dir": target_dir
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn scan_duplicates(tracks: Option<Value>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_bridge("scan_duplicates", json!({ "tracks": tracks }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn clean_duplicates_batch(filepaths: Vec<String>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_bridge("clean_duplicates_batch", json!({ "filepaths": filepaths }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn redownload_studio_master(filepath: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_bridge("redownload_studio_master", json!({ "filepath": filepath }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_activities(limit: Option<i64>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_bridge("get_activities", json!({ "limit": limit.unwrap_or(200) }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn clear_activities() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_bridge("clear_activities", json!({}))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn find_mashup_matches(tracks: Option<Value>, min_score: Option<i64>, limit: Option<i64>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_bridge("find_mashup_matches", json!({
            "tracks": tracks,
            "min_score": min_score.unwrap_or(80),
            "limit": limit.unwrap_or(50)
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
#[allow(non_snake_case)]
async fn generate_ai_playlist(
    prompt: Option<String>,
    count: Option<i64>,
    api_key: Option<String>,
    apiKey: Option<String>,
    provider: Option<String>,
    languages: Option<Value>,
    mixtape_mode: Option<String>,
    mixtapeMode: Option<String>,
    payload: Option<Value>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = prompt
            .or_else(|| payload.as_ref().and_then(|v| v.get("prompt").and_then(|s| s.as_str().map(String::from))))
            .unwrap_or_default();
        let cnt = count
            .or_else(|| payload.as_ref().and_then(|v| v.get("count").and_then(|c| c.as_i64())))
            .unwrap_or(15);
        let key = api_key
            .or(apiKey)
            .or_else(|| payload.as_ref().and_then(|v| v.get("api_key").or_else(|| v.get("apiKey")).and_then(|k| k.as_str().map(String::from))));
        let prov = provider
            .or_else(|| payload.as_ref().and_then(|v| v.get("provider").and_then(|pr| pr.as_str().map(String::from))))
            .unwrap_or_else(|| "gemini".to_string());
        let langs = languages
            .or_else(|| payload.as_ref().and_then(|v| v.get("languages").cloned()))
            .unwrap_or_else(|| json!(["thai", "english"]));
        let mm = mixtape_mode
            .or(mixtapeMode)
            .or_else(|| payload.as_ref().and_then(|v| v.get("mixtape_mode").or_else(|| v.get("mixtapeMode")).and_then(|m| m.as_str().map(String::from))))
            .unwrap_or_else(|| "peak_climb".to_string());

        run_bridge("generate_ai_playlist", json!({
            "prompt": p,
            "count": cnt,
            "api_key": key,
            "provider": prov,
            "languages": langs,
            "mixtape_mode": mm
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn search_music_unified(query: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || run_bridge("search_music_unified", json!({ "query": query })))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn search_local_folder(query: Option<String>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || run_bridge("search_local_folder", json!({ "query": query.unwrap_or_default() })))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn search_online_tracks(query: String, limit: Option<i64>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || run_bridge("search_online_tracks", json!({ "query": query, "limit": limit.unwrap_or(10) })))
        .await
        .map_err(|e| e.to_string())?
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_output_dir,
            get_download_subfolders,
            fetch_metadata,
            search_spotify_tracks,
            generate_ai_playlist,
            scan_youtube_shazam,
            harmonic_sort,
            build_smart_mixtape,
            export_smart_mixtape_package,
            get_history,
            sync_library,
            delete_history_track,
            batch_update_tracks,
            batch_delete_tracks,
            export_to_dj_drive,
            get_removable_drives,
            get_gig_crates,
            build_gig_storage,
            scan_duplicates,
            clean_duplicates_batch,
            redownload_studio_master,
            get_activities,
            clear_activities,
            find_mashup_matches,
            export_rekordbox,
            export_m3u8,
            download_single,
            batch_normalize_tracks,
            get_audio_data_url,
            save_tags,
            open_folder,
            browse_folder,
            set_output_dir,
            search_music_unified,
            search_local_folder,
            search_online_tracks,
            check_system_health,
            install_missing_modules
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
