//! 探针：打印一个模型（.pmg）的部件、碎片、材质、顶点框与 UV 范围，以及某一块的前若干个顶点
//! （默认 UV 面积最大的那块）。
//!
//! 用法：cargo run -p westplay-mapdata --example pmg_dump -- <model.pmg> [顶点数] [碎片号]

use westplay_mapdata::pmg::Pmg;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(path) = args.first() else {
        eprintln!("usage: pmg_dump <model.pmg> [vertices]");
        return;
    };
    let shown: usize = args.get(1).and_then(|text| text.parse().ok()).unwrap_or(8);
    let wanted: Option<usize> = args.get(2).and_then(|text| text.parse().ok());
    let data = std::fs::read(path).expect("read the model");
    let Some(model) = Pmg::read(&data) else {
        println!("{path}: not a model this reads");
        return;
    };
    println!("{path}: version {:#x}, {} B", model.version, data.len());
    println!("  box {:?}", model.model_box());
    let parts = model.part_count().unwrap_or(0);
    println!("  parts {parts}");
    for index in 0..parts {
        let Some(part) = model.part(index) else { continue };
        println!("    part {index}: {:?}", part);
    }
    let pieces = model.piece_count().unwrap_or(0);
    println!("  pieces {pieces}");
    let mut best: Option<(f32, usize, [f32; 2], [f32; 2])> = None;
    for index in 0..pieces {
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
        let area = if read > 0 { (max[0] - min[0]) * (max[1] - min[1]) } else { 0.0 };
        println!(
            "    piece {index}: material {}, {} vertices, {} indices, box {:?}..{:?}, uv {read} {:.4}..{:.4} x {:.4}..{:.4}",
            piece.material,
            piece.vertices,
            piece.indices,
            piece.min,
            piece.max,
            min[0],
            max[0],
            min[1],
            max[1]
        );
        if read > 0 && best.is_none_or(|(seen, _, _, _)| area > seen) {
            best = Some((area, index, min, max));
        }
    }
    let (index, min, max) = match wanted {
        Some(index) => {
            let Some(piece) = model.piece(index) else {
                println!("  no piece {index}");
                return;
            };
            let mut min = [f32::INFINITY; 2];
            let mut max = [f32::NEG_INFINITY; 2];
            for vertex in 0..piece.vertices {
                if let Some(uv) = model.coordinate(&piece, vertex) {
                    min[0] = min[0].min(uv[0]);
                    min[1] = min[1].min(uv[1]);
                    max[0] = max[0].max(uv[0]);
                    max[1] = max[1].max(uv[1]);
                }
            }
            (index, min, max)
        }
        None => {
            let Some((_, index, min, max)) = best else { return };
            (index, min, max)
        }
    };
    println!("  the piece is {index}: uv {min:?}..{max:?}");
    let Some(piece) = model.piece(index) else { return };
    for vertex in 0..piece.vertices.min(shown) {
        println!(
            "    vertex {vertex}: position {:?}, uv {:?}",
            model.position(&piece, vertex),
            model.coordinate(&piece, vertex)
        );
    }
}
