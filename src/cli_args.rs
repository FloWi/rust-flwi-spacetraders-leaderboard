use std::path::PathBuf;

use clap::{Parser, Subcommand};
use reqwest::Url;

#[derive(Parser)]
#[command(version, about, long_about = None)]
pub(crate) struct Cli {
    #[command(subcommand)]
    pub(crate) command: Commands,
}

#[derive(Subcommand)]
pub(crate) enum Commands {
    /// generates the openapi-spec into the specified path
    GenerateOpenapi {
        #[arg(short, long)]
        output_path: PathBuf,
    },

    /// serves static files from this folder
    RunServer {
        #[arg(long, env("LEADERBOARD_ASSET_DIR"))]
        asset_dir: Option<PathBuf>,

        #[arg(long, env("LEADERBOARD_DATABASE_URL"))]
        database_url: String,

        #[arg(long, env("LEADERBOARD_HOST"))]
        host: String,

        #[arg(long, env("LEADERBOARD_PORT"))]
        port: u16,

        #[arg(long, env("SPACE_TRADERS_BASE_URL"), value_parser = parse_url)]
        base_url: Url,
    },
}

fn parse_url(s: &str) -> Result<Url, String> {
    Url::parse(s).map_err(|e| e.to_string())
}
