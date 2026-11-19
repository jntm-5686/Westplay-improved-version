//! Lists one folder of an archive: its children's names.
//!
//! `cargo run -p westplay-mapdata --example scs_list -- <archive> <folder>`

use std::path::Path;

use westplay_mapdata::archive::Archive;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let (Some(archive), Some(folder)) = (args.first(), args.get(1)) else {
        eprintln!("usage: scs_list <archive> <folder>");
        return;
    };
    let archive = Archive::open(Path::new(archive)).expect("open the archive");
    match archive.list(folder) {
        Ok(Some(listing)) => {
            for name in listing.files.iter().chain(listing.dirs.iter()) {
                println!("{name}");
            }
        }
        Ok(None) => println!("no folder {folder}"),
        Err(error) => println!("{error}"),
    }
}
