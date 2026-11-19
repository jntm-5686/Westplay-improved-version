//! Walks an archive's folders, printing every file's path under one (and its folders, if asked).
//!
//! `cargo run -p westplay-mapdata --example scs_tree -- <archive> <folder> [dirs]`
//!
//! With `dirs`, folders are printed too (each with a trailing `/`); without, only files.

use std::path::Path;

use westplay_mapdata::archive::Archive;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let (Some(archive), Some(folder)) = (args.first(), args.get(1)) else {
        eprintln!("usage: scs_tree <archive> <folder> [dirs]");
        return;
    };
    let dirs = args.get(2).is_some_and(|value| value == "dirs");
    let archive = Archive::open(Path::new(archive)).expect("open the archive");
    let root = format!("{}/", folder.trim_matches('/'));
    let mut stack = vec![root.clone()];
    let mut files = 0;
    while let Some(folder) = stack.pop() {
        let Ok(Some(listing)) = archive.list(&folder) else { continue };
        for name in &listing.files {
            println!("{folder}{name}");
            files += 1;
        }
        for name in &listing.dirs {
            let path = format!("{folder}{name}/");
            if dirs {
                println!("{path}");
            }
            stack.push(path);
        }
    }
    eprintln!("{} files under {root}", files);
}
