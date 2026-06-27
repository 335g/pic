use anyhow::{Context, Result};
use image::imageops::FilterType;
use image::GenericImageView;
use libheif_rs::{ColorSpace, HeifContext, LibHeif, RgbChroma};
use std::path::Path;

use crate::media::MediaType;

/// Thumbnail generation parameters
const THUMBNAIL_MAX_DIMENSION: u32 = 400;

/// Generate a thumbnail as JPEG bytes from a media file.
pub fn generate_thumbnail(path: &Path, media_type: &MediaType) -> Result<Vec<u8>> {
    match media_type {
        MediaType::Photo => generate_photo_thumbnail(path),
        MediaType::Video => generate_video_thumbnail(path),
    }
}

/// Generate thumbnail from a photo file.
fn generate_photo_thumbnail(path: &Path) -> Result<Vec<u8>> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    // HEIC/HEIF needs special handling via libheif-rs
    if ext == "heic" || ext == "heif" {
        return generate_heic_thumbnail(path);
    }

    // Standard formats supported by the `image` crate
    let dyn_img = image::open(path)
        .with_context(|| format!("Failed to decode image: {}", path.display()))?;

    let thumb = resize_image(&dyn_img);
    let mut output = Vec::new();
    thumb
        .write_to(
            &mut std::io::Cursor::new(&mut output),
            image::ImageFormat::Jpeg,
        )
        .context("Failed to encode JPEG thumbnail")?;

    Ok(output)
}

/// Generate thumbnail from a HEIC file using libheif-rs.
fn generate_heic_thumbnail(path: &Path) -> Result<Vec<u8>> {
    let path_str = path.to_string_lossy();
    let ctx = HeifContext::read_from_file(&path_str)
        .with_context(|| format!("Failed to read HEIC file: {}", path_str))?;
    let handle = ctx.primary_image_handle()?;

    let lib_heif = LibHeif::new();
    // Decode as RGB for easier conversion to the image crate
    let image = lib_heif
        .decode(&handle, ColorSpace::Rgb(RgbChroma::C444), None)
        .context("Failed to decode HEIC image")?;

    let width = image.width();
    let height = image.height();
    let planes = image.planes();

    // For RGB C444, we get separate R, G, B planes
    let r_plane = planes.r.context("Missing R plane in HEIC decode")?;
    let g_plane = planes.g.context("Missing G plane in HEIC decode")?;
    let b_plane = planes.b.context("Missing B plane in HEIC decode")?;

    let mut rgba = Vec::with_capacity(width as usize * height as usize * 4);
    for y in 0..height {
        for x in 0..width {
            let r_idx = (y as usize) * r_plane.stride + (x as usize);
            let g_idx = (y as usize) * g_plane.stride + (x as usize);
            let b_idx = (y as usize) * b_plane.stride + (x as usize);
            rgba.push(r_plane.data[r_idx]);
            rgba.push(g_plane.data[g_idx]);
            rgba.push(b_plane.data[b_idx]);
            rgba.push(255); // Alpha
        }
    }

    let img = image::RgbaImage::from_raw(width, height, rgba)
        .context("Failed to create RgbaImage from HEIC data")?;

    let dyn_img = image::DynamicImage::from(img);
    let thumb = resize_image(&dyn_img);
    let mut output = Vec::new();
    thumb
        .write_to(
            &mut std::io::Cursor::new(&mut output),
            image::ImageFormat::Jpeg,
        )
        .context("Failed to encode JPEG thumbnail")?;

    Ok(output)
}

/// Generate thumbnail from a video by extracting the first frame via ffmpeg.
fn generate_video_thumbnail(path: &Path) -> Result<Vec<u8>> {
    // Use ffmpeg to extract first frame as JPEG
    let output = std::process::Command::new("ffmpeg")
        .args([
            "-y",
            "-ss",
            "0",
            "-i",
            &path.to_string_lossy(),
            "-vframes",
            "1",
            "-f",
            "image2pipe",
            "-vcodec",
            "mjpeg",
            "-",
        ])
        .output()
        .context("Failed to run ffmpeg. Is ffmpeg installed?")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("ffmpeg failed: {}", stderr);
    }

    if output.stdout.is_empty() {
        anyhow::bail!("ffmpeg produced no output");
    }

    // Load the extracted JPEG frame and resize if needed
    let dyn_img = image::load_from_memory(&output.stdout)
        .context("Failed to decode ffmpeg output as JPEG")?;

    let thumb = resize_image(&dyn_img);
    let mut result = Vec::new();
    thumb
        .write_to(
            &mut std::io::Cursor::new(&mut result),
            image::ImageFormat::Jpeg,
        )
        .context("Failed to encode JPEG thumbnail")?;

    Ok(result)
}

/// Resize an image to fit within THUMBNAIL_MAX_DIMENSION while maintaining aspect ratio.
fn resize_image(img: &image::DynamicImage) -> image::DynamicImage {
    let (w, h) = img.dimensions();
    let max_dim = w.max(h);

    if max_dim <= THUMBNAIL_MAX_DIMENSION {
        return img.clone();
    }

    let scale = THUMBNAIL_MAX_DIMENSION as f64 / max_dim as f64;
    let new_w = (w as f64 * scale).round() as u32;
    let new_h = (h as f64 * scale).round() as u32;

    img.resize(new_w, new_h, FilterType::Lanczos3)
}
