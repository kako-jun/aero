#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, PhysicalPosition, PhysicalSize};

/// Heuristic offset from the bottom of the screen to clear the Windows taskbar.
/// The taskbar is typically 40–48px at 100% DPI, but can be up to 72px at 150%.
/// Using 60px as a safe default; the proper fix is to use the work-area API
/// once Tauri v2 exposes it stably.
const TASKBAR_HEURISTIC_PX: u32 = 60;
const MARGIN_PX: u32 = 12;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .expect("window 'main' not found in tauri.conf.json");

            // Hide before positioning to avoid a flash at the dummy initial coords.
            window.hide()?;

            if let Some(monitor) = window.current_monitor()? {
                let screen = monitor.size();
                let win = PhysicalSize::new(260_u32, 90_u32);
                let x = screen.width.saturating_sub(win.width + MARGIN_PX);
                let y = screen
                    .height
                    .saturating_sub(win.height + TASKBAR_HEURISTIC_PX + MARGIN_PX);
                window.set_position(PhysicalPosition::new(x, y))?;
            }

            window.show()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running aero");
}
