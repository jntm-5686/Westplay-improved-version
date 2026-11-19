//! 探针：打印一个目录下所有 .pmg 模型里，屏幕面（UV 覆盖 0..1 的那块）的 UV 范围。
//!
//! 用法：cargo run -p westplay-mapdata --example pmg_uv -- <目录>

use westplay_mapdata::pmg::Pmg;

fn main() {
    let path = std::env::args().nth(1).expect("usage: pmg_uv <folder or model.pmg>");
    let metadata = std::fs::metadata(&path).expect("read the path");
    let mut files = Vec::new();
    if metadata.is_dir() {
        for entry in std::fs::read_dir(&path).expect("read the folder") {
            let entry = entry.expect("an entry");
            if entry.path().extension().is_some_and(|extension| extension == "pmg") {
                files.push(entry.path());
            }
        }
        files.sort();
    } else {
        files.push(path.into());
    }

    let mut full = 0;
    let mut odd = Vec::new();
    for file in &files {
        let Ok(data) = std::fs::read(file) else { continue };
        let Some(model) = Pmg::read(&data) else {
            odd.push(format!("{}: not a model this reads", file.display()));
            continue;
        };
        let mut best: Option<(f32, [f32; 2], [f32; 2])> = None;
        for index in 0..model.piece_count().unwrap_or(0) {
            let Some(piece) = model.piece(index) else { continue };
            let mut min = [f32::INFINITY; 2];
            let mut max = [f32::NEG_INFINITY; 2];
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
            if read == 0 {
                continue;
            }
            // The screen is the piece that covers the whole texture; a body's atlas never does.
            let area = (max[0] - min[0]) * (max[1] - min[1]);
            if best.is_none_or(|(seen, _, _)| area > seen) {
                best = Some((area, min, max));
            }
        }
        match best {
            Some((_, min, max)) => {
                let whole = min[0].abs() < 0.01 && (max[0] - 1.0).abs() < 0.01 && min[1].abs() < 0.01 && (max[1] - 1.0).abs() < 0.01;
                if whole {
                    full += 1;
                } else {
                    odd.push(format!(
                        "{}: x {:.3}..{:.3}  y {:.3}..{:.3}",
                        file.file_name().unwrap_or_default().to_string_lossy(),
                        min[0],
                        max[0],
                        min[1],
                        max[1]
                    ));
                }
            }
            None => odd.push(format!("{}: no piece with texture coordinates", file.display())),
        }
    }
    println!("models: {}   screen face 0..1: {}   other: {}", files.len(), full, odd.len());
    for line in odd.iter().take(20) {
        println!("  {line}");
    }
}
