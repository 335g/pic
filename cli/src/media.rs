use anyhow::{Context, Result};
use chrono::{DateTime, FixedOffset};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize, Clone)]
pub struct MediaInfo {
    pub filename: String,
    pub file_size: u64,
    pub media_type: MediaType,
    pub mime_type: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub taken_at: DateTime<FixedOffset>,
    pub extension: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaType {
    Photo,
    Video,
}

/// Determine the media type from the file extension.
pub fn classify_media(path: &Path) -> Option<MediaType> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "jpg" | "jpeg" | "png" | "heic" | "heif" | "webp" | "gif" | "bmp" | "tiff" | "tif" => {
            Some(MediaType::Photo)
        }
        "mov" | "mp4" | "avi" | "mkv" | "webm" | "m4v" | "3gp" => Some(MediaType::Video),
        _ => None,
    }
}

/// Extract media metadata from a file path.
pub fn extract_media_info(path: &Path) -> Result<MediaInfo> {
    let filename = path
        .file_name()
        .context("Invalid file path")?
        .to_string_lossy()
        .to_string();

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .context("File has no extension")?
        .to_lowercase();

    let media_type = classify_media(path).context("Unsupported file type")?;

    let mime_type = mime_guess::from_ext(&ext)
        .first_or_octet_stream()
        .to_string();

    let file_size = std::fs::metadata(path)
        .with_context(|| format!("Failed to read metadata for {}", path.display()))?
        .len();

    // Extract shooting date from Exif for photos, or file metadata for videos
    let taken_at = extract_taken_at(path, &media_type)?;

    // Extract dimensions
    let (width, height) = extract_dimensions(path, &media_type)?;

    Ok(MediaInfo {
        filename,
        file_size,
        media_type,
        mime_type,
        width,
        height,
        taken_at,
        extension: ext,
    })
}

fn extract_taken_at(path: &Path, media_type: &MediaType) -> Result<DateTime<FixedOffset>> {
    match media_type {
        MediaType::Photo => {
            // Try Exif first
            if let Ok(taken) = extract_exif_datetime(path) {
                return Ok(taken);
            }
            // Fall back to file modification time
            let mtime = std::fs::metadata(path)
                .and_then(|m| m.modified())
                .context("Failed to read file modification time")?;
            let dt: DateTime<FixedOffset> = chrono::DateTime::<chrono::Utc>::from(mtime).into();
            Ok(dt)
        }
        MediaType::Video => {
            // Use file modification time as fallback
            // (Advanced: could use ffmpeg to extract creation_time metadata)
            let mtime = std::fs::metadata(path)
                .and_then(|m| m.modified())
                .context("Failed to read file modification time")?;
            let dt: DateTime<FixedOffset> = chrono::DateTime::<chrono::Utc>::from(mtime).into();
            Ok(dt)
        }
    }
}

fn extract_exif_datetime(path: &Path) -> Result<DateTime<FixedOffset>> {
    let file = std::fs::File::open(path)?;
    let mut bufreader = std::io::BufReader::new(&file);
    let exif_reader = exif::Reader::new();
    let exif = exif_reader.read_from_container(&mut bufreader)?;

    if let Some(field) = exif.get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY) {
        let value = field.display_value().to_string();
        // Parse format: "2024-01-15 10:30:00" or similar
        if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&value, "%Y-%m-%d %H:%M:%S") {
            // Assume local timezone (we don't have TZ info from Exif)
            let local_offset = chrono::Local::now().offset().clone();
            let dt_fixed: DateTime<FixedOffset> =
                dt.and_local_timezone(local_offset).single().unwrap();
            return Ok(dt_fixed);
        }
    }
    anyhow::bail!("No DateTimeOriginal in Exif data");
}

fn extract_dimensions(
    path: &Path,
    media_type: &MediaType,
) -> Result<(Option<u32>, Option<u32>)> {
    match media_type {
        MediaType::Photo => {
            // Try to get dimensions from image headers without decoding the whole file
            let reader = image::ImageReader::open(path)
                .with_context(|| format!("Failed to open image: {}", path.display()))?;

            // For HEIC files, the `image` crate doesn't support it directly,
            // so we handle this in thumbnail generation. Skip dimensions here.
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            if ext == "heic" || ext == "heif" {
                return Ok((None, None));
            }

            if let Ok(dims) = reader.into_dimensions() {
                return Ok((Some(dims.0), Some(dims.1)));
            }
            Ok((None, None))
        }
        MediaType::Video => Ok((None, None)),
    }
}
