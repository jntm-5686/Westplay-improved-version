//! A probe for measuring a truck interior: a model's parts, its locators and its pieces (each one's material,
//! box, centre and the way its triangles face), enough to place a speaker at a grille and to see, from a cab
//! model, where the interior is fitted and, from a chassis, where the cab turns.
//!
//! `cargo run -p westplay-mapdata --example cab_model -- <model.pmg> [model.pmd] [options]`
//!
//! Options:
//! - `--part <text>`: only the parts whose name holds it (locators and pieces alike).
//! - `--material <text>`: only the pieces whose `.mat` path holds it.
//! - `--piece <n>`: only this piece (its triangles and its texture coordinates, when asked).
//! - `--variant <name>`: mark the pieces the `.pmd`'s variant shows (`core`, `default`, ...).
//! - `--look <name>`: the `.pmd`'s look whose materials to print (the first by default).
//! - `--triangles <n>`: print the first `n` triangles of each piece shown.
//! - `--uv`: print each piece shown's texture-coordinate range.
//! - `--colours`: print each piece shown's vertex colours' alpha values (how much an effect's weight
//!   would blend with, and where a grille's pattern is painted on a surface).
//! - `--uvbox u0,u1,v0,v1`: only the vertices whose first texture coordinate lies in this box: their count,
//!   mean and bounding position, and their alpha values.
//! - `--inside x0,x1,y0,y1,z0,z1`: only the vertices inside this box of the model's space: their count, mean
//!   position, texture-coordinate range and alpha values.
//! - `--uvcells <n>`: the same for each cell of an n x n grid over the texture (a vertex's coordinates taken
//!   as they sample a texture: wrapped into 0..1), each cell's vertices' mean place in the model.
//! - `--vertices`: every vertex of each piece shown, one a line: `v piece index x y z u v alpha`.
//! - `--faces`: every triangle of each piece shown, one a line: `f piece a b c` (vertex indices).
//! - `--parts`: print the parts and locators only.
//!
//! A locator's position is in its model's own axes (metres, x right, y up, z back), as is a piece's box: an
//! interior model's origin is at the driver's head, a cab's wherever the game puts it (the `interior_*` locators
//! say where the interior goes in it), a chassis's wherever its own is (its `cabin` locator where the cab turns).

use std::path::PathBuf;

use westplay_mapdata::pmg::Pmg;
use westplay_mapdata::pmd::Pmd;

struct Options {
    model: PathBuf,
    descriptor: Option<PathBuf>,
    part: Option<String>,
    material: Option<String>,
    piece: Option<usize>,
    look: Option<String>,
    variant: Option<String>,
    triangles: usize,
    uv: bool,
    parts: bool,
    colours: bool,
    uvbox: Option<[f32; 4]>,
    inside: Option<[f32; 6]>,
    uvcells: Option<usize>,
    vertices: bool,
    faces: bool,
}

fn options() -> Options {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut options = Options {
        model: PathBuf::new(),
        descriptor: None,
        part: None,
        material: None,
        piece: None,
        look: None,
        variant: None,
        triangles: 0,
        uv: false,
        parts: false,
        colours: false,
        uvbox: None,
        inside: None,
        uvcells: None,
        vertices: false,
        faces: false,
    };
    let mut seen = false;
    let mut rest = args.into_iter();
    while let Some(arg) = rest.next() {
        let mut value = |name: &str| rest.next().unwrap_or_else(|| usage(&format!("{name} needs a value")));
        match arg.as_str() {
            "--part" => options.part = Some(value("--part")),
            "--material" => options.material = Some(value("--material")),
            "--piece" => options.piece = value("--piece").parse().ok(),
            "--look" => options.look = Some(value("--look")),
            "--variant" => options.variant = Some(value("--variant")),
            "--triangles" => options.triangles = value("--triangles").parse().unwrap_or(0),
            "--uv" => options.uv = true,
            "--parts" => options.parts = true,
            "--colours" => options.colours = true,
            "--uvbox" => options.uvbox = Some(rect_of(&value("--uvbox"))),
            "--inside" => options.inside = Some(box_of(&value("--inside"))),
            "--uvcells" => options.uvcells = value("--uvcells").parse().ok(),
            "--vertices" => options.vertices = true,
            "--faces" => options.faces = true,
            _ if arg.starts_with("--") => usage(&format!("{arg} isn't an option")),
            _ if !seen => {
                options.model = PathBuf::from(&arg);
                seen = true;
            }
            _ => options.descriptor = Some(PathBuf::from(&arg)),
        }
    }
    if !seen {
        usage("usage: cab_model <model.pmg> [model.pmd] [options]");
    }
    options
}

fn usage(why: &str) -> ! {
    eprintln!("{why}");
    std::process::exit(2);
}

/// Four numbers from `text` (`u0,u1,v0,v1`).
fn rect_of(text: &str) -> [f32; 4] {
    let values: Vec<f32> = text.split(',').filter_map(|value| value.trim().parse().ok()).collect();
    match values.as_slice() {
        [a, b, c, d] => [*a, *b, *c, *d],
        _ => usage("a box needs four numbers: u0,u1,v0,v1 or x0,x1,y0,y1"),
    }
}

/// Six numbers from `text` (`x0,x1,y0,y1,z0,z1`).
fn box_of(text: &str) -> [f32; 6] {
    let values: Vec<f32> = text.split(',').filter_map(|value| value.trim().parse().ok()).collect();
    match values.as_slice() {
        [a, b, c, d, e, f] => [*a, *b, *c, *d, *e, *f],
        _ => usage("a 3D box needs six numbers: x0,x1,y0,y1,z0,z1"),
    }
}

/// The name a token holds (`int_rearwall`), or the number when it isn't a token this reads.
fn name(token: u64) -> String {
    westplay_mapdata::token::token_to_string(token).map_or_else(|| format!("{token:#018x}"), String::from)
}

fn main() {
    let options = options();
    let Ok(data) = std::fs::read(&options.model) else { usage("the model can't be read") };
    let Some(model) = Pmg::read(&data) else {
        println!("{}: not a model this reads", options.model.display());
        return;
    };
    println!("{}: version {:#x}, {} B", options.model.display(), model.version, data.len());
    if let Some((min, max)) = model.model_box() {
        println!("  box {min:?} .. {max:?}");
    }
    // The materials' paths: the descriptor's (the look asked for, else the first), or none.
    let descriptor_data = options.descriptor.as_ref().map(|path| std::fs::read(path).unwrap_or_default());
    let descriptor = descriptor_data.as_deref().and_then(Pmd::read);
    if let Some(descriptor) = &descriptor {
        let look = options.look.as_ref().and_then(|look| westplay_mapdata::token::string_to_token(look));
        let materials = descriptor.materials(look);
        println!("  looks {}", descriptor.looks());
        for (index, material) in materials.iter().enumerate() {
            println!("    material {index}: {material}");
        }
    }
    // Which pieces a variant shows, if asked.
    let shown = options.variant.as_ref().and_then(|variant| {
        let data = descriptor_data.as_deref()?;
        let variant = westplay_mapdata::token::string_to_token(variant)?;
        westplay_mapdata::buildings::visible_pieces(data, &data, variant)
    });
    let matches_part = |part: usize| -> bool {
        let Some(named) = model.part(part) else { return false };
        let Some(wanted) = &options.part else { return true };
        name(named.name.unwrap_or(0)).contains(wanted.as_str())
    };
    let materials = descriptor.as_ref().map(|descriptor| {
        let look = options.look.as_ref().and_then(|look| westplay_mapdata::token::string_to_token(look));
        descriptor.materials(look)
    });
    if options.parts {
        let parts = model.part_count().unwrap_or(0);
        for part in 0..parts {
            if !matches_part(part) {
                continue;
            }
            let Some(named) = model.part(part) else { continue };
            println!(
                "  part {part}: {}, pieces {:?}, locators {:?}",
                name(named.name.unwrap_or(0)),
                named.pieces,
                named.locators
            );
            for index in named.locators {
                let Some(locator) = model.locator(index) else { continue };
                println!(
                    "    locator {}: position {:?}, rotation {:?}",
                    name(locator.name),
                    locator.position,
                    locator.rotation
                );
            }
        }
        return;
    }
    let pieces = model.piece_count().unwrap_or(0);
    for index in 0..pieces {
        let Some(piece) = model.piece(index) else { continue };
        let material = materials
            .as_ref()
            .and_then(|materials| materials.get(piece.material))
            .cloned()
            .unwrap_or_default();
        if options.material.as_ref().is_some_and(|wanted| !material.contains(wanted.as_str())) {
            continue;
        }
        if options.piece.is_some_and(|wanted| wanted != index) {
            continue;
        }
        let centre = [
            (piece.min[0] + piece.max[0]) / 2.0,
            (piece.min[1] + piece.max[1]) / 2.0,
            (piece.min[2] + piece.max[2]) / 2.0,
        ];
        let size = [piece.max[0] - piece.min[0], piece.max[1] - piece.min[1], piece.max[2] - piece.min[2]];
        let triangles = model.triangles(&piece);
        // The way its triangles face: their normals by area (a grille's is the way it looks).
        let (mut normal, mut area) = ([0.0f64; 3], 0.0f64);
        for [a, b, c] in &triangles {
            let [u, v] = [
                [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
                [c[0] - a[0], c[1] - a[1], c[2] - a[2]],
            ];
            let cross = [
                u[1] * v[2] - u[2] * v[1],
                u[2] * v[0] - u[0] * v[2],
                u[0] * v[1] - u[1] * v[0],
            ];
            let length = (cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]).sqrt();
            for (total, value) in normal.iter_mut().zip(cross) {
                *total += f64::from(value);
            }
            area += f64::from(length) / 2.0;
        }
        let length = (normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]).sqrt();
        let normal: [f32; 3] = if length > 0.0 {
            [
                (normal[0] / length) as f32,
                (normal[1] / length) as f32,
                (normal[2] / length) as f32,
            ]
        } else {
            [0.0; 3]
        };
        let visibility = shown.as_ref().map(|shown| !shown.get(index).copied().unwrap_or(true));
        println!(
            "  piece {index}: material {} ({material}), {} vertices, {} indices, {}
                box {:?} .. {:?}, centre {:?}, size {:?}
                faces {:?}, area {:.4} m2{}",
            piece.material,
            piece.vertices,
            piece.indices,
            if model.held_vertices(&piece) < piece.vertices { "held vertices" } else { "whole" },
            piece.min,
            piece.max,
            centre,
            size,
            normal,
            area,
            if visibility == Some(true) { ", hidden" } else { "" }
        );
        if options.uv {
            let (mut min, mut max) = ([f32::INFINITY; 2], [f32::NEG_INFINITY; 2]);
            let mut read = 0;
            for vertex in 0..piece.vertices {
                if let Some(uv) = model.coordinate(&piece, vertex) {
                    min[0] = min[0].min(uv[0]);
                    min[1] = min[1].min(uv[1]);
                    max[0] = max[0].max(uv[0]);
                    max[1] = max[1].max(uv[1]);
                    read += 1;
                }
            }
            if read > 0 {
                println!("    uv {min:?} .. {max:?} ({read} vertices)");
            }
        }
        if let Some(rect) = options.uvbox {
            let kept: Vec<usize> = (0..piece.vertices)
                .filter(|&vertex| {
                    model.coordinate(&piece, vertex).is_some_and(|uv| {
                        // As a sampler reads them: wrapped into 0..1.
                        let wrap = |value: f32| value - value.floor();
                        (rect[0]..=rect[1]).contains(&wrap(uv[0])) && (rect[2]..=rect[3]).contains(&wrap(uv[1]))
                    })
                })
                .collect();
            report(&model, &piece, &kept, "uvbox");
        }
        if let Some(inside) = options.inside {
            let kept: Vec<usize> = (0..piece.vertices)
                .filter(|&vertex| {
                    model.position(&piece, vertex).is_some_and(|p| {
                        (inside[0]..=inside[1]).contains(&p[0])
                            && (inside[2]..=inside[3]).contains(&p[1])
                            && (inside[4]..=inside[5]).contains(&p[2])
                    })
                })
                .collect();
            report(&model, &piece, &kept, "inside");
        }
        if let Some(cells) = options.uvcells {
            if cells > 0 {
                let mut kept: Vec<Vec<usize>> = vec![Vec::new(); cells * cells];
                for vertex in 0..piece.vertices {
                    let Some(uv) = model.coordinate(&piece, vertex) else { continue };
                    let cell = |value: f32| -> usize {
                        let wrapped = value - value.floor();
                        ((wrapped * cells as f32) as usize).min(cells - 1)
                    };
                    kept[cell(uv[1]) * cells + cell(uv[0])].push(vertex);
                }
                for (index, vertices) in kept.iter().enumerate() {
                    if vertices.is_empty() {
                        continue;
                    }
                    report(&model, &piece, vertices, &format!("uv cell ({}, {})", index / cells, index % cells));
                }
            }
        }
        if options.vertices {
            for vertex in 0..piece.vertices {
                let (Some(position), Some(uv)) = (model.position(&piece, vertex), model.coordinate(&piece, vertex))
                else {
                    continue;
                };
                println!(
                    "v {index} {vertex} {:.5} {:.5} {:.5} {:.5} {:.5} {:.3}",
                    position[0],
                    position[1],
                    position[2],
                    uv[0],
                    uv[1],
                    model.alpha(&piece, vertex)
                );
            }
        }
        if options.faces {
            let triangles = piece.indices / 3;
            for triangle in 0..triangles {
                let (Some(a), Some(b), Some(c)) = (
                    model.index(&piece, triangle * 3),
                    model.index(&piece, triangle * 3 + 1),
                    model.index(&piece, triangle * 3 + 2),
                ) else {
                    continue;
                };
                println!("f {index} {a} {b} {c}");
            }
        }
        if options.colours {
            // Its vertices' alpha values: how many have each (a weight's blend, 1 where they're not read).
            let mut values: Vec<(u8, usize)> = Vec::new();
            for vertex in 0..piece.vertices {
                let alpha = (model.alpha(&piece, vertex) * 255.0).round() as u8;
                match values.iter_mut().find(|(seen, _)| *seen == alpha) {
                    Some((_, count)) => *count += 1,
                    None => values.push((alpha, 1)),
                }
            }
            values.sort_unstable();
            let shown: Vec<String> = values.iter().map(|(alpha, count)| format!("{alpha}:{count}")).collect();
            println!("    alpha {}", shown.join(", "));
        }
        for triangle in triangles.iter().take(options.triangles) {
            println!("    triangle {triangle:?}");
        }
    }
}

/// What a set of a piece's vertices comes to: how many, where they are together, their texture coordinates and
/// their alpha values.
fn report(model: &Pmg, piece: &westplay_mapdata::pmg::Piece, kept: &[usize], what: &str) {
    if kept.is_empty() {
        return;
    }
    let (mut min, mut max) = ([f32::INFINITY; 3], [f32::NEG_INFINITY; 3]);
    let (mut uv_min, mut uv_max) = ([f32::INFINITY; 2], [f32::NEG_INFINITY; 2]);
    let (mut sum, mut alphas) = ([0.0f64; 3], Vec::new());
    let mut uv_read = 0;
    for &vertex in kept {
        if let Some(position) = model.position(piece, vertex) {
            for axis in 0..3 {
                min[axis] = min[axis].min(position[axis]);
                max[axis] = max[axis].max(position[axis]);
                sum[axis] += f64::from(position[axis]);
            }
        }
        if let Some(uv) = model.coordinate(piece, vertex) {
            for axis in 0..2 {
                uv_min[axis] = uv_min[axis].min(uv[axis]);
                uv_max[axis] = uv_max[axis].max(uv[axis]);
            }
            uv_read += 1;
        }
        alphas.push(model.alpha(piece, vertex));
    }
    let count = kept.len() as f64;
    let mean = [sum[0] / count, sum[1] / count, sum[2] / count];
    let (alpha_min, alpha_max) = alphas.iter().fold((f32::MAX, f32::MIN), |(a, b), &v| (a.min(v), b.max(v)));
    let alpha_mean = alphas.iter().sum::<f32>() / kept.len() as f32;
    println!(
        "    {what}: {} vertices, mean ({:.4},{:.4},{:.4}), box {min:?}..{max:?}, uv {uv_min:?}..{uv_max:?} \
         ({uv_read} read), alpha {alpha_min:.2}..{alpha_max:.2} mean {alpha_mean:.2}",
        kept.len(),
        mean[0],
        mean[1],
        mean[2]
    );
}
