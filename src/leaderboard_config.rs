use anyhow::Result;
use serde::Deserialize;

#[derive(Deserialize, Debug)]
pub(crate) struct LeaderboardConfig {
    pub(crate) database_url: String,
    pub(crate) app_leaderboard_host: String,
    pub(crate) app_leaderboard_port: String,
}

impl LeaderboardConfig {
    pub(crate) fn from_env_vars() -> Result<LeaderboardConfig> {
        let cfg = envy::from_env::<LeaderboardConfig>()?;
        Ok(cfg)
    }

    pub(crate) fn bind_address(&self) -> String {
        format!(
            "{}:{}",
            self.app_leaderboard_host, self.app_leaderboard_port
        )
    }
}
