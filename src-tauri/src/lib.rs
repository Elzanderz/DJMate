use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use serde_json::{json, Value};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

fn find_bridge_script() -> PathBuf {
    let candidates = [
        PathBuf::from("python_bridge.py"),
        PathBuf::from("../python_bridge.py"),
        PathBuf::from(r"C:\Project\music convertor\python_bridge.py"),
    ];
    for c in &candidates {
        if c.exists() {
            return c.clone();
        }
    }
    PathBuf::from("python_bridge.py")
}

fn run_bridge(cmd: &str, payload: Value) -> Result<Value, String> {
    let script_path = find_bridge_script();
    let req = json!({
        "cmd": cmd,
        "args": payload
    });
    let req_str = serde_json::to_string(&req).map_err(|e| e.to_string())?;

    let mut py_cmd = Command::new("py");
    py_cmd.arg(&script_path)
        .env("PYTHONIOENCODING", "utf-8")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    py_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let mut child = py_cmd.spawn()
        .or_else(|_| {
            let mut fallback = Command::new("python3");
            fallback.arg(&script_path)
                .env("PYTHONIOENCODING", "utf-8")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            #[cfg(target_os = "windows")]
            fallback.creation_flags(0x08000000);
            fallback.spawn()
        })
        .or_else(|_| {
            let mut fallback = Command::new("python");
            fallback.arg(&script_path)
                .env("PYTHONIOENCODING", "utf-8")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            #[cfg(target_os = "windows")]
            fallback.creation_flags(0x08000000);
            fallback.spawn()
        })
        .map_err(|e| format!("Failed to execute python: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(req_str.as_bytes()).map_err(|e| e.to_string())?;
        stdin.write_all(b"\n").map_err(|e| e.to_string())?;
    }

    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);

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
        None => serde_json::from_str(stdout.trim())
            .map_err(|e| format!("Invalid JSON from python: {} (raw: {})", e, stdout))?,
    };

    if let Some(err) = parsed.get("error") {
        return Err(err.as_str().unwrap_or("Unknown error").to_string());
    }

    Ok(parsed.get("result").cloned().unwrap_or(Value::Null))
}

#[tauri::command]
async fn get_output_dir() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(|| run_bridge("get_output_dir", json!({})))
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
    let downloads_root = project_root.join("downloads");
    let raw_p = path.unwrap_or_default().trim().to_string();
    let p_name = playlist_name.or(playlistName).unwrap_or_default().trim().to_string();

    let mut target_dir: Option<PathBuf> = None;

    // 1. If playlist_name is provided, always open that specific playlist folder
    if !p_name.is_empty() && p_name.to_lowercase() != "all" && p_name.to_lowercase() != "singles" {
        let clean_p = p_name.replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "_");
        let sub = downloads_root.join(&clean_p);
        target_dir = Some(sub);
    }

    // 2. If no playlist_name, use path if provided
    if target_dir.is_none() && !raw_p.is_empty() {
        let p_buf = PathBuf::from(&raw_p);
        let abs_buf = if p_buf.is_absolute() {
            p_buf
        } else {
            project_root.join(&p_buf)
        };

        if abs_buf.is_file() || raw_p.ends_with(".mp3") || raw_p.ends_with(".m4a") || raw_p.ends_with(".flac") || raw_p.ends_with(".wav") || raw_p.ends_with(".xml") || raw_p.ends_with(".m3u8") || raw_p.ends_with(".txt") {
            target_dir = abs_buf.parent().map(|p| p.to_path_buf());
        } else {
            target_dir = Some(abs_buf);
        }
    }

    // 3. Fallback to downloads root
    let final_dir = target_dir.unwrap_or(downloads_root);
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
    tauri::async_runtime::spawn_blocking(|| run_bridge("browse_folder", json!({})))
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
async fn sync_library() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(|| run_bridge("sync_library", json!({})))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_history_track(filepath: String, delete_file: Option<bool>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_bridge("delete_history_track", json!({
            "filepath": filepath,
            "delete_file": delete_file.unwrap_or(false)
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
async fn batch_delete_tracks(filepaths: Vec<String>, delete_files: Option<bool>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_bridge("batch_delete_tracks", json!({
            "filepaths": filepaths,
            "delete_files": delete_files.unwrap_or(false)
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
            search_online_tracks
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
