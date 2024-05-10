use std::path::PathBuf;

use clap::{Parser, Subcommand};

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
    },
}
