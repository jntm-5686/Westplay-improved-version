//! 工具/探针：把 YTHQ 平板模型屏幕面（一块四边形）的 UV，从 YTHQ 自己那张仪表贴图的中间带
//! （u 0..1、v 0.1922..0.8078）改成占满 WestPlay 的屏幕贴图（`screen_tablet`，1280x727：u、v 0..1，
//! v 上下翻向），只改这一块的 UV，几何、材质、其余碎片一个字节不动。
//!
//! 变换与 `crates/setup/assets/patches.zip` 里 `ats-ythq` 的模型完全一致（那一批是同样的平板模型，作者
//! 已按 WestPlay 的贴图改好，逐个顶点反解出来的：u 归一化不翻、v 归一化后翻向）：
//!
//!   u' = (u - min_u) / (max_u - min_u)
//!   v' = (max_v - v) / (max_v - min_v)
//!
//! 用法：cargo run -p westplay-mapdata --example ythq_uv -- <in.pmg> <out.pmg> <piece>

use westplay_mapdata::pmg::Pmg;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let (Some(input), Some(output), Some(piece)) = (args.first(), args.get(1), args.get(2)) else {
        eprintln!("usage: ythq_uv <in.pmg> <out.pmg> <piece>");
        return;
    };
    let piece: usize = piece.parse().expect("a piece number");
    let source = std::fs::read(input).expect("read the model");
    let Some(model) = Pmg::read(&source) else {
        eprintln!("{input}: not a model this reads");
        return;
    };
    let Some(part) = model.piece(piece) else {
        eprintln!("{input}: no piece {piece}");
        return;
    };
    let Some(coordinates) = part.coordinates else {
        eprintln!("{input}: piece {piece} has no texture coordinates");
        return;
    };
    let stride = part.coordinate_stride;
    // The piece's own bounds: what it shows of the YTHQ tablet's texture, made the whole of WestPlay's.
    let mut min = [f32::INFINITY; 2];
    let mut max = [f32::NEG_INFINITY; 2];
    for vertex in 0..part.vertices {
        let Some(uv) = model.coordinate(&part, vertex) else { continue };
        min[0] = min[0].min(uv[0]);
        min[1] = min[1].min(uv[1]);
        max[0] = max[0].max(uv[0]);
        max[1] = max[1].max(uv[1]);
    }
    if !(min[0].is_finite() && min[1].is_finite() && max[0] > min[0] && max[1] > min[1]) {
        eprintln!("{input}: piece {piece} has no UVs to stretch");
        return;
    }
    let mut data = source.clone();
    let mut changed = 0;
    for vertex in 0..part.vertices {
        let Some(uv) = model.coordinate(&part, vertex) else { continue };
        let u = (uv[0] - min[0]) / (max[0] - min[0]);
        let v = (max[1] - uv[1]) / (max[1] - min[1]);
        let at = coordinates + vertex * stride;
        data[at..at + 4].copy_from_slice(&u.to_le_bytes());
        data[at + 4..at + 8].copy_from_slice(&v.to_le_bytes());
        changed += 1;
    }
    std::fs::write(output, &data).expect("write the model");
    // Read it back: what the piece shows of the texture now.
    let read = Pmg::read(&data).expect("the model reads back");
    let part = read.piece(piece).expect("the piece reads back");
    let mut read_min = [f32::INFINITY; 2];
    let mut read_max = [f32::NEG_INFINITY; 2];
    for vertex in 0..part.vertices {
        let Some(uv) = read.coordinate(&part, vertex) else { continue };
        read_min[0] = read_min[0].min(uv[0]);
        read_min[1] = read_min[1].min(uv[1]);
        read_max[0] = read_max[0].max(uv[0]);
        read_max[1] = read_max[1].max(uv[1]);
    }
    println!(
        "{output}: piece {piece}, {changed} UVs, {:.4}..{:.4} x {:.4}..{:.4} -> {:.4}..{:.4} x {:.4}..{:.4}",
        min[0], max[0], min[1], max[1], read_min[0], read_max[0], read_min[1], read_max[1]
    );
}
