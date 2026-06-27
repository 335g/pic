use anyhow::{Context, Result};
use serde::Serialize;

use crate::config::Config;
use crate::upload::UploadResult;

/// Register uploaded media metadata with the Backend.
pub async fn notify_backend(
    config: &Config,
    result: &UploadResult,
) -> Result<()> {
    let url = format!("{}/api/media", config.api.endpoint.trim_end_matches('/'));

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("CF-Access-Client-Id", &config.api.cf_access_client_id)
        .header("CF-Access-Client-Secret", &config.api.cf_access_client_secret)
        .json(&RegisterMediaRequest {
            id: result.id.clone(),
            filename: result.filename.clone(),
            object_key: result.object_key.clone(),
            thumbnail_key: result.thumbnail_key.clone(),
            file_size: result.file_size as i64,
            media_type: result.media_type.clone(),
            mime_type: result.mime_type.clone(),
            width: result.width,
            height: result.height,
            taken_at: result.taken_at.clone(),
        })
        .send()
        .await
        .context("Failed to notify Backend")?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        anyhow::bail!("Backend registration failed ({}): {}", status, body);
    }

    log::info!("Registered {} with Backend", result.filename);
    Ok(())
}

#[derive(Debug, Serialize)]
struct RegisterMediaRequest {
    id: String,
    filename: String,
    object_key: String,
    thumbnail_key: String,
    file_size: i64,
    media_type: String,
    mime_type: String,
    width: Option<u32>,
    height: Option<u32>,
    taken_at: String,
}
