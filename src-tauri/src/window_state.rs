//! Remembering how big the window was, and putting it back that way next time.
//!
//! The app's configured size is the size it opens at the first time it is
//! ever run. After that the window is as large as the user last made it, and
//! the app opens that size.
//!
//! The **position** is not remembered. The window always opens centred on the
//! screen, which is the one position that is right on every machine and every
//! arrangement of monitors — a remembered position is right on the machine it
//! was remembered on and wrong everywhere else.
//!
//! The state is one small JSON file in the app's data directory — permanent
//! storage, not the cache and not temp, because a window that forgets how big
//! it was is a window that opens at the wrong size every single morning.
//!
//! ## What is remembered, and in what units
//!
//! The **size** is kept in logical pixels, so the window is the same apparent
//! size on a display at 125% as on one at 200%. The width and the height are
//! the content's, not the frame's, so they are the numbers the app is laid
//! out in.
//!
//! ## A known edge on Linux
//!
//! The size is measured as the window's content and restored by asking for
//! that content size. On Windows and macOS the two are the same measurement
//! and the round trip is exact. On a desktop that draws its own decorations
//! around the window — GNOME on Wayland — asking for a content size of X
//! produces a content size of X plus the decoration, so the window grows a
//! little on every launch. The same drift is in Tauri's own window-state
//! plugin; the fix needs the decoration extent, which only the platform
//! knows.

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, LogicalSize, Manager, PhysicalSize, Window, WindowEvent,
};

use crate::appfile;

/// How often a change is written out.
///
/// A drag fires a move or resize event for every pixel, and writing the file
/// that often would be a lot of work for a value that is about to change
/// again. The events are recorded as they happen and written out at this
/// interval instead.
const FLUSH_INTERVAL: Duration = Duration::from_millis(500);

/// The file's name, inside the app's data directory.
const FILE_NAME: &str = "window-state.json";

/// The version of the file's shape.
///
/// A file written by a different shape than this build understands is not
/// read: the window opens at its configured size rather than at a size this
/// build would misread.
const STATE_VERSION: u32 = 1;

/// The window's size, remembered between runs.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    /// Which shape this file is.
    pub version: u32,
    /// How wide its content was, in logical pixels.
    pub width: u32,
    /// How tall its content was, in logical pixels.
    pub height: u32,
    /// Whether the window was maximized when it was closed.
    pub maximized: bool,
}

/// The window's state as it stands, and whether it has changed since it was
/// last written.
#[derive(Clone, Default)]
pub struct Tracker {
    state: Arc<Mutex<Option<WindowState>>>,
    dirty: Arc<AtomicBool>,
}

impl Tracker {
    /// Note the window's current size.
    ///
    /// The size is only taken while the window is in its normal state: a
    /// maximized window is as big as the screen, and remembering that as its
    /// normal size would make the window come back enormous. The maximized
    /// flag itself is always recorded, so a window that was maximized comes
    /// back maximized.
    fn record(&self, window: &Window) {
        let Ok(maximized) = window.is_maximized() else {
            return;
        };
        let scale = window.scale_factor().unwrap_or(1.0);
        let size = window.inner_size().unwrap_or(PhysicalSize::new(0, 0));

        let mut slot = self.state.lock().unwrap();
        let mut state = slot.unwrap_or(WindowState {
            version: STATE_VERSION,
            width: 0,
            height: 0,
            maximized,
        });

        if !maximized {
            state.width = (f64::from(size.width) / scale).round() as u32;
            state.height = (f64::from(size.height) / scale).round() as u32;
        }
        state.maximized = maximized;
        state.version = STATE_VERSION;

        *slot = Some(state);
        self.dirty.store(true, Ordering::Relaxed);
    }

    /// The state, if it has changed since the last time it was taken.
    fn take_if_dirty(&self) -> Option<WindowState> {
        if !self.dirty.swap(false, Ordering::Relaxed) {
            return None;
        }
        *self.state.lock().unwrap()
    }

    /// Set the state without marking it as changed.
    ///
    /// Used for a state that was just read back off disk: it is already
    /// written, and writing it again would be a no-op that only costs a
    /// write.
    fn seed(&self, state: WindowState) {
        *self.state.lock().unwrap() = Some(state);
    }
}

/// The file the state lives in.
fn state_path(app: &AppHandle) -> Option<PathBuf> {
    appfile::data_path(app, FILE_NAME)
}

/// Read the remembered state, if there is any.
///
/// A file that is missing, unreadable, or not a state reads as no state at
/// all, and the window opens at its configured size — which is the same as
/// the first time the app is ever run. A corrupt file must not stop the app
/// from starting.
fn load(app: &AppHandle) -> Option<WindowState> {
    let path = state_path(app)?;
    let raw = fs::read_to_string(path).ok()?;
    let state: WindowState = serde_json::from_str(&raw).ok()?;
    if state.version != STATE_VERSION {
        return None;
    }
    Some(state)
}

/// Write the state out.
///
/// The write goes to a temporary file and is then moved into place, so a
/// crash halfway through leaves the previous state rather than half a file.
fn save(app: &AppHandle, state: &WindowState) {
    let Some(path) = state_path(app) else {
        return;
    };
    let Some(dir) = path.parent() else {
        return;
    };
    if fs::create_dir_all(dir).is_err() {
        return;
    }
    let Ok(json) = serde_json::to_string_pretty(state) else {
        return;
    };
    let temp = path.with_extension("json.tmp");
    if fs::write(&temp, json).is_err() {
        return;
    }
    let _ = fs::rename(&temp, &path);
}

/// The smallest size the window is allowed to be, from the app's own config.
///
/// A remembered size can be smaller than the floor — the floor was raised
/// after the size was remembered, or the file was written by another build —
/// and the window must not come back smaller than the app allows.
fn minimum_size(app: &AppHandle) -> (u32, u32) {
    app.config()
        .app
        .windows
        .first()
        .and_then(|window| match (window.min_width, window.min_height) {
            (Some(width), Some(height)) => Some((width as u32, height as u32)),
            _ => None,
        })
        .unwrap_or((0, 0))
}

/// The area a window can live in, in logical pixels.
///
/// The work area is the screen without the taskbar and any other permanent
/// furniture on it. A window bigger than this cannot be seen whole, so every
/// size the app asks for is capped at it: a size remembered on a large display
/// must not open half off a small one.
///
/// The work area is in the pixels of the monitor the window is on, and those
/// are not the same pixels on every monitor — a 4K display at 200% and a 1080p
/// one at 100% are the same size in logical pixels and four times the size in
/// physical ones. Dividing by the monitor's own scale factor is what makes the
/// two comparable.
fn work_area_size(window: &Window) -> Option<(f64, f64)> {
    let monitor = window.current_monitor().ok()??;
    let scale = monitor.scale_factor();
    let area = monitor.work_area().size;
    Some((
        f64::from(area.width) / scale,
        f64::from(area.height) / scale,
    ))
}

/// A size that fits on the screen the window is on.
///
/// The size is capped, never raised: a window is never made bigger than the
/// screen to fill it, only smaller when it would not fit.
fn fit_to_screen(window: &Window, width: u32, height: u32) -> (u32, u32) {
    let Some(max) = work_area_size(window) else {
        return (width, height);
    };
    cap_to_screen(width, height, max)
}

/// The same, with the screen's size given rather than measured.
///
/// Split out from [`fit_to_screen`] so that the rule can be tested without a
/// window to measure: the arithmetic is where the mistakes are.
fn cap_to_screen(width: u32, height: u32, max: (f64, f64)) -> (u32, u32) {
    (
        (f64::from(width).min(max.0)).max(0.0) as u32,
        (f64::from(height).min(max.1)).max(0.0) as u32,
    )
}

/// Put the window back the size it was.
fn restore(app: &AppHandle, window: &Window, state: &WindowState) {
    let (min_width, min_height) = minimum_size(app);
    let width = state.width.max(min_width);
    let height = state.height.max(min_height);
    // The size is remembered in logical pixels, so it means the same thing on
    // every display — but a size that was fine on a large one may not fit on
    // a small one, and a window that opens half off the screen is a window
    // the user has to drag back into view.
    let (width, height) = fit_to_screen(window, width, height);

    let _ = window.set_size(LogicalSize::new(width, height));
    if state.maximized {
        let _ = window.maximize();
    }
}

/// Restore the remembered window, and start remembering it again.
pub fn setup(app: &AppHandle, tracker: &Tracker) {
    let Some(webview) = app.get_webview_window("main") else {
        return;
    };
    // The window handle the geometry is read from and written to.
    let window = webview.as_ref().window();

    // The window is shown before it is sized, and that order matters. A window
    // that is still hidden has not settled its frame yet: the border it has
    // while hidden is not the border it has once it is on screen, and the
    // size a hidden window is given comes out with that difference still in
    // it — thirty-odd pixels too tall, every time. Shown first and sized
    // second, the window comes out at the size that was asked for. It is not
    // painted between the two, so it never appears at the wrong size.
    let _ = webview.show();

    match load(app) {
        Some(state) => {
            restore(app, &window, &state);
            tracker.seed(state);
        }
        // The first time the app is ever run there is nothing to restore, so
        // the window keeps the size it was configured with. That geometry is
        // recorded, which is what makes the *second* run open as large as the
        // first one left it.
        None => tracker.record(&window),
    }

    // Centred last, once the size is final. Centring a window whose size is
    // still settling leaves it off to one side: the centre is worked out from
    // the size the window has now, and a window that is a little taller than
    // it was measured as ends up hanging below the middle of the screen.
    let _ = window.center();
}

/// Write the window's current size out now.
///
/// Used when the app is about to quit. The periodic flush writes the state out
/// every so often, and the last change before the app left would otherwise be
/// lost — so the window would come back one resize behind where it left.
pub fn flush(app: &AppHandle) {
    let Some(tracker) = app.try_state::<Tracker>() else {
        return;
    };
    let Some(webview) = app.get_webview_window("main") else {
        return;
    };
    let window = webview.as_ref().window();
    tracker.record(&window);
    if let Some(state) = tracker.take_if_dirty() {
        save(app, &state);
    }
}

/// Watch the window and write its state out as it changes.
pub fn watch(app: &AppHandle, tracker: Tracker) {
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(FLUSH_INTERVAL);
        if let Some(state) = tracker.take_if_dirty() {
            save(&app, &state);
        }
    });
}

/// Note a window event, if it is one that moves or resizes the window.
pub fn on_event(tracker: &Tracker, window: &Window, event: &WindowEvent) {
    match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => tracker.record(window),
        // The last word: the app is closing, so write what the window is now
        // rather than waiting for the next flush.
        WindowEvent::CloseRequested { .. } => {
            tracker.record(window);
            if let Some(state) = tracker.take_if_dirty() {
                save(&app_handle(window), &state);
            }
        }
        _ => {}
    }
}

/// The app handle a window belongs to.
fn app_handle(window: &Window) -> AppHandle {
    window.app_handle().clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_size_that_fits_is_left_alone() {
        assert_eq!(cap_to_screen(1030, 579, (2560.0, 1540.0)), (1030, 579));
    }

    #[test]
    fn a_size_wider_than_the_screen_is_capped() {
        // A window remembered on a wide display, opened on a narrow one.
        assert_eq!(cap_to_screen(2400, 1400, (1280.0, 720.0)), (1280, 720));
    }

    #[test]
    fn each_dimension_is_capped_on_its_own() {
        // Tall and narrow: only the height is too big.
        assert_eq!(cap_to_screen(600, 1400, (1280.0, 720.0)), (600, 720));
        // Wide and short: only the width is too big.
        assert_eq!(cap_to_screen(2400, 579, (1280.0, 720.0)), (1280, 579));
    }

    #[test]
    fn a_screen_smaller_than_the_window_gives_its_own_size() {
        // Nothing can be bigger than the screen, so the screen is the answer.
        assert_eq!(cap_to_screen(1030, 579, (640.0, 480.0)), (640, 480));
    }
}
