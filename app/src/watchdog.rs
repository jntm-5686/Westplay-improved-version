//! The companion window's watchdog: the page calls `companion_heartbeat` every second, and a thread here
//! notices when it stops answering (WebView2's renderer process crashed, leaving its error page: "This page is
//! having a problem", `STATUS_BREAKPOINT`). The page is loaded again; if that doesn't bring it back, its window
//! is made again; and once it has failed twice within ten minutes, WestPlay writes a marker and starts itself
//! again with software rendering, so WebView2 can draw without the graphics card.
//!
//! The marker is read in `main` before any window exists: [`software_rendering_requested`], then
//! [`apply_software_rendering_env`], which adds `--disable-gpu --disable-gpu-compositing` to WebView2's browser
//! arguments, keeping any the player (or a support note) already set. It is WestPlay-wide: the cabin page and the
//! players' WebViews get the same arguments, which is slower but still draws.
//!
//! What can't be known from here is WebView2's own crash code for the companion window: Tauri's WebView2 wrapper
//! doesn't report a renderer's failed process. The watchdog's verdict (how long the page was silent, and when)
//! stands in for it, and is what [`CompanionDiagnostics`] says.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use westplay_host::log;

/// How long the page may be silent before the watchdog calls it gone.
pub const BEAT_TIMEOUT: Duration = Duration::from_secs(5);
/// A window that has just been made gets this long to load its page and start beating. A page that has never
/// beaten is given this plus [`BEAT_TIMEOUT`], so a slow first load isn't a crash.
pub const STARTUP_GRACE: Duration = Duration::from_secs(15);
/// Crashes within this window count towards the software-rendering fallback.
pub const CRASH_WINDOW: Duration = Duration::from_secs(10 * 60);

/// The watchdog looks this often (the page beats every second).
const CHECK_EVERY: Duration = Duration::from_secs(1);
/// How long a reload is given to bring the page back before its window is made again.
const RELOAD_WAIT: Duration = Duration::from_secs(8);
/// How long a window made again is given before WestPlay restarts itself.
const REBUILD_WAIT: Duration = Duration::from_secs(8);
/// A window made again shows after this long even if its page never says it's ready (as the first window does).
const SHOW_AFTER: Duration = Duration::from_secs(8);
/// The Tauri window the watchdog watches, and rebuilds.
const MAIN_WINDOW: &str = "main";
/// Told to the WestPlay this watchdog starts: wait for the one it replaces to let go of its instance.
pub const RESTART_ARGUMENT: &str = "--westplay-restarted-by-watchdog";
/// WestPlay's own data folder is `%LOCALAPPDATA%\app.westplay` (the host's log fallback says the same). The older
/// `%LOCALAPPDATA%\WestPlay` is read too, so a support note's marker works.
const MARKER_FILE: &str = "software-rendering";
const SOFTWARE_ARGUMENTS: [&str; 2] = ["--disable-gpu", "--disable-gpu-compositing"];
/// The arguments the host's hidden WebViews and Tauri's own page need, which the process-wide environment
/// variable would otherwise replace (current WebView2 runtimes let it override each environment's own
/// `AdditionalBrowserArguments`): without them the cabin page and the players' pages are throttled or refuse to
/// play, and Tauri's own WebView gets WebView2's context menus.
const WESTPLAY_ARGUMENTS: [&str; 4] = [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--autoplay-policy=no-user-gesture-required",
];
const WESTPLAY_FEATURES: [&str; 4] =
    ["CalculateNativeWinOcclusion", "msWebOOUI", "msPdfOOUI", "msSmartScreenProtection"];
const BROWSER_ARGUMENTS_VAR: &str = "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS";

/// The companion window's health, for the About page's diagnostics. Seconds ago are calculated as the command
/// answers, so the page can keep the answer while showing it.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionDiagnostics {
    /// Whether this run was started with software rendering (the marker was there in `main`).
    pub software_rendering: bool,
    /// Whether the next start will draw without the GPU (the marker is there now).
    pub software_rendering_next_run: bool,
    /// The marker that turned (or will turn) software rendering on, where it is.
    pub software_rendering_marker: Option<String>,
    /// The WebView2 version, as the host's status last said it.
    pub webview_version: Option<String>,
    /// How many times the watchdog found the page gone since WestPlay started.
    pub crashes: u64,
    /// How many of those were within [`CRASH_WINDOW`].
    pub crashes_in_window: u64,
    /// How long ago the last one was found, and why.
    pub last_crash_seconds_ago: Option<u64>,
    pub last_crash_reason: Option<String>,
    /// What the watchdog did last (loaded the page again, made its window again, restarted WestPlay).
    pub last_action: Option<String>,
    /// How many reloads/rebuilds, and how many restarts with software rendering, have happened.
    pub recoveries: u64,
    pub restarts: u64,
    /// How long since the page last beat (`None`: it never has).
    pub heartbeat_seconds_ago: Option<u64>,
    /// Whether the background thread is running.
    pub watchdog_running: bool,
}

/// The companion's watchdog, kept as Tauri state: the `companion_heartbeat` command beats it, the background
/// thread checks it, and the diagnostics read it. Cloning is cheap (one `Arc`).
#[derive(Clone)]
pub struct Watchdog(Arc<Inner>);

struct Inner {
    /// When the watchdog started, with the companion window made: the startup grace counts from here.
    created: Mutex<Instant>,
    state: Mutex<State>,
    started: AtomicBool,
    /// Its window is being made again: the app must not exit while the last one is gone (Tauri's last window
    /// closing asks to exit).
    holding_window_open: AtomicBool,
}

struct State {
    /// The last heartbeat; `None` until the page's first one.
    last_heartbeat: Option<Instant>,
    /// When the watchdog found the page gone (only those within [`CRASH_WINDOW`] are kept).
    crashes: Vec<Instant>,
    total_crashes: u64,
    last_crash: Option<Instant>,
    last_crash_reason: Option<String>,
    last_action: Option<String>,
    recoveries: u64,
    restarts: u64,
    /// A recovery under way: give the page until `until`, then take the next step. `rebuilt` says its window has
    /// already been made again.
    recovery: Option<Recovery>,
    webview_version: Option<String>,
    software_rendering: bool,
    marker: Option<PathBuf>,
}

#[derive(Clone, Copy)]
struct Recovery {
    until: Instant,
    rebuilt: bool,
}

/// What the watchdog decided to do about a page that has stopped answering.
enum Step {
    Reload,
    Rebuild,
    Restart,
}

impl Watchdog {
    /// `software_rendering`: whether this run read the marker in `main`; `marker`: where it was (or would be).
    pub fn new(software_rendering: bool, marker: Option<PathBuf>) -> Self {
        Self(Arc::new(Inner {
            created: Mutex::new(Instant::now()),
            state: Mutex::new(State {
                last_heartbeat: None,
                crashes: Vec::new(),
                total_crashes: 0,
                last_crash: None,
                last_crash_reason: None,
                last_action: None,
                recoveries: 0,
                restarts: 0,
                recovery: None,
                webview_version: None,
                software_rendering,
                marker,
            }),
            started: AtomicBool::new(false),
            holding_window_open: AtomicBool::new(false),
        }))
    }

    /// Whether the companion window is being made again, so closing the old one must not end WestPlay.
    pub fn holds_window_open(&self) -> bool {
        self.0.holding_window_open.load(Ordering::Relaxed)
    }

    /// The page is alive: the `companion_heartbeat` command calls this.
    pub fn beat(&self) {
        let mut state = self.lock();
        state.last_heartbeat = Some(Instant::now());
    }

    /// The host says which WebView2 it runs on (its status, about once a second): kept for the diagnostics.
    pub fn note_webview_version(&self, version: &str) {
        let version = version.trim();
        if version.is_empty() {
            return;
        }
        let mut state = self.lock();
        if state.webview_version.as_deref() != Some(version) {
            state.webview_version = Some(version.to_owned());
        }
    }

    /// Starts the background check (once). `app` is how it loads the page again, makes its window again, or
    /// starts WestPlay again.
    pub fn start(&self, app: AppHandle) {
        if self.0.started.swap(true, Ordering::SeqCst) {
            return;
        }
        // The window has just been made (this runs in Tauri's setup): the grace counts from now, not from
        // before `Builder::build`.
        *self.0.created.lock().unwrap_or_else(|error| error.into_inner()) = Instant::now();
        let watchdog = self.clone();
        let started = std::thread::Builder::new()
            .name("westplay-companion-watchdog".into())
            .spawn(move || {
                loop {
                    std::thread::sleep(CHECK_EVERY);
                    watchdog.poll(&app);
                }
            });
        match started {
            Ok(_) => log!(
                "[companion] watchdog started: a heartbeat every second; 5 s without one and its page is loaded \
                 again"
            ),
            Err(error) => {
                self.0.started.store(false, Ordering::SeqCst);
                log!("[companion] the watchdog couldn't start: {error}");
            }
        }
    }

    /// One check: is the page still beating? If not, take the next recovery step.
    fn poll(&self, app: &AppHandle) {
        // A minimised window's timers are throttled by WebView2, so its silence means nothing: keep its last beat
        // current and look again when it's back on screen (a crash then is noticed normally). The window hidden
        // while it first loads, or while it's made again, is not skipped: its startup grace covers the first,
        // and the rebuild's wait must still expire if its page never comes back.
        if page_is_minimized(app) {
            self.beat();
            return;
        }
        let now = Instant::now();
        let created = *self.0.created.lock().unwrap_or_else(|error| error.into_inner());
        let (step, reason, crashes_in_window) = {
            let mut state = self.lock();
            if !heartbeat_overdue(now, created, state.last_heartbeat, STARTUP_GRACE, BEAT_TIMEOUT) {
                if state.recovery.take().is_some() {
                    log!("[companion] its page is answering again");
                }
                return;
            }
            match state.recovery {
                // The reload/rebuild is still being given its chance.
                Some(recovery) if now < recovery.until => return,
                // Its window was made again and the page still hasn't come back: WestPlay itself starts again,
                // even if this was the first crash, because neither first-level recovery worked.
                Some(recovery) if recovery.rebuilt => {
                    let reason = "its page didn't come back after its window was made again".to_owned();
                    state.recovery = None;
                    state.last_crash_reason = Some(reason.clone());
                    (Step::Restart, reason, crashes_within(&state.crashes, now, CRASH_WINDOW))
                }
                // A reload was given its time and didn't bring it back: make its window again.
                Some(_) => {
                    let reason = "its page still isn't answering after being loaded again".to_owned();
                    state.recovery = None;
                    state.last_crash_reason = Some(reason.clone());
                    (Step::Rebuild, reason, crashes_within(&state.crashes, now, CRASH_WINDOW))
                }
                // A fresh outage: the page was answering (or still in its grace) and now isn't.
                None => {
                    let reason = outage_reason(&state, now);
                    state.crashes.retain(|at| now.saturating_duration_since(*at) < CRASH_WINDOW);
                    state.crashes.push(now);
                    state.total_crashes += 1;
                    state.last_crash = Some(now);
                    state.last_crash_reason = Some(reason.clone());
                    let within = crashes_within(&state.crashes, now, CRASH_WINDOW);
                    let step = if calls_for_software_rendering(&state.crashes, now) {
                        Step::Restart
                    } else {
                        Step::Reload
                    };
                    (step, reason, within)
                }
            }
        };

        match step {
            Step::Reload => {
                log!("[companion] its page stopped answering ({reason}): loading it again");
                match reload_main_window(app) {
                    Ok(()) => {
                        let mut state = self.lock();
                        state.recovery = Some(Recovery { until: now + RELOAD_WAIT, rebuilt: false });
                        state.recoveries += 1;
                        state.last_action = Some("loaded its page again".into());
                    }
                    Err(error) => {
                        log!("[companion] its page couldn't be loaded again ({error}): making its window again");
                        self.rebuild_main_window(app);
                        let mut state = self.lock();
                        state.recovery = Some(Recovery { until: now + REBUILD_WAIT, rebuilt: true });
                        state.recoveries += 1;
                        state.last_action = Some("made its window again".into());
                    }
                }
            }
            Step::Rebuild => {
                log!("[companion] its page still isn't answering: making its window again");
                self.rebuild_main_window(app);
                let mut state = self.lock();
                state.recovery = Some(Recovery { until: now + REBUILD_WAIT, rebuilt: true });
                state.recoveries += 1;
                state.last_action = Some("made its window again".into());
            }
            Step::Restart => {
                if crashes_in_window >= 2 {
                    log!(
                        "[companion] its page stopped {crashes_in_window} times in 10 minutes: restarting \
                         WestPlay with software rendering"
                    );
                } else {
                    log!(
                        "[companion] its page didn't come back ({reason}): restarting WestPlay with software \
                         rendering"
                    );
                }
                if !self.restart_with_software(app) {
                    // Starting WestPlay again failed: try again after a pause rather than leaving a dead page.
                    let mut state = self.lock();
                    state.recovery = Some(Recovery { until: Instant::now() + REBUILD_WAIT, rebuilt: true });
                }
            }
        }
    }

    /// Writes the software-rendering marker and starts this executable again, then ends this process. The new
    /// process waits for this one's instance (its [`RESTART_ARGUMENT`]), so the two don't overlap. Returns
    /// `false` if WestPlay couldn't be started.
    fn restart_with_software(&self, app: &AppHandle) -> bool {
        let preferred = self.lock().marker.clone();
        match request_software_rendering(preferred.as_deref()) {
            Ok(path) => log!("[companion] software rendering requested (marker: {})", path.display()),
            Err(error) => log!("[companion] {error}"),
        }
        let exe = match std::env::current_exe() {
            Ok(exe) => exe,
            Err(error) => {
                log!("[companion] couldn't find WestPlay's own executable to start it again: {error}");
                self.failed_restart();
                return false;
            }
        };
        log!("[companion] starting WestPlay again with software rendering: {}", exe.display());
        match std::process::Command::new(&exe).arg(RESTART_ARGUMENT).spawn() {
            Ok(child) => {
                log!(
                    "[companion] WestPlay started again (pid {}); this process is leaving so the new one can \
                     draw without the GPU",
                    child.id()
                );
                {
                    let mut state = self.lock();
                    state.restarts += 1;
                    state.last_action = Some("restarted WestPlay with software rendering".into());
                }
                // The cabin's browser goes with this process too; let it shut down cleanly before Windows
                // starts the new one's WebView2 on the same profile.
                crate::stop_host(app);
                std::process::exit(0);
            }
            Err(error) => {
                log!("[companion] couldn't start WestPlay again: {error}");
                self.failed_restart();
                false
            }
        }
    }

    fn failed_restart(&self) {
        let mut state = self.lock();
        state.last_action = Some("couldn't start WestPlay again".into());
    }

    /// The companion's diagnostics, as the About page shows them.
    pub fn diagnostics(&self) -> CompanionDiagnostics {
        let now = Instant::now();
        let state = self.lock();
        let marker = software_rendering_marker();
        CompanionDiagnostics {
            software_rendering: state.software_rendering,
            software_rendering_next_run: marker.is_some(),
            software_rendering_marker: marker.map(|path| path.display().to_string()),
            webview_version: state.webview_version.clone(),
            crashes: state.total_crashes,
            crashes_in_window: crashes_within(&state.crashes, now, CRASH_WINDOW) as u64,
            last_crash_seconds_ago: state.last_crash.map(|at| now.saturating_duration_since(at).as_secs()),
            last_crash_reason: state.last_crash_reason.clone(),
            last_action: state.last_action.clone(),
            recoveries: state.recoveries,
            restarts: state.restarts,
            heartbeat_seconds_ago: state.last_heartbeat.map(|at| now.saturating_duration_since(at).as_secs()),
            watchdog_running: self.0.started.load(Ordering::Relaxed),
        }
    }

    /// Makes the companion window again: closes the old one (its WebView2 is gone), then builds a new one on the
    /// same label, so its capabilities and commands are the same. Tauri's builder must not run on the event loop
    /// thread, so this is done on a thread of its own, with a pause and retries while the old window's label is
    /// let go. While the old window is gone the app is kept alive (see [`Watchdog::holds_window_open`]).
    fn rebuild_main_window(&self, app: &AppHandle) {
        let app = app.clone();
        let watchdog = self.clone();
        self.0.holding_window_open.store(true, Ordering::SeqCst);
        let thread = std::thread::Builder::new().name("westplay-companion-window".into()).spawn(move || {
            if let Some(window) = app.get_webview_window(MAIN_WINDOW)
                && let Err(error) = window.destroy()
            {
                log!("[companion] its window couldn't be closed to be made again: {error}");
            }
            for attempt in 0..8 {
                // Let the event loop put the old window away before asking for the same label.
                std::thread::sleep(Duration::from_millis(250 + attempt as u64 * 350));
                match build_main_window(&app) {
                    Ok(()) => {
                        watchdog.0.holding_window_open.store(false, Ordering::SeqCst);
                        log!("[companion] its window is made again: waiting for its page");
                        return;
                    }
                    Err(error) => {
                        if attempt == 7 {
                            log!("[companion] its window couldn't be made again: {error}");
                        }
                    }
                }
            }
            // It couldn't be made again: its page can't come back, so the watchdog restarts WestPlay with
            // software rendering after its wait. The app stays up (no window) until then.
        });
        if let Err(error) = thread {
            self.0.holding_window_open.store(false, Ordering::SeqCst);
            log!("[companion] couldn't start making its window again: {error}");
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, State> {
        self.0.state.lock().unwrap_or_else(|error| error.into_inner())
    }
}

/// The page's `companion_heartbeat`: it is alive.
#[tauri::command]
pub fn companion_heartbeat(watchdog: tauri::State<'_, Watchdog>) {
    watchdog.beat();
}

/// The companion's diagnostics (the About page's rows): software rendering, WebView2, and the watchdog's crashes.
#[tauri::command]
pub fn companion_diagnostics(watchdog: tauri::State<'_, Watchdog>) -> CompanionDiagnostics {
    watchdog.diagnostics()
}

/// Turns software rendering on or off for the next start (the About page's switch). The marker is what `main`
/// reads before any window exists, so this run's drawing doesn't change: the page says to restart WestPlay.
#[tauri::command]
pub fn companion_set_software_rendering(
    enabled: bool,
    watchdog: tauri::State<'_, Watchdog>,
) -> Result<CompanionDiagnostics, String> {
    set_software_rendering(enabled)?;
    Ok(watchdog.diagnostics())
}

/// The "reset to hardware rendering" button: removes the software-rendering marker (the next start draws with
/// the GPU again).
#[tauri::command]
pub fn companion_reset_gpu(watchdog: tauri::State<'_, Watchdog>) -> Result<CompanionDiagnostics, String> {
    set_software_rendering(false)?;
    Ok(watchdog.diagnostics())
}

/// When the page is overdue: a `Some` last heartbeat older than `timeout` after the grace, or no heartbeat at
/// all for grace plus timeout. A page that has never beaten is not called gone before both have passed.
fn heartbeat_overdue(
    now: Instant,
    created: Instant,
    last_heartbeat: Option<Instant>,
    grace: Duration,
    timeout: Duration,
) -> bool {
    let since_created = now.saturating_duration_since(created);
    if since_created < grace {
        return false;
    }
    match last_heartbeat {
        Some(last) => now.saturating_duration_since(last) > timeout,
        None => since_created >= grace + timeout,
    }
}

/// How many of `crashes` are within `window` of `now`.
fn crashes_within(crashes: &[Instant], now: Instant, window: Duration) -> usize {
    crashes.iter().filter(|&&at| now.saturating_duration_since(at) < window).count()
}

/// Two crashes within [`CRASH_WINDOW`]: software rendering, rather than loading the page again.
fn calls_for_software_rendering(crashes: &[Instant], now: Instant) -> bool {
    crashes_within(crashes, now, CRASH_WINDOW) >= 2
}

/// Why the watchdog called the page gone, in words for the log and the diagnostics.
fn outage_reason(state: &State, now: Instant) -> String {
    match state.last_heartbeat {
        Some(last) => format!("no heartbeat for {:.0} s", now.saturating_duration_since(last).as_secs_f64()),
        None => "no heartbeat since its window was made".to_owned(),
    }
}

/// Whether the companion window is minimised (no window at all is not "minimised": then the page can't beat, and
/// the watchdog's recovery should go on).
fn page_is_minimized(app: &AppHandle) -> bool {
    app.get_webview_window(MAIN_WINDOW).is_some_and(|window| window.is_minimized().unwrap_or(false))
}

/// Loads the companion window's page again. Tauri 2's `WebviewWindow::reload` is WebView2's own reload, which
/// starts a new renderer when the old one died.
fn reload_main_window(app: &AppHandle) -> Result<(), String> {
    let window = app.get_webview_window(MAIN_WINDOW).ok_or_else(|| "its window is gone".to_owned())?;
    window.reload().map_err(|error| error.to_string())
}

/// Builds the companion window as `tauri.conf.json` has it (same size and fixed frame), hidden until its page
/// says it's ready (or `SHOW_AFTER`, as the first window does).
fn build_main_window(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(MAIN_WINDOW).is_some() {
        return Err("its window is still there".to_owned());
    }
    let window = WebviewWindowBuilder::new(app, MAIN_WINDOW, WebviewUrl::App("index.html".into()))
        .title("WestPlay")
        .inner_size(900.0, 600.0)
        .resizable(false)
        .maximizable(false)
        .visible(false)
        .build()
        .map_err(|error| error.to_string())?;
    std::thread::spawn(move || {
        std::thread::sleep(SHOW_AFTER);
        if !window.is_visible().unwrap_or(true) {
            let _ = window.show();
        }
    });
    Ok(())
}

/// WestPlay's data folder: `%LOCALAPPDATA%\app.westplay` (where its maps, browsers and fallback log live).
pub fn app_data_dir() -> Option<PathBuf> {
    Some(PathBuf::from(std::env::var_os("LOCALAPPDATA")?).join("app.westplay"))
}

/// Where the software-rendering marker is looked for, first WestPlay's data folder, then the older `WestPlay`
/// folder a support note may name.
pub fn marker_paths() -> Vec<PathBuf> {
    let Some(local) = std::env::var_os("LOCALAPPDATA") else { return Vec::new() };
    let local = PathBuf::from(local);
    let mut paths = Vec::new();
    if let Some(data) = app_data_dir() {
        paths.push(data.join(MARKER_FILE));
    }
    paths.push(local.join("WestPlay").join(MARKER_FILE));
    paths
}

/// The marker this run read, if it did (or the first place a marker would be written).
pub fn software_rendering_marker() -> Option<PathBuf> {
    software_rendering_marker_at(&marker_paths())
}

/// The marker among `paths`, if one is there.
fn software_rendering_marker_at(paths: &[PathBuf]) -> Option<PathBuf> {
    paths.iter().find(|path| path.is_file()).cloned()
}

/// Whether software rendering was asked for: a marker is there, in either place.
pub fn software_rendering_requested() -> bool {
    software_rendering_marker().is_some()
}

/// Adds `--disable-gpu --disable-gpu-compositing` (and WestPlay's hidden-page arguments, see
/// [`WESTPLAY_ARGUMENTS`]) to WebView2's browser arguments, keeping any that are already set and not repeating
/// one. This is process-wide and is read by WebView2 when it starts, so it must be called before any window (or
/// WebView2) exists: in `main`, before Tauri's builder.
pub fn apply_software_rendering_env() -> String {
    let existing = std::env::var(BROWSER_ARGUMENTS_VAR).ok();
    let arguments = merged_browser_arguments(existing.as_deref());
    // SAFETY: `main` calls this before it starts a thread or creates a window, so no other thread reads or
    // writes the environment while this does; the variable is process-wide for WebView2's children.
    unsafe {
        std::env::set_var(BROWSER_ARGUMENTS_VAR, &arguments);
    }
    arguments
}

/// `existing` WebView2 arguments with the software-rendering ones and WestPlay's own added, each word once. Two
/// `--disable-features` switches carry one value each (the last written wins), so their values are merged into
/// one switch.
fn merged_browser_arguments(existing: Option<&str>) -> String {
    let mut words: Vec<String> = Vec::new();
    let mut features: Vec<String> = Vec::new();
    for word in existing.unwrap_or_default().split_whitespace() {
        if let Some(value) = word.strip_prefix("--disable-features=") {
            for feature in value.split(',').filter(|feature| !feature.is_empty()) {
                if !features.iter().any(|kept| kept == feature) {
                    features.push(feature.to_owned());
                }
            }
        } else if !words.iter().any(|kept| kept == word) {
            words.push(word.to_owned());
        }
    }
    for feature in WESTPLAY_FEATURES {
        if !features.iter().any(|kept| kept == feature) {
            features.push(feature.to_owned());
        }
    }
    if !features.is_empty() {
        words.push(format!("--disable-features={}", features.join(",")));
    }
    for argument in SOFTWARE_ARGUMENTS.into_iter().chain(WESTPLAY_ARGUMENTS) {
        if !words.iter().any(|kept| kept == argument) {
            words.push(argument.to_owned());
        }
    }
    words.join(" ")
}

/// Writes the marker at `path` (making its folder), with what it is for and when it was written.
fn write_marker_at(path: &Path) -> std::io::Result<()> {
    if let Some(folder) = path.parent() {
        std::fs::create_dir_all(folder)?;
    }
    let seconds = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |since| since.as_secs());
    std::fs::write(
        path,
        format!(
            "WestPlay's companion window kept failing to draw. WebView2 uses software rendering from the next \
             start.\nWritten at {seconds} (seconds since 1970).\n"
        ),
    )
}

/// Removes the marker at `path`; `true` if there was one.
fn clear_marker_at(path: &Path) -> std::io::Result<bool> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

/// Writes the marker where it will be read: `preferred` first (where this run read one), then the other place.
fn request_software_rendering(preferred: Option<&Path>) -> Result<PathBuf, String> {
    let mut paths: Vec<PathBuf> = preferred.map(Path::to_path_buf).into_iter().collect();
    for path in marker_paths() {
        if !paths.contains(&path) {
            paths.push(path);
        }
    }
    if paths.is_empty() {
        return Err("couldn't write the software-rendering marker: WestPlay's data folder wasn't found".to_owned());
    }
    let mut failures = Vec::new();
    for path in paths {
        match write_marker_at(&path) {
            Ok(()) => return Ok(path),
            Err(error) => failures.push(format!("{}: {error}", path.display())),
        }
    }
    Err(format!("couldn't write the software-rendering marker ({})", failures.join("; ")))
}

/// Turns software rendering on (writing the marker) or off (removing it), for the next start.
pub fn set_software_rendering(enabled: bool) -> Result<(), String> {
    if enabled {
        let path = request_software_rendering(None)?;
        log!(
            "[companion] software rendering will be on from the next start (marker: {})",
            path.display()
        );
        Ok(())
    } else {
        let mut removed = false;
        let mut failures = Vec::new();
        for path in marker_paths() {
            match clear_marker_at(&path) {
                Ok(was_there) => removed |= was_there,
                Err(error) => failures.push(format!("{}: {error}", path.display())),
            }
        }
        if failures.is_empty() {
            log!(
                "[companion] software rendering will be off from the next start{}",
                if removed { "" } else { " (no marker was set)" }
            );
            Ok(())
        } else {
            Err(format!("couldn't remove the software-rendering marker ({})", failures.join("; ")))
        }
    }
}

/// Claims being the one WestPlay. A process the watchdog started waits for the one it replaces to let go of the
/// instance (the old process starts it, then exits): up to fifteen seconds.
pub fn claim_instance(restarted: bool) -> Option<westplay_host::Instance> {
    if !restarted {
        return westplay_host::Instance::claim();
    }
    let started = Instant::now();
    loop {
        if let Some(instance) = westplay_host::Instance::claim() {
            return Some(instance);
        }
        if started.elapsed() >= Duration::from_secs(15) {
            return None;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicU64;

    static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);

    /// A folder under the workspace's `target/test-tmp`, removed when the test ends.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new(name: &str) -> Self {
            // Under the workspace's `target`, which cargo already writes: the system temp folder is refused to
            // this test binary in some environments.
            let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../target/test-tmp");
            std::fs::create_dir_all(&root).unwrap();
            let path = root.join(format!(
                "westplay-watchdog-{name}-{}-{}",
                std::process::id(),
                NEXT_TEMP.fetch_add(1, Ordering::Relaxed)
            ));
            let _ = std::fs::remove_dir_all(&path);
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn a_page_is_overdue_after_five_quiet_seconds() {
        let created = Instant::now();
        let at = |seconds| created + Duration::from_secs(seconds);
        // The last beat 4 s ago: still alive; 6 s: gone.
        assert!(!heartbeat_overdue(at(20), created, Some(at(16)), STARTUP_GRACE, BEAT_TIMEOUT));
        assert!(heartbeat_overdue(at(22), created, Some(at(16)), STARTUP_GRACE, BEAT_TIMEOUT));
        // Exactly five seconds is not yet "more than five".
        assert!(!heartbeat_overdue(at(21), created, Some(at(16)), STARTUP_GRACE, BEAT_TIMEOUT));
    }

    #[test]
    fn the_startup_grace_lets_a_slow_page_load() {
        let created = Instant::now();
        let at = |seconds| created + Duration::from_secs(seconds);
        // No heartbeat at all: not called gone during the grace, and then only after the full grace + timeout.
        assert!(!heartbeat_overdue(at(14), created, None, STARTUP_GRACE, BEAT_TIMEOUT));
        assert!(!heartbeat_overdue(at(19), created, None, STARTUP_GRACE, BEAT_TIMEOUT));
        assert!(heartbeat_overdue(at(20), created, None, STARTUP_GRACE, BEAT_TIMEOUT));
        // A first beat inside the grace counts normally after it.
        assert!(!heartbeat_overdue(at(17), created, Some(at(15)), STARTUP_GRACE, BEAT_TIMEOUT));
        assert!(heartbeat_overdue(at(21), created, Some(at(15)), STARTUP_GRACE, BEAT_TIMEOUT));
    }

    #[test]
    fn two_crashes_within_ten_minutes_ask_for_software_rendering() {
        let now = Instant::now();
        let crash = |seconds_ago| now - Duration::from_secs(seconds_ago);
        assert_eq!(crashes_within(&[crash(9 * 60), crash(60)], now, CRASH_WINDOW), 2);
        assert!(calls_for_software_rendering(&[crash(9 * 60), crash(60)], now));
        // One just outside the window doesn't count; exactly ten minutes old doesn't either.
        assert_eq!(crashes_within(&[crash(11 * 60), crash(10 * 60), crash(1)], now, CRASH_WINDOW), 1);
        assert!(!calls_for_software_rendering(&[crash(11 * 60), crash(1)], now));
        assert_eq!(crashes_within(&[], now, CRASH_WINDOW), 0);
        assert!(!calls_for_software_rendering(&[], now));
    }

    #[test]
    fn the_software_rendering_marker_is_written_read_and_removed() {
        let temp = TempDir::new("marker");
        let path = temp.0.join("data").join(MARKER_FILE);
        assert!(!path.exists());
        write_marker_at(&path).unwrap();
        assert!(path.is_file());
        assert_eq!(software_rendering_marker_at(std::slice::from_ref(&path)), Some(path.clone()));
        let written = std::fs::read_to_string(&path).unwrap();
        assert!(written.contains("software rendering"), "{written}");
        assert!(clear_marker_at(&path).unwrap());
        assert!(!path.exists());
        // Nothing left to remove is not an error.
        assert!(!clear_marker_at(&path).unwrap());
    }

    #[test]
    fn software_rendering_arguments_are_merged_without_repeats() {
        let merged = merged_browser_arguments(None);
        let words: Vec<&str> = merged.split_whitespace().collect();
        for wanted in SOFTWARE_ARGUMENTS.into_iter().chain(WESTPLAY_ARGUMENTS) {
            assert_eq!(words.iter().filter(|word| **word == wanted).count(), 1, "{wanted} in {merged}");
        }
        let features = words
            .iter()
            .find(|word| word.starts_with("--disable-features="))
            .unwrap_or_else(|| panic!("no --disable-features in {merged}"));
        for feature in WESTPLAY_FEATURES {
            assert!(features.contains(feature), "{feature} in {features}");
        }

        // An arguments variable already set keeps its words (once) and its features are merged with ours.
        let merged = merged_browser_arguments(Some(
            "--foo --foo --disable-features=Foo --disable-gpu --disable-gpu-compositing",
        ));
        let words: Vec<&str> = merged.split_whitespace().collect();
        assert_eq!(words.iter().filter(|word| **word == "--foo").count(), 1, "{merged}");
        assert_eq!(words.iter().filter(|word| **word == "--disable-gpu").count(), 1, "{merged}");
        assert_eq!(words.iter().filter(|word| **word == "--disable-gpu-compositing").count(), 1, "{merged}");
        assert_eq!(merged.matches("--disable-features=").count(), 1, "one switch: {merged}");
        let features = words.iter().find(|word| word.starts_with("--disable-features=")).unwrap();
        for feature in ["Foo", "CalculateNativeWinOcclusion", "msWebOOUI", "msPdfOOUI", "msSmartScreenProtection"] {
            assert!(features.contains(feature), "{feature} in {features}");
        }

        // Two --disable-features switches are one, with both values.
        let merged = merged_browser_arguments(Some("--disable-features=A --disable-features=B"));
        let features = merged.split_whitespace().find(|word| word.starts_with("--disable-features=")).unwrap();
        assert!(features.contains("A") && features.contains("B"), "{features}");
        assert_eq!(merged.matches("--disable-features=").count(), 1, "{merged}");
    }
}
