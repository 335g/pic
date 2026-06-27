use std::path::PathBuf;

use anyhow::{Context, Result};

use clap::{Parser, Subcommand};
use indicatif::{ProgressBar, ProgressStyle};
use walkdir::WalkDir;

mod api;
mod config;
mod media;
mod thumbnail;
mod upload;

#[derive(Parser)]
#[command(name = "pic", version, about = "Upload photos and videos to Cloudflare R2")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Upload media files to R2
    Upload {
        /// Files or directories to upload
        #[arg(required = true)]
        paths: Vec<PathBuf>,

        /// Keep local files after successful upload (default: delete)
        #[arg(long)]
        keep: bool,

        /// Show what would be uploaded without actually uploading
        #[arg(long)]
        dry_run: bool,

        /// Verbose output
        #[arg(short, long)]
        verbose: bool,
    },
    /// Show upload status
    Status,
}

#[tokio::main]
async fn main() -> Result<()> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let cli = Cli::parse();

    match cli.command {
        Command::Upload {
            paths,
            keep,
            dry_run,
            verbose,
        } => {
            if verbose {
                log::set_max_level(log::LevelFilter::Debug);
            }
            cmd_upload(paths, keep, dry_run).await?;
        }
        Command::Status => {
            cmd_status().await?;
        }
    }

    Ok(())
}

async fn cmd_upload(paths: Vec<PathBuf>, keep: bool, dry_run: bool) -> Result<()> {
    let cfg = config::Config::load()?;

    // Collect all media files from the given paths
    let files: Vec<PathBuf> = paths
        .into_iter()
        .flat_map(|p| {
            if p.is_dir() {
                WalkDir::new(p)
                    .into_iter()
                    .filter_map(|e| e.ok())
                    .map(|e| e.path().to_path_buf())
                    .collect()
            } else {
                vec![p]
            }
        })
        .filter(|p| media::classify_media(p).is_some())
        .collect();

    if files.is_empty() {
        log::warn!("No supported media files found.");
        return Ok(());
    }

    log::info!("Found {} media file(s)", files.len());

    if dry_run {
        for file in &files {
            let info = media::extract_media_info(file)?;
            let date_path = upload::format_date_path(&info.taken_at);
            log::info!(
                "[DRY RUN] Would upload: {} → {}/{{uuid}}.{}/{{uuid}}_thumb.jpg",
                info.filename,
                date_path,
                info.extension
            );
        }
        return Ok(());
    }

    let pb = ProgressBar::new(files.len() as u64);
    pb.set_style(
        ProgressStyle::default_bar()
            .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} ({eta})")
            .context("Progress bar template error")?
            .progress_chars("#>-"),
    );

    let mut success_count = 0;
    let mut fail_count = 0;

    for file in &files {
        pb.set_message(file.to_string_lossy().to_string());

        match process_file(&cfg, file).await {
            Ok(_) => {
                success_count += 1;
                pb.inc(1);

                // Delete local file after successful upload unless --keep
                if !keep {
                    if let Err(e) = std::fs::remove_file(file) {
                        log::warn!("Failed to delete {}: {}", file.display(), e);
                    } else {
                        log::debug!("Deleted: {}", file.display());
                    }
                }
            }
            Err(e) => {
                log::error!("Failed to upload {}: {}", file.display(), e);
                fail_count += 1;
                pb.inc(1);
            }
        }
    }

    pb.finish_with_message(format!(
        "Done: {} succeeded, {} failed",
        success_count, fail_count
    ));

    if fail_count > 0 {
        anyhow::bail!("{} file(s) failed to upload", fail_count);
    }

    Ok(())
}

async fn process_file(cfg: &config::Config, path: &std::path::Path) -> Result<()> {
    let media_info = media::extract_media_info(path)?;

    // Upload to R2
    let result = upload::upload_media(cfg, path, &media_info).await?;

    // Notify Backend
    api::notify_backend(cfg, &result).await?;

    Ok(())
}

async fn cmd_status() -> Result<()> {
    let cfg = config::Config::load()?;
    log::info!("Configuration loaded from ~/.pic/config.toml");
    log::info!("R2 endpoint: {}", cfg.r2.endpoint);
    log::info!("R2 bucket: {}", cfg.r2.bucket);
    log::info!("API endpoint: {}", cfg.api.endpoint);
    Ok(())
}


