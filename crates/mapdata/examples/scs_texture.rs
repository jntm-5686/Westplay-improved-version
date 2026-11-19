//! A probe for looking at a model's texture: writes an archive's texture entry as a `.dds` (whatever its
//! format), and as a `.png` too when the format is one it decodes (the uncompressed 8-bit ones, BC1, BC3,
//! BC4 and BC5).
//!
//! `cargo run -p westplay-mapdata --example scs_texture -- <archive> <texture path> <out.dds|out.png>`
//!
//! The game keeps a texture's pixels in its archive as a `.dds` file's would be (its top level, the rows
//! padded to their alignment): the `.dds` written here is that top level with the header it would have had.
//! Its rows go top to bottom; a model's texture coordinates count them from the bottom (`v` 0 the bottom row).

use std::path::Path;

use westplay_mapdata::archive::{Archive, RawTexture};
use westplay_mapdata::texture::Texture;

/// A DXGI format's bytes in a 4x4 block (0, not block compressed).
fn block_size(format: u32) -> usize {
    match format {
        70..=72 => 8,  // BC1
        73..=75 => 16, // BC2
        76..=78 => 16, // BC3
        79..=81 => 8,  // BC4
        82..=84 => 16, // BC5
        _ => 0,
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let (Some(archive_path), Some(path), Some(out)) = (args.first(), args.get(1), args.get(2)) else {
        eprintln!("usage: scs_texture <archive> <texture path> <out.dds|out.png>");
        return;
    };
    let archive = Archive::open(Path::new(archive_path)).expect("open the archive");
    let texture = match archive.read_texture_top(path) {
        Ok(Some(texture)) => texture,
        Ok(None) => {
            println!("no texture at {path}");
            return;
        }
        Err(error) => {
            println!("{path}: {error}");
            return;
        }
    };
    let block = block_size(texture.format);
    let lower = out.to_ascii_lowercase();
    if lower.ends_with(".raw") {
        // The entry's bytes as they came out of the archive (all its mips, as one record).
        std::fs::write(out, &texture.data).expect("write the .raw");
        println!("wrote {out} ({} B)", texture.data.len());
        return;
    }
    let (bw, bh) = (texture.width.div_ceil(4) as usize, texture.height.div_ceil(4) as usize);
    let tight_row = if block > 0 { bw * block } else { texture.width as usize * 4 };
    println!(
        "{}: {} x {}, format {}, rows aligned to {} bytes, {} B (tight rows {tight_row} B)",
        path,
        texture.width,
        texture.height,
        texture.format,
        texture.row_alignment,
        texture.data.len()
    );
    // The rows as a DDS holds them: each as long as its blocks, with no alignment padding, in the archive's
    // own order (its first row is the image's bottom one: a model's `v` 0 counts from there).
    let rows_count = if block > 0 { bh } else { texture.height as usize };
    let stride = tight_row.next_multiple_of(texture.row_alignment.max(1));
    let mut rows = Vec::with_capacity(tight_row * rows_count);
    for row in 0..rows_count {
        let start = row * stride;
        let end = start + tight_row;
        match texture.data.get(start..end) {
            Some(bytes) => rows.extend_from_slice(bytes),
            None => {
                println!("row {row} past the data: {} bytes short", end - texture.data.len());
                return;
            }
        }
    }
    if out.to_ascii_lowercase().ends_with(".dds") {
        std::fs::write(out, dds(&texture, &rows)).expect("write the .dds");
        println!("wrote {out}");
        return;
    }
    let Some(image) = decode(&texture, &rows) else {
        println!("format {} isn't one this decodes as an image", texture.format);
        return;
    };
    // A page's image from the top down: the archive's first row is the model's `v` 0, the bottom.
    let stride = image.width as usize * 4;
    let mut rgba = Vec::with_capacity(image.rgba.len());
    for row in (0..image.height as usize).rev() {
        rgba.extend_from_slice(&image.rgba[row * stride..(row + 1) * stride]);
    }
    let image = Texture { width: image.width, height: image.height, rgba };
    std::fs::write(out, image.png()).expect("write the .png");
    println!("wrote {out}");
}

/// The `.dds` file the archive's top level would be: a plain DDS header for the uncompressed 8-bit formats,
/// a DX10 one for the rest.
fn dds(texture: &RawTexture, rows: &[u8]) -> Vec<u8> {
    let block = block_size(texture.format);
    let dx10 = !matches!(texture.format, 28 | 29 | 87 | 91);
    let mut header = Vec::with_capacity(148);
    let u32s = |header: &mut Vec<u8>, values: &[u32]| {
        for value in values {
            header.extend_from_slice(&value.to_le_bytes());
        }
    };
    header.extend_from_slice(b"DDS ");
    u32s(&mut header, &[124, 0x0002_1007, texture.height, texture.width]);
    // The pitch (a row of blocks, or of pixels), depth, mips.
    u32s(
        &mut header,
        &[
            if block > 0 { (texture.width.div_ceil(4) * block as u32).max(1) } else { texture.width * 4 },
            0,
            1,
        ],
    );
    u32s(&mut header, &[0; 11]);
    // The pixel format: the DXGI format's FOURCC for a DX10 header, else 32-bit colour's masks.
    if dx10 {
        u32s(&mut header, &[32, 0x4]);
        header.extend_from_slice(b"DX10");
        // The colour bit count and the masks (none: a DX10 header's format is the DXGI one).
        u32s(&mut header, &[0, 0, 0, 0, 0]);
    } else {
        u32s(&mut header, &[32, 0x41, 0, 32, 0x00ff_0000, 0x0000_ff00, 0x0000_00ff, 0xff00_0000]);
    }
    // Caps, then the DX10 header.
    u32s(&mut header, &[0x1000, 0, 0, 0, 0]);
    if dx10 {
        // The DX10 header: its format, a 2D texture, no array, no misc flags.
        u32s(&mut header, &[texture.format, 3, 0, 1, 0]);
    }
    header.extend_from_slice(rows);
    header
}

/// The texture's pixels as an RGBA image, if its format is one decoded here.
fn decode(texture: &RawTexture, rows: &[u8]) -> Option<Texture> {
    let (block, height) = (block_size(texture.format), texture.height as usize);
    if block == 0 {
        return Texture::from_pixels(texture.width, texture.height, texture.format, rows, None).ok();
    }
    let (width, blocks) = (texture.width as usize, texture.width.div_ceil(4) as usize);
    let mut rgba = vec![0u8; width * height * 4];
    for by in 0..height.div_ceil(4) {
        for bx in 0..blocks {
            let at = (by * blocks + bx) * block;
            let Some(data) = rows.get(at..at + block) else { return None };
            // Each block's four rows of four pixels.
            let pixels: [[u8; 4]; 16] = match texture.format {
                70..=72 => bc1(data, true),
                73..=75 => return None,
                76..=78 => bc3(data),
                79..=81 => bc4(data),
                82..=84 => bc5(data),
                _ => return None,
            };
            for (index, pixel) in pixels.into_iter().enumerate() {
                let (y, x) = (by * 4 + index / 4, bx * 4 + index % 4);
                if y >= height || x >= width {
                    continue;
                }
                let i = (y * width + x) * 4;
                rgba[i..i + 4].copy_from_slice(&pixel);
            }
        }
    }
    Some(Texture { width: texture.width, height: texture.height, rgba })
}

fn rgb565(value: u16) -> [u8; 3] {
    let expand = |bits: u16| ((bits << 3) | (bits >> 2)) as u8;
    [
        expand((value >> 11) & 0x1f),
        expand((value >> 5) & 0x3f),
        expand(value & 0x1f),
    ]
}

/// BC1's block: two colours (RGB565), then 2-bit indices; the first colour over the second means four
/// colours, else three and transparent.
fn bc1(data: &[u8], allow_alpha: bool) -> [[u8; 4]; 16] {
    let colour = |at: usize| u16::from_le_bytes([data[at], data[at + 1]]);
    let indices = u32::from_le_bytes([data[4], data[5], data[6], data[7]]);
    let [c0, c1] = [rgb565(colour(0)), rgb565(colour(2))];
    let mut palette = [[0u8; 4]; 4];
    palette[0] = [c0[0], c0[1], c0[2], 255];
    palette[1] = [c1[0], c1[1], c1[2], 255];
    if colour(0) > colour(2) || !allow_alpha {
        for channel in 0..3 {
            palette[2][channel] = ((2 * u16::from(c0[channel]) + u16::from(c1[channel])) / 3) as u8;
            palette[3][channel] = ((u16::from(c0[channel]) + 2 * u16::from(c1[channel])) / 3) as u8;
        }
        palette[2][3] = 255;
        palette[3][3] = 255;
    } else {
        for channel in 0..3 {
            palette[2][channel] = ((u16::from(c0[channel]) + u16::from(c1[channel])) / 2) as u8;
        }
        palette[2][3] = 255;
        palette[3] = [0, 0, 0, 0];
    }
    std::array::from_fn(|i| palette[((indices >> (2 * i)) & 3) as usize])
}

/// BC3's block: an 8-byte alpha block (two alphas, 3-bit indices) and a BC1 colour block of four colours.
fn bc3(data: &[u8]) -> [[u8; 4]; 16] {
    let mut pixels = bc1(&data[8..], false);
    // The alpha block's 16 three-bit indices, six bytes, the first pixel's lowest.
    let bits = data[2..8].iter().enumerate().fold(0u64, |bits, (index, byte)| {
        bits | (u64::from(*byte) << (8 * index))
    });
    for (index, pixel) in pixels.iter_mut().enumerate() {
        pixel[3] = alpha(data[0], data[1], ((bits >> (3 * index)) & 7) as u8);
    }
    pixels
}

fn alpha(a0: u8, a1: u8, index: u8) -> u8 {
    if index == 0 {
        return a0;
    }
    if index == 1 {
        return a1;
    }
    let (a0, a1) = (u32::from(a0), u32::from(a1));
    let value = if a0 > a1 {
        let index = u32::from(index) - 2;
        (a0 * (7 - index) + a1 * index) / 7
    } else {
        match index {
            2..=5 => {
                let index = u32::from(index) - 2;
                (a0 * (5 - index) + a1 * index) / 5
            }
            6 => 0,
            _ => 255,
        }
    };
    value.min(255) as u8
}

/// BC4's block: one alpha channel as BC3's block's alpha half, shown as grey.
fn bc4(data: &[u8]) -> [[u8; 4]; 16] {
    let bits = data[2..8].iter().enumerate().fold(0u64, |bits, (index, byte)| {
        bits | (u64::from(*byte) << (8 * index))
    });
    std::array::from_fn(|index| {
        let value = alpha(data[0], data[1], ((bits >> (3 * index)) & 7) as u8);
        [value, value, value, 255]
    })
}

/// BC5's block: two alpha channels as BC4's (a normal map's x and y), the third taken from the unit length.
fn bc5(data: &[u8]) -> [[u8; 4]; 16] {
    let (x, y) = (bc4(&data[..8]), bc4(&data[8..]));
    std::array::from_fn(|index| {
        let [nx, _, _, _] = x[index];
        let ny = y[index][1];
        let (nx, ny) = (f64::from(nx) / 127.5 - 1.0, f64::from(ny) / 127.5 - 1.0);
        let nz = (1.0 - nx * nx - ny * ny).max(0.0).sqrt();
        [((nx + 1.0) * 127.5) as u8, ((ny + 1.0) * 127.5) as u8, ((nz + 1.0) * 127.5) as u8, 255]
    })
}
