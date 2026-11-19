//! Measures a truck interior's speakers: the pieces whose material carries a speaker-grille normal map, each split
//! into its 3D islands (a mirror pair's two sides, a panel and its frame), and — given the cab and chassis models —
//! the place of the interior model's space in cab space (the game's, from the joint the cab turns on).
//!
//! `cargo run -p westplay-mapdata --example cab_speakers -- <interior.pmg> <interior.pmd> [options]`
//!
//! Options:
//! - `--mats <dir>`: the `.mat` files as `scs_find` writes them (`/automat/5c/x.mat` -> `automat_5c_x.mat.bin`); a
//!   piece's material is a speaker grille's when its text names a texture holding `speakersvents_nrm` (the Volvo
//!   VNL 2025's interiors) or `vents_nrm`. Without it, every piece is listed.
//! - `--cab <cab.pmg>`: the cab model, for its `interior` locator: where this interior model sits in the cab.
//! - `--chassis <chassis.pmg>`: a chassis model, for its `cabin` locator: the joint the cab turns on, cab space's
//!   origin (the cab model is placed at the chassis's origin; its `cabin` locator is the joint).
//! - `--point x,y,z`: a point of the interior model's space (metres) to print in cab space, repeatable: with the two
//!   locators above, a point's place in cab space is itself plus `interior` less `cabin`, which is also where the
//!   driver's head is by default (the interior model's origin).
//! - `--islands <mm>`: how far apart, in millimetres, two of a piece's vertices are still the same island (35 by
//!   default).
//!
//! The four VNL 2025 interiors are `/vehicle/truck/volvo_vnl2025/interior/model/{dc,s42m,s74h,s74m}.pmg` (read from
//! the game's `dlc_volvo_vnl2025.scs` with `scs_find`), their cabs `/vehicle/truck/volvo_vnl2025/cabin/*.pmg` and a
//! chassis `/vehicle/truck/volvo_vnl2025/chassis/dc_155_4x2.pmg`.

use std::path::{Path, PathBuf};

use westplay_mapdata::pmd::Pmd;
use westplay_mapdata::pmg::Pmg;

struct Options {
    model: PathBuf,
    descriptor: PathBuf,
    mats: Option<PathBuf>,
    cab: Option<PathBuf>,
    chassis: Option<PathBuf>,
    points: Vec<[f32; 3]>,
    islands: f32,
}

fn usage(why: &str) -> ! {
    eprintln!("{why}");
    eprintln!("usage: cab_speakers <interior.pmg> <interior.pmd> [--mats <dir>] [--cab <cab.pmg>] \
               [--chassis <chassis.pmg>] [--point x,y,z]... [--islands <mm>]");
    std::process::exit(2);
}

fn numbers(text: &str) -> Vec<f32> {
    text.split(',').filter_map(|value| value.trim().parse().ok()).collect()
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut options = Options {
        model: PathBuf::new(),
        descriptor: PathBuf::new(),
        mats: None,
        cab: None,
        chassis: None,
        points: Vec::new(),
        islands: 0.035,
    };
    let mut rest = args.into_iter();
    let mut files = Vec::new();
    while let Some(arg) = rest.next() {
        let mut value = |name: &str| rest.next().unwrap_or_else(|| usage(&format!("{name} needs a value")));
        match arg.as_str() {
            "--mats" => options.mats = Some(PathBuf::from(value("--mats"))),
            "--cab" => options.cab = Some(PathBuf::from(value("--cab"))),
            "--chassis" => options.chassis = Some(PathBuf::from(value("--chassis"))),
            "--point" => match numbers(&value("--point")).as_slice() {
                [x, y, z] => options.points.push([*x, *y, *z]),
                _ => usage("a point needs three numbers: x,y,z"),
            },
            "--islands" => {
                options.islands = value("--islands").parse::<f32>().unwrap_or(35.0) / 1000.0;
            }
            _ if arg.starts_with("--") => usage(&format!("{arg} isn't an option")),
            _ => files.push(PathBuf::from(arg)),
        }
    }
    let (Some(model), Some(descriptor)) = (files.first().cloned(), files.get(1).cloned()) else {
        usage("the model and its descriptor are needed");
    };
    options.model = model;
    options.descriptor = descriptor;
    let data = std::fs::read(&options.model).unwrap_or_else(|error| usage(&format!("{:?}", error)));
    let Some(pmg) = Pmg::read(&data) else { usage("the model can't be read") };
    let descriptor_data = std::fs::read(&options.descriptor).unwrap_or_else(|error| usage(&format!("{:?}", error)));
    let Some(pmd) = Pmd::read(&descriptor_data) else { usage("the descriptor can't be read") };
    println!("{}: {} B, {} pieces", options.model.display(), data.len(), pmg.piece_count().unwrap_or(0));
    let materials = pmd.materials(None);
    println!("  {} materials", materials.len());
    // Which materials are a speaker grille's: their file names a speaker-vents texture.
    let speakers: Vec<usize> = match &options.mats {
        None => (0..materials.len()).collect(),
        Some(dir) => materials
            .iter()
            .enumerate()
            .filter(|(_, path)| {
                let name = path.trim_start_matches('/').replace('/', "_");
                std::fs::read_to_string(dir.join(format!("{name}.bin")))
                    .is_ok_and(|text| text.contains("speakersvents_nrm") || text.contains("vents_nrm"))
            })
            .map(|(index, _)| index)
            .collect(),
    };
    println!("  speaker-grille materials: {speakers:?}");
    for index in 0..pmg.piece_count().unwrap_or(0) {
        let Some(piece) = pmg.piece(index) else { continue };
        let material = materials.get(piece.material).cloned().unwrap_or_default();
        let speaker = speakers.contains(&piece.material);
        if !speaker {
            continue;
        }
        println!(
            "  piece {index}: material {} {material}, {} vertices, {} indices, box {:?}..{:?}",
            piece.material, piece.vertices, piece.indices, piece.min, piece.max
        );
        for island in islands(&pmg, index, options.islands) {
            println!(
                "    island: {} vertices, mean [{:.4}, {:.4}, {:.4}], box {:?}..{:?}, size [{:.4}, {:.4}, {:.4}]",
                island.vertices.len(),
                island.mean[0],
                island.mean[1],
                island.mean[2],
                island.min,
                island.max,
                island.max[0] - island.min[0],
                island.max[1] - island.min[1],
                island.max[2] - island.min[2]
            );
        }
    }
    // The cab and the chassis: the locators that place the model in cab space (the head's by default).
    let interior = options.cab.as_ref().and_then(|path| locator(path, "interior"));
    let cabin = options.chassis.as_ref().and_then(|path| locator(path, "cabin"));
    if let (Some(interior), Some(cabin)) = (interior, cabin) {
        let offset = [0, 1, 2].map(|axis| interior[axis] - cabin[axis]);
        println!("  cab space: the interior model's plus [{:.5}, {:.5}, {:.5}]", offset[0], offset[1], offset[2]);
        println!("    (the driver's head by default: the interior model's origin)");
        for point in &options.points {
            let at = [0, 1, 2].map(|axis| point[axis] + offset[axis]);
            println!(
                "    interior [{:.4}, {:.4}, {:.4}] -> cab space [{:.4}, {:.4}, {:.4}]",
                point[0], point[1], point[2], at[0], at[1], at[2]
            );
        }
    } else if !options.points.is_empty() {
        println!("  (no --cab and --chassis given: the points stay in the interior model's space)");
    }
}

/// A model's locator named `wanted` (`interior`, `cabin`), its position in the model's axes.
fn locator(path: &Path, wanted: &str) -> Option<[f32; 3]> {
    let data = std::fs::read(path).ok()?;
    let model = Pmg::read(&data)?;
    let name = |token: u64| westplay_mapdata::token::token_to_string(token).unwrap_or_default();
    for index in 0..model.locators_at().unwrap_or(0) {
        let locator = model.locator(index)?;
        if name(locator.name) == wanted {
            println!("  {}: locator {wanted} {:?}", path.display(), locator.position);
            return Some(locator.position);
        }
    }
    println!("  {}: no {wanted} locator", path.display());
    None
}

/// One island of a piece's vertices: the ones within `link` of each other (a chain of them), their count, mean and box.
struct Island {
    vertices: Vec<usize>,
    mean: [f32; 3],
    min: [f32; 3],
    max: [f32; 3],
}

/// The pieces' islands, biggest first.
fn islands(model: &Pmg<'_>, piece_index: usize, link: f32) -> Vec<Island> {
    let Some(piece) = model.piece(piece_index) else { return Vec::new() };
    let positions: Vec<[f32; 3]> =
        (0..piece.vertices).filter_map(|vertex| model.position(&piece, vertex)).collect();
    if positions.is_empty() {
        return Vec::new();
    }
    // Union-find over the vertices, joined through a grid of cells `link` wide (a vertex and its 26 neighbours).
    let mut parent: Vec<usize> = (0..positions.len()).collect();
    fn root(parent: &mut [usize], mut vertex: usize) -> usize {
        while parent[vertex] != vertex {
            parent[vertex] = parent[parent[vertex]];
            vertex = parent[vertex];
        }
        vertex
    }
    let cell = |p: &[f32; 3]| p.map(|value| (value / link).floor() as i64);
    let mut buckets: std::collections::HashMap<[i64; 3], Vec<usize>> = std::collections::HashMap::new();
    for (index, position) in positions.iter().enumerate() {
        buckets.entry(cell(position)).or_default().push(index);
    }
    for (key, indices) in &buckets {
        for dx in -1..=1 {
            for dy in -1..=1 {
                for dz in -1..=1 {
                    let Some(others) = buckets.get(&[key[0] + dx, key[1] + dy, key[2] + dz]) else { continue };
                    for &a in indices {
                        for &b in others {
                            if a >= b {
                                continue;
                            }
                            let delta = [0, 1, 2].map(|axis| positions[a][axis] - positions[b][axis]);
                            if delta.iter().map(|value| value * value).sum::<f32>() <= link * link {
                                let (ra, rb) = (root(&mut parent, a), root(&mut parent, b));
                                if ra != rb {
                                    parent[rb] = ra;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    let mut grouped: std::collections::HashMap<usize, Vec<usize>> = std::collections::HashMap::new();
    for vertex in 0..positions.len() {
        grouped.entry(root(&mut parent, vertex)).or_default().push(vertex);
    }
    let mut islands: Vec<Island> = grouped
        .into_values()
        .map(|vertices| {
            let (mut min, mut max, mut sum) = ([f32::INFINITY; 3], [f32::NEG_INFINITY; 3], [0.0f64; 3]);
            for &vertex in &vertices {
                for axis in 0..3 {
                    min[axis] = min[axis].min(positions[vertex][axis]);
                    max[axis] = max[axis].max(positions[vertex][axis]);
                    sum[axis] += f64::from(positions[vertex][axis]);
                }
            }
            let count = vertices.len() as f64;
            let mean = [0, 1, 2].map(|axis| (sum[axis] / count) as f32);
            Island { vertices, mean, min, max }
        })
        .collect();
    islands.sort_by(|a, b| b.vertices.len().cmp(&a.vertices.len()));
    islands
}
