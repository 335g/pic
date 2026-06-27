use anyhow::{Context, Result};
use chrono::Datelike;
use serde::Serialize;
use uuid::Uuid;

use crate::config::Config;
use crate::media::{MediaInfo, MediaType};
use crate::thumbnail;

/// Upload result returned to be sent to the Backend.
#[derive(Debug, Serialize)]
pub struct UploadResult {
    pub id: String,
    pub filename: String,
    pub object_key: String,
    pub thumbnail_key: String,
    pub file_size: u64,
    pub media_type: String,
    pub mime_type: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub taken_at: String,
}

/// Upload a single media file (original + thumbnail) to R2.
pub async fn upload_media(
    config: &Config,
    path: &std::path::Path,
    media_info: &MediaInfo,
) -> Result<UploadResult> {
    let id = Uuid::new_v4().to_string();
    let date_path = format_date_path(&media_info.taken_at);
    let ext = &media_info.extension;
    let uuid_filename = format!("{}.{}", id, ext);

    // Construct R2 keys
    let object_key = format!("{}/{}", date_path, uuid_filename);
    let thumbnail_key = format!("{}/{}_thumb.jpg", date_path, id);

    let original_data = std::fs::read(path)
        .with_context(|| format!("Failed to read file: {}", path.display()))?;

    let thumbnail_data = thumbnail::generate_thumbnail(path, &media_info.media_type)
        .context("Failed to generate thumbnail")?;

    // Upload to R2
    let bucket = create_r2_bucket(&config)?;

    log::info!("Uploading {} to R2...", uuid_filename);
    let response = bucket
        .put_object(&object_key, &original_data)
        .await
        .context("Failed to upload original to R2")?;

    if response.status_code() != 200 {
        anyhow::bail!(
            "R2 upload failed with status: {}",
            response.status_code()
        );
    }

    log::info!("Uploading thumbnail for {}...", uuid_filename);
    let thumb_response = bucket
        .put_object(&thumbnail_key, &thumbnail_data)
        .await
        .context("Failed to upload thumbnail to R2")?;

    if thumb_response.status_code() != 200 {
        anyhow::bail!(
            "R2 thumbnail upload failed with status: {}",
            thumb_response.status_code()
        );
    }

    log::info!("Upload complete: {}", uuid_filename);

    Ok(UploadResult {
        id,
        filename: media_info.filename.clone(),
        object_key,
        thumbnail_key,
        file_size: media_info.file_size,
        media_type: match media_info.media_type {
            MediaType::Photo => "photo".to_string(),
            MediaType::Video => "video".to_string(),
        },
        mime_type: media_info.mime_type.clone(),
        width: media_info.width,
        height: media_info.height,
        taken_at: media_info.taken_at.to_rfc3339(),
    })
}

/// Create an R2-compatible S3 bucket instance from config.
fn create_r2_bucket(config: &Config) -> Result<s3::Bucket> {
    use s3::creds::Credentials;

    let credentials = Credentials::new(
        Some(&config.r2.access_key_id),
        Some(&config.r2.secret_access_key),
        None,
        None,
        None,
    )
    .context("Failed to create R2 credentials")?;

    let bucket = s3::Bucket::new(
        &config.r2.bucket,
        s3::Region::Custom {
            region: "auto".to_string(),
            endpoint: config.r2.endpoint.clone(),
        },
        credentials,
    )
    .context("Failed to create R2 bucket handle")?;

    // R2 uses path-style access
    Ok(*bucket.with_path_style())
}

/// Format a date-time into a path like "2026/06/27".
pub fn format_date_path(dt: &chrono::DateTime<chrono::FixedOffset>) -> String {
    format!("{:04}/{:02}/{:02}", dt.year(), dt.month(), dt.day())
}
