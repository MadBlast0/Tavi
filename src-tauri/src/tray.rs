//! The app's place in the system tray.
//!
//! The tray is the app's second front door, and the place the app is *put
//! away* rather than closed. The window is the app's face; closing it hides
//! it, and the tray is where it is found again. The app stays running in the
//! meantime, which is the whole point of an icon in the corner of the screen.
//!
//! Two of the menu's entries do something to the app rather than to the
//! window, and they are why this module talks to the webview at all. A new
//! chat and a new session are both decisions the React side owns — which
//! composer is in force, and what is in it — and the native side cannot make
//! them. They travel across as events, which is the only channel between the
//! two sides.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{
    image::Image,
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Window, WindowEvent,
};

/// The event that asks the webview to start a new chat.
///
/// The name is written out in both languages and has to be kept in step by
/// hand: it has to match the constant the frontend listens for in
/// `src/blocks/shell/tray-bridge.tsx`, and there is no way to share one string
/// across the boundary.
pub const NEW_CHAT: &str = "tavi-new-chat";

/// The event that asks the webview to start a new session.
///
/// See [`NEW_CHAT`] for why the name is written out twice.
pub const NEW_SESSION: &str = "tavi-new-session";

/// What the tray has asked the app to do.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Intent {
    /// Start a new chat.
    NewChat,
    /// Start a new session.
    NewSession,
}

/// The request the tray is waiting for the app to take.
///
/// The event is the fast path, but it is only fast if the app is already
/// listening — and the app is not listening for the first moment after it
/// starts, which is exactly when someone who has just clicked the tray icon
/// is likely to click it again. So the request is kept here as well, and the
/// app takes it when it mounts, or when the window is next focused, if the
/// event did not arrive.
static PENDING: Mutex<Option<Intent>> = Mutex::new(None);

/// Take the request the tray is waiting for, if there is one.
///
/// Taking it clears it, so a request is acted on once. The app calls this when
/// it mounts and when the window is focused, which is what makes a request
/// that arrived before the app was listening not get lost.
#[tauri::command]
pub fn take_intent() -> Option<Intent> {
    PENDING.lock().unwrap().take()
}

/// The tray icon's own picture.
///
/// The same mark as the app's icon, at the size the notification area draws
/// it. It is a separate file because the app's icons are built for the taskbar
/// and the installer, where they are shown large.
const ICON: &[u8] = include_bytes!("../icons/32x32.png");

/// Put the app in the tray, with its menu.
///
/// The menu is the operating system's to show: it is attached to the icon, so a
/// right click brings it up. The left click is the one the menu does not use,
/// so it is free to mean "show the app".
pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show app", true, None::<&str>)?;
    let new_chat = MenuItem::with_id(app, "new-chat", "New chat", true, None::<&str>)?;
    let new_session = MenuItem::with_id(app, "new-session", "New session", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let exit = MenuItem::with_id(app, "exit", "Exit", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[&show, &new_chat, &new_session, &separator, &exit],
    )?;

    TrayIconBuilder::with_id("main")
        .icon(Image::from_bytes(ICON)?)
        .tooltip("Tavi")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(on_menu_event)
        .on_tray_icon_event(on_icon_event)
        .build(app)?;

    Ok(())
}

/// What the menu's entries do.
fn on_menu_event(app: &AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        "show" => show(app),
        "new-chat" => start(app, Intent::NewChat, NEW_CHAT),
        "new-session" => start(app, Intent::NewSession, NEW_SESSION),
        "exit" => exit(app),
        _ => {}
    }
}

/// A click on the tray icon itself.
///
/// The left button is the one the menu does not use, so it is free to mean
/// "show the app" — the same thing the menu's first entry does, and the thing
/// a click on an icon in the corner of the screen is expected to do.
fn on_icon_event(tray: &TrayIcon, event: TrayIconEvent) {
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
    } = event
    {
        show(tray.app_handle());
    }
}

/// Bring the window back.
///
/// Shown, un-minimised and focused. A window that is only shown is behind
/// whatever the user was doing, which is not what "show the app" means: the
/// app is being asked for, not merely unhidden.
fn show(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

/// Ask the webview to start something, with the window in front of it.
///
/// The window comes first, so the app is already there when the event lands
/// and the new chat or session is drawn in it. The request is kept as well as
/// sent, so that it survives the app not being ready to hear it yet.
fn start(app: &AppHandle, intent: Intent, event: &str) {
    *PENDING.lock().unwrap() = Some(intent);
    show(app);
    let _ = app.emit(event, ());
}

/// Quit the app.
///
/// The window's remembered size is written out first: the app is leaving, and
/// the size it is leaving at is the one it should come back at.
fn exit(app: &AppHandle) {
    crate::quit_app(app.clone());
}

/// What happens when the window is closed.
///
/// The window is hidden rather than destroyed. The app stays in the tray,
/// which is what the tray is for: closing the window is a way of putting the
/// app's face away, not a way of quitting it. The tray's Exit is how the app
/// quits.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if window.label() == "main" && let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
    }
}
