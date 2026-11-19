//! Finds which of a folder's archives hold a path, and writes what it holds to a folder to look at.
//!
//! `cargo run -p westplay-mapdata --example scs_find -- <archives dir> <out dir> <path>...`
//!
//! What's written is as the archive stores it (`.bin`), and beside it the text (`.txt`) of a scrambled file
//! (`3nK`, as some mods' definitions are: [`westplay_mapdata::save::text`]). A path ending in `/` is a folder
//! to list instead of a file to read.

use std::fs;
use std::path::{Path, PathBuf};

use westplay_mapdata::archive::Archive;

fn archives_in(dir: &Path, found: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            archives_in(&path, found);
        } else if path.extension().is_some_and(|extension| extension == "scs" || extension == "zip") {
            found.push(path);
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let (Some(root), Some(out)) = (args.first(), args.get(1)) else {
        eprintln!("usage: scs_find <archives dir> <out dir> <path>...");
        return;
    };
    let out = Path::new(out);
    fs::create_dir_all(out).ok();
    let wanted = &args[2..];
    let mut archives = Vec::new();
    archives_in(Path::new(root), &mut archives);
    println!("{} archives under {root}", archives.len());
    for archive_path in archives {
        let Ok(archive) = Archive::open(&archive_path) else { continue };
        for path in wanted {
            if path.ends_with('/') {
                match archive.list(path) {
                    Ok(Some(listing)) => {
                        println!("DIR {} :: {path}", archive_path.display());
                        for name in listing.files {
                            println!("    {name}");
                        }
                        for name in listing.dirs {
                            println!("    {name}/");
                        }
                    }
                    Ok(None) => {}
                    Err(error) => println!("ERR {} :: {path}: {error}", archive_path.display()),
                }
                continue;
            }
            match archive.read(path) {
                Ok(Some(bytes)) => {
                    let name = path.trim_start_matches('/').replace('/', "_");
                    let target = out.join(format!("{name}.bin"));
                    let _ = fs::write(&target, &bytes);
                    println!("HIT {} :: {path} ({} B) -> {}", archive_path.display(), bytes.len(), target.display());
                    if bytes.starts_with(b"3nK\x01") {
                        match westplay_mapdata::save::text(&bytes) {
                            Ok(text) => {
                                let target = out.join(format!("{name}.txt"));
                                let _ = fs::write(&target, &text);
                                println!("    unscrambled ({} B) -> {}", text.len(), target.display());
                            }
                            Err(error) => println!("    not unscrambled: {error}"),
                        }
                    }
                }
                Ok(None) => {}
                Err(error) => println!("ERR {} :: {path}: {error}", archive_path.display()),
            }
        }
    }
}
