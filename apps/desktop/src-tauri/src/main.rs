#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const DASHBOARD_LABEL: &str = "main";
const FLOATING_LABEL: &str = "floating";

#[tauri::command]
fn open_dashboard(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(DASHBOARD_LABEL) {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, DASHBOARD_LABEL, WebviewUrl::App("index.html".into()))
        .title("Jarvis")
        .inner_size(1180.0, 820.0)
        .min_inner_size(920.0, 680.0)
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn toggle_floating(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(FLOATING_LABEL) {
        if window.is_visible().map_err(|error| error.to_string())? {
            window.hide().map_err(|error| error.to_string())?;
        } else {
            window.show().map_err(|error| error.to_string())?;
            window.set_focus().map_err(|error| error.to_string())?;
        }
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, FLOATING_LABEL, WebviewUrl::App("index.html?floating=1".into()))
        .title("Jarvis Floating")
        .inner_size(320.0, 120.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .transparent(true)
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn emergency_stop() -> &'static str {
    "Emergency stop signal accepted. Gateway task cancellation is handled by /api/tasks/:id/cancel."
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_dashboard,
            toggle_floating,
            emergency_stop
        ])
        .setup(|app| {
            open_dashboard(app.handle().clone())?;
            toggle_floating(app.handle().clone())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Jarvis desktop");
}
