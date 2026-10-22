use tauri::AppHandle;

mod appfile;
mod files;
mod keys;
mod partials;
mod projects;
mod provider;
mod threads;
mod tray;
mod window_state;
mod workspace;

// --- System font discovery ----------------------------------------------------
//
// The Appearance settings offer a font picker listing what is actually installed
// on this machine, which is a question only the operating system can answer:
// Windows keeps a DirectWrite registry, macOS a Core Text one, Linux a
// Fontconfig database. font-kit fronts all three, so there is one call here
// rather than three platform modules.
//
// Enumeration is deliberately not a hardcoded list. The families installed on a
// given machine differ by OS version, by user account and by whatever font
// packages are present, so a list written into the binary would be a fiction
// that looks authoritative — and would name fonts that do not render.

// The brief notes that `Source` must be in scope for `all_families()`. In
// font-kit 0.14 it is an inherent method on `SystemSource`, and importing the
// trait is a warning rather than a requirement — so it is left out.
use font_kit::source::SystemSource;

/// Trim, drop blanks, dedupe case-insensitively, sort.
///
/// Kept separate from the backend call so it can be tested without a machine
/// that happens to have the developer's fonts on it — which is the only way a
/// test of this can be worth running on anyone else's machine.
///
/// The first spelling of a name wins, so the one the OS reports first is the
/// one shown; a backend that reports both "Arial" and "arial" gives one entry,
/// not two that differ only in case.
///
/// Ordering is by lowercase name, with the exact name as a tiebreak so that two
/// names differing only in case cannot swap places between runs.
fn normalize_families(names: Vec<String>) -> Vec<String> {
    let mut seen: Vec<String> = Vec::new();
    let mut folded: Vec<String> = Vec::new();

    for name in names {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            continue;
        }
        let key = trimmed.to_lowercase();
        if folded.iter().any(|existing| *existing == key) {
            continue;
        }
        folded.push(key);
        seen.push(trimmed.to_string());
    }

    seen.sort_by(|a, b| {
        a.to_lowercase()
            .cmp(&b.to_lowercase())
            .then_with(|| a.cmp(b))
    });
    seen
}

/// The font families installed for this user, alphabetically.
///
/// Returns an empty list rather than an error when the platform reports no
/// families: a machine with no fonts is a strange machine, not a broken one,
/// and the UI distinguishes "nothing found" from "discovery failed".
///
/// Enumeration scans a system database and can take a moment, so it runs on the
/// blocking pool rather than on the async runtime's own threads — an `async fn`
/// does not make synchronous work non-blocking.
#[tauri::command]
async fn list_installed_fonts() -> Result<Vec<String>, String> {
    let families = tauri::async_runtime::spawn_blocking(|| {
        let source = SystemSource::new();
        source
            .all_families()
            .map_err(|error| format!("System font discovery failed: {error}"))
    })
    .await
    .map_err(|e| format!("Font discovery did not finish: {e}"))??;

    Ok(normalize_families(families))
}

/// Quit the app.
///
/// The window's remembered size is written out first: the app is leaving, and
/// the size it is leaving at is the one it should come back at.
#[tauri::command]
fn quit_app(app: AppHandle) {
    window_state::flush(&app);
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // The window's remembered geometry. The tracker is shared between the
    // setup, which restores the window, and the event handler, which notices
    // it being moved or resized.
    let tracker = window_state::Tracker::default();
    let for_events = tracker.clone();
    let for_setup = tracker.clone();
    let for_watch = tracker.clone();
    // A third copy is put in the app's own state, so that the tray can reach
    // it: the tray's Exit has to write the window's size out before the app
    // leaves, and it is the tray that decides when the app leaves.
    let for_state = tracker.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(for_state)
        .manage(threads::Threads::default())
        .manage(provider::Cancellations::default())
        .manage(projects::Clones::default())
        .invoke_handler(tauri::generate_handler![
            keys::list_provider_keys,
            keys::save_provider_key,
            keys::replace_provider_key,
            keys::rename_provider_key,
            keys::activate_provider_key,
            keys::remove_provider_key,
            keys::check_provider_key,
            keys::recheck_provider_key,
            list_installed_fonts,
            provider::chat,
            provider::cancel_chat,
            provider::model_catalogue,
            projects::list_projects,
            projects::clone_repository,
            projects::cancel_clone,
            files::data_directory,
            files::write_file,
            files::read_file,
            threads::read_threads,
            threads::write_threads,
            threads::clear_threads,
            partials::append_partial,
            partials::read_partials,
            partials::clear_partial,
            partials::clear_partials,
            workspace::list_workspaces,
            workspace::grant_workspace,
            workspace::relink_workspace,
            workspace::revoke_workspace,
            workspace::list_workspace_entries,
            workspace::read_workspace_file,
            tray::take_intent,
            quit_app
        ])
        .setup(move |app| {
            window_state::setup(app.handle(), &for_setup);
            window_state::watch(app.handle(), for_watch);
            tray::setup(app.handle())?;
            Ok(())
        })
        .on_window_event(move |window, event| {
            window_state::on_event(&for_events, window, event);
            tray::on_window_event(window, event);
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{SystemSource, normalize_families};

    fn names(input: &[&str]) -> Vec<String> {
        normalize_families(input.iter().map(|s| s.to_string()).collect())
    }

    #[test]
    fn trims_surrounding_whitespace() {
        assert_eq!(names(&["  Inter  ", "\tRoboto\n"]), ["Inter", "Roboto"]);
    }

    #[test]
    fn discards_empty_and_whitespace_only() {
        assert_eq!(names(&["", "   ", "Inter", "\t\n"]), ["Inter"]);
    }

    #[test]
    fn dedupes_case_insensitively_keeping_the_first_spelling() {
        assert_eq!(names(&["arial", "Arial", "ARIAL"]), ["arial"]);
    }

    #[test]
    fn sorts_case_insensitively() {
        assert_eq!(
            names(&["roboto", "Inter", "arial", "Zapfino"]),
            ["arial", "Inter", "roboto", "Zapfino"]
        );
    }

    #[test]
    fn keeps_the_first_spelling_when_names_differ_only_in_case() {
        // Dedupe runs before sort, so whichever spelling the backend reported
        // first is the one shown. The point is that the pair collapses to one
        // entry rather than appearing twice in different cases.
        assert_eq!(names(&["Inter", "inter"]), ["Inter"]);
        assert_eq!(names(&["inter", "Inter"]), ["inter"]);
    }

    #[test]
    fn ordering_is_stable_across_runs() {
        // The same input must come out in the same order every time.
        let input = ["Zapfino", "arial", "Inter", "noto sans", "Arial"];
        assert_eq!(names(&input), names(&input));
        assert_eq!(names(&input), ["arial", "Inter", "noto sans", "Zapfino"]);
    }

    #[test]
    fn keeps_spaces_punctuation_and_unicode() {
        // A name is not split on its spaces or commas: both are legitimate.
        // Ordering is by lowercased name, so fullwidth Latin sorts after ASCII
        // rather than where its narrow counterpart would.
        assert_eq!(
            names(&["Noto Sans, Devanagari", "Gill Sans", "ＭＳ ゴシック"]),
            ["Gill Sans", "Noto Sans, Devanagari", "ＭＳ ゴシック"]
        );
    }

    #[test]
    fn empty_backend_result_is_not_an_error() {
        assert!(names(&[]).is_empty());
    }

    /// Exercises the real backend once, so a broken native path is caught here
    /// rather than by whoever opens the settings card next.
    ///
    /// Deliberately asserts nothing about *which* fonts exist. This machine's
    /// catalogue is not any other machine's, and a test that pinned a name
    /// would pass on one developer and fail on the next. What is worth
    /// asserting is that the backend answers at all, and that whatever it
    /// answered survives normalisation: sorted, and with no case-insensitive
    /// duplicates. Both hold on a machine with no fonts installed too.
    #[test]
    fn discovery_answers_and_its_result_is_normalised() {
        let raw: Vec<String> = SystemSource::new()
            .all_families()
            .expect("the system font source should answer on a desktop target");

        let families = normalize_families(raw);

        for pair in families.windows(2) {
            assert!(
                pair[0].to_lowercase() <= pair[1].to_lowercase(),
                "not sorted: {:?} before {:?}",
                pair[0],
                pair[1]
            );
        }

        let lowered: Vec<String> = families.iter().map(|f| f.to_lowercase()).collect();
        let mut unique = lowered.clone();
        unique.sort();
        unique.dedup();
        assert_eq!(unique.len(), lowered.len(), "case-insensitive duplicates survived");

        for family in &families {
            assert_eq!(family.trim(), family, "family name has surrounding whitespace");
            assert!(!family.is_empty());
        }
    }
}