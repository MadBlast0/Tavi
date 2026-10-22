//! A real terminal, for a program that will not do anything without one.
//!
//! Most of the CLIs the app knows about have a documented way of being run
//! without a terminal, and that is what the app uses: the program is started
//! as an ordinary child process and its output is read as events. That is
//! the right shape for an agent, and it gives the app a conversation rather
//! than a screen of escape sequences.
//!
//! A few programs insist on a terminal — they check whether standard output
//! is one, they draw a full-screen interface, or they want a person to type
//! at them. For those there is this: a real pseudo-terminal, the same one an
//! editor integration uses, so the program behaves the way it behaves in a
//! terminal.
//!
//! What comes out of a terminal is the terminal's own output, escape
//! sequences and all. It is meant to be drawn, not read, and the app does
//! not try to make sense of it. A surface that shows it is a terminal
//! surface.

use std::collections::BTreeMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;

/// The size a terminal starts at.
///
/// The program draws for the size it is told about, so this is what it draws
/// for until a surface resizes it.
const DEFAULT_ROWS: u16 = 24;
const DEFAULT_COLS: u16 = 80;

/// How often the program is asked whether it has finished.
const POLL: Duration = Duration::from_millis(50);

/// What the terminal says.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TerminalEvent {
    /// A piece of what the program drew.
    #[serde(rename = "output")]
    Output { data: String },
    /// The program has finished.
    #[serde(rename = "exit")]
    Exit { code: Option<i32> },
}

/// A program running in a terminal.
struct Session {
    /// The end the app writes to, so the program can be typed at.
    writer: Box<dyn Write + Send>,
    /// The program, so it can be waited for and stopped.
    child: Box<dyn Child + Send + Sync>,
    /// The terminal, so it can be resized.
    master: Box<dyn MasterPty + Send>,
}

/// The terminals that are running.
///
/// The handles are here and not on disk: a process handle is runtime state,
/// and it cannot be restored from a file after the app has been closed.
#[derive(Clone, Default)]
pub struct Terminals {
    sessions: Arc<Mutex<BTreeMap<String, Session>>>,
}

impl Terminals {
    /// A new id for a terminal.
    ///
    /// It is an id and not a name, so that two terminals running the same
    /// program are two terminals.
    fn next_id() -> String {
        format!(
            "t-{:016x}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|since| since.as_nanos() as u64)
                .unwrap_or(0)
        )
    }

    /// Starts a program in a real terminal.
    ///
    /// The program is named by its path, and its arguments are an array:
    /// nothing that a person typed is ever part of a command line that a
    /// shell reads.
    ///
    /// The output is handed back rather than read here, so that the reading
    /// can be done by whoever asked for the terminal.
    fn start(
        &self,
        program: &str,
        args: &[String],
        working_dir: Option<&str>,
    ) -> Result<(String, Box<dyn Read + Send>), String> {
        let size = PtySize {
            rows: DEFAULT_ROWS,
            cols: DEFAULT_COLS,
            pixel_width: 0,
            pixel_height: 0,
        };

        let pair = native_pty_system()
            .openpty(size)
            .map_err(|e| format!("The terminal could not be opened: {e}"))?;

        let mut command = CommandBuilder::new(program);
        for argument in args {
            command.arg(argument);
        }
        if let Some(folder) = working_dir.map(str::trim).filter(|f| !f.is_empty()) {
            command.cwd(folder);
        }

        let child = pair
            .slave
            .spawn_command(command)
            .map_err(|e| format!("The program could not be started: {e}"))?;
        /* The slave is let go of here. The program holds the other end, and
           the master is the app's. */
        drop(pair.slave);

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("The terminal could not be read: {e}"))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("The terminal could not be written to: {e}"))?;

        let id = Terminals::next_id();
        let mut guard = self
            .sessions
            .lock()
            .map_err(|_| "The terminals are unavailable.")?;
        guard.insert(
            id.clone(),
            Session {
                writer,
                child,
                master: pair.master,
            },
        );
        Ok((id, reader))
    }

    /// Watches a program and says how it finished.
    ///
    /// The exit code is the program's own, and the program is waited for
    /// properly, so it does not stay behind as a process nobody is looking
    /// after. A terminal that is stopped first is not reported at all: the
    /// person who stopped it knows.
    fn watch<F>(&self, id: String, on_exit: F)
    where
        F: Fn(Option<i32>) + Send + 'static,
    {
        let sessions = self.sessions.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(POLL);
            let Ok(mut sessions) = sessions.lock() else {
                return;
            };
            let Some(session) = sessions.get_mut(&id) else {
                /* The terminal was stopped, and somebody else said so. */
                return;
            };
            match session.child.try_wait() {
                Ok(Some(status)) => {
                    let code = Some(status.exit_code() as i32);
                    sessions.remove(&id);
                    on_exit(code);
                    return;
                }
                Ok(None) => {}
                Err(_) => {
                    sessions.remove(&id);
                    on_exit(None);
                    return;
                }
            }
        });
    }

    /// Writes to a terminal, as if the person had typed it.
    fn write(&self, id: &str, data: &str) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "The terminals are unavailable.")?;
        let session = sessions
            .get_mut(id)
            .ok_or("That terminal is not running.")?;
        session
            .writer
            .write_all(data.as_bytes())
            .and_then(|_| session.writer.flush())
            .map_err(|e| format!("The terminal could not be written to: {e}"))
    }

    /// Tells a terminal it is a different size.
    ///
    /// The program is told, so it redraws for the size it now has rather
    /// than for the one it had.
    fn resize(&self, id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "The terminals are unavailable.")?;
        let session = sessions.get(id).ok_or("That terminal is not running.")?;
        session
            .master
            .resize(PtySize {
                rows: rows.max(1),
                cols: cols.max(1),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("The terminal could not be resized: {e}"))
    }

    /// Stops a terminal and lets go of it.
    ///
    /// The program is killed and waited for, so that stopping a terminal
    /// leaves no process behind, and the terminal is forgotten, so that
    /// stopping one is the same as it never having been there.
    fn stop(&self, id: &str) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "The terminals are unavailable.")?;
        let Some(mut session) = sessions.remove(id) else {
            return Ok(());
        };
        let _ = session.child.kill();
        let _ = session.child.wait();
        Ok(())
    }
}

/// Starts a program in a real terminal.
///
/// It hands back the terminal's id, and the output comes back over the
/// channel as the program draws it.
#[tauri::command]
pub async fn start_cli_terminal(
    terminals: State<'_, Terminals>,
    program: String,
    args: Vec<String>,
    working_dir: Option<String>,
    on_event: Channel<TerminalEvent>,
) -> Result<String, String> {
    let (id, mut reader) = terminals.start(&program, &args, working_dir.as_deref())?;

    /* The output is read on its own thread, so a program that is waiting for
       something to be typed at it does not stop the app from noticing that
       it has finished. */
    let output_channel = on_event.clone();
    std::thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(count) => {
                    let data = String::from_utf8_lossy(&buffer[..count]).to_string();
                    if output_channel.send(TerminalEvent::Output { data }).is_err() {
                        break;
                    }
                }
            }
        }
    });

    let exit_channel = on_event.clone();
    terminals.watch(id.clone(), move |code| {
        let _ = exit_channel.send(TerminalEvent::Exit { code });
    });

    Ok(id)
}

/// Writes to a terminal, as if the person had typed it.
#[tauri::command]
pub async fn write_cli_terminal(
    terminals: State<'_, Terminals>,
    id: String,
    data: String,
) -> Result<(), String> {
    terminals.write(&id, &data)
}

/// Tells a terminal it is a different size, so the program redraws.
#[tauri::command]
pub async fn resize_cli_terminal(
    terminals: State<'_, Terminals>,
    id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    terminals.resize(&id, rows, cols)
}

/// Stops a terminal and lets go of it.
#[tauri::command]
pub async fn stop_cli_terminal(
    terminals: State<'_, Terminals>,
    id: String,
) -> Result<(), String> {
    terminals.stop(&id)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A program that prints something and stops.
    ///
    /// Which one depends on the system, because the program has to be there
    /// without anything being installed for it.
    fn echo_program() -> (&'static str, Vec<String>) {
        if cfg!(windows) {
            (
                "cmd.exe",
                vec!["/c".to_string(), "echo".to_string(), "hello".to_string()],
            )
        } else {
            ("sh", vec!["-c".to_string(), "echo hello".to_string()])
        }
    }

    /// A program that reads what is typed at it and says it back.
    fn cat_program() -> (&'static str, Vec<String>) {
        if cfg!(windows) {
            (
                "cmd.exe",
                vec!["/c".to_string(), "findstr".to_string(), ".".to_string()],
            )
        } else {
            ("sh", vec!["-c".to_string(), "cat".to_string()])
        }
    }

    /// Reads what the terminal has to say, for a while.
    ///
    /// A terminal's other end does not say "no more" the way a pipe does, so
    /// a read that waits for the end waits for ever. The read is given a
    /// deadline instead, and what it has by then is what is read.
    fn read_for(reader: Box<dyn Read + Send>, wanted: &str, millis: u64) -> String {
        let wanted = wanted.to_string();
        let (sender, receiver) = std::sync::mpsc::channel::<String>();
        std::thread::spawn(move || {
            let mut reader = reader;
            let mut text = String::new();
            let mut buffer = [0u8; 4096];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) | Err(_) => break,
                    Ok(count) => {
                        text.push_str(&String::from_utf8_lossy(&buffer[..count]));
                        if sender.send(text.clone()).is_err() {
                            break;
                        }
                    }
                }
            }
        });

        let deadline = std::time::Instant::now() + Duration::from_millis(millis);
        let mut said = String::new();
        while std::time::Instant::now() < deadline {
            match receiver.recv_timeout(Duration::from_millis(100)) {
                Ok(text) => said = text,
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                Err(_) => break,
            }
            if said.contains(&wanted) {
                break;
            }
        }
        said
    }

    #[test]
    fn a_program_in_a_terminal_is_a_terminal() {
        let terminals = Terminals::default();
        let (program, args) = echo_program();
        let (id, reader) = terminals
            .start(program, &args, None)
            .expect("the program should start");

        let said = read_for(reader, "hello", 10_000);
        assert!(
            said.contains("hello"),
            "the program should have said hello, and said {said:?}"
        );

        /* A terminal turns a newline into a carriage return and a newline.
           A pipe does not. That difference is the proof that the program had
           a terminal and not a pipe. */
        assert!(
            said.contains("\r\n"),
            "the program should have had a terminal, and said {said:?}"
        );

        let _ = terminals.stop(&id);
    }

    #[test]
    fn a_program_can_be_typed_at() {
        let terminals = Terminals::default();
        let (program, args) = cat_program();
        let (id, reader) = terminals
            .start(program, &args, None)
            .expect("the program should start");

        terminals
            .write(&id, "hello\n")
            .expect("the terminal should be writable");

        let said = read_for(reader, "hello", 10_000);
        assert!(
            said.contains("hello"),
            "the program should have read what was typed, and said {said:?}"
        );

        let _ = terminals.stop(&id);
    }

    #[test]
    fn a_terminal_that_is_not_running_is_refused() {
        let terminals = Terminals::default();
        assert!(terminals.write("t-nothing", "x").is_err());
        assert!(terminals.resize("t-nothing", 24, 80).is_err());
        /* Stopping one that is not there is not a failure: it is already
           stopped. */
        assert!(terminals.stop("t-nothing").is_ok());
    }

    #[test]
    fn a_terminal_can_be_resized() {
        let terminals = Terminals::default();
        let (program, args) = echo_program();
        let (id, _reader) = terminals
            .start(program, &args, None)
            .expect("the program should start");
        terminals
            .resize(&id, 40, 120)
            .expect("the terminal should be resizable");
        let _ = terminals.stop(&id);
    }
}
