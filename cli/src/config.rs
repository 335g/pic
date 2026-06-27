use anyhow::{Context, Result};
use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
pub struct Config {
    pub r2: R2Config,
    pub api: ApiConfig,
}

#[derive(Debug, Deserialize, Clone)]
pub struct R2Config {
    pub endpoint: String,
    pub bucket: String,
    pub access_key_id: String,
    pub secret_access_key: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ApiConfig {
    pub endpoint: String,
    pub shared_secret: String,
}

impl Config {
    pub fn load() -> Result<Self> {
        let config_dir = dirs::home_dir()
            .context("Cannot find home directory")?
            .join(".pic");

        let config_path = config_dir.join("config.toml");

        if !config_path.exists() {
            anyhow::bail!(
                "Config file not found at {}. Please create it. See --help for config format.",
                config_path.display()
            );
        }

        let content = std::fs::read_to_string(&config_path)
            .with_context(|| format!("Failed to read config at {}", config_path.display()))?;

        let config: Config = toml::from_str(&content)
            .with_context(|| format!("Failed to parse config at {}", config_path.display()))?;

        Ok(config)
    }
}
