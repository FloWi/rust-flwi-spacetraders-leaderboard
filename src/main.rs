use std::fs;
use std::time::Duration;

use anyhow::{Context, Error, Result};
use clap::Parser;
use futures::join;
use reqwest::Url;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::sqlx_macros::migrate;
use sqlx::{ConnectOptions, Executor, Pool, Sqlite};
use tokio_cron_scheduler::{Job, JobScheduler};
use tracing::log::LevelFilter;
use tracing::{event, Level};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};
use utoipa::OpenApi;

use crate::cli_args::{Cli, Commands};
use crate::leaderboard_collector::perform_tick;
use crate::reqwest_helpers::create_client;
use crate::server::http_server;
use crate::st_client::StClient;

mod leaderboard_model;
mod model;
mod pagination;
mod reqwest_helpers;
mod st_client;

mod cli_args;
mod db;
mod leaderboard_collector;

mod server;

#[tokio::main]
async fn main() -> Result<()> {
    let args = cli_args::Cli::parse();

    match args {
        Cli { command } => match command {
            Commands::GenerateOpenapi { output_path } => {
                let docs = server::leaderboard::ApiDoc::openapi()
                    .to_pretty_json()
                    .unwrap();
                fs::write(output_path, docs).unwrap();
                Ok(())
            }
            Commands::RunServer {
                asset_dir,
                database_url,
                host,
                port,
                base_url,
            } => {
                tracing_subscriber::registry()
                    .with(fmt::layer())
                    .with(EnvFilter::from_default_env())
                    .init();

                // I have a long-running query calculating the progress of the jump-gate construction.
                // I'm setting the warning threshold for slow queries to 60s to prevent log-spam.
                let database_connection_options: sqlx::sqlite::SqliteConnectOptions = database_url
                    .parse::<sqlx::sqlite::SqliteConnectOptions>()?
                    .log_slow_statements(LevelFilter::Warn, Duration::from_secs(60));

                let background_task_pool = SqlitePoolOptions::new()
                    .after_connect(|conn, _| {
                        Box::pin(async move {
                            // Set WAL mode explicitly
                            conn.execute("PRAGMA journal_mode=WAL").await?;
                            // Auto-checkpoint after this many pages (default is 1000)
                            // Lower this number if you want more frequent checkpoints
                            conn.execute("PRAGMA wal_autocheckpoint=1000").await?;
                            Ok(())
                        })
                    })
                    .max_connections(5)
                    .connect_with(database_connection_options)
                    .await?;

                event!(Level::INFO, "Migrating database if necessary");
                sqlx::migrate!().run(&background_task_pool).await?;
                event!(Level::INFO, "Done migrating database");

                let pool = SqlitePoolOptions::new()
                    .max_connections(5)
                    .connect(database_url.as_str())
                    .await?;

                let bind_address = format!("{}:{}", host, port);

                let _ = join!(
                    background_collect(background_task_pool.clone(), base_url),
                    http_server(pool.clone(), bind_address, asset_dir)
                );

                Ok(())
            }
        },
    }

    // couldn't figure out how to create separate binary that generates the openapi file, since my services require stuff from the db crate.
    // as a workaround I added this step
}

async fn background_collect(pool: Pool<Sqlite>, base_url: Url) -> Result<()> {
    let mut sched = JobScheduler::new().await?;

    // I don't know what I'm doing. `move`d stuff around, until the compiler was happy
    // Add async job
    let job = Job::new_async("0 */5 * * * *", move |uuid, mut l| {
        Box::pin({
            let clone_wars_pool = pool.clone();

            let base_url = base_url.clone();

            async move {
                let result = perform_tick(clone_wars_pool, base_url)
                    .await
                    .context("failed at perform_tick");

                match result {
                    Ok(_) => {}
                    Err(err) => {
                        event!(Level::ERROR, "Error during perform tick: {}", err)
                    }
                }

                // Query the next execution time for this job
                let next_tick = l.next_tick_for_job(uuid).await;
                match next_tick {
                    Ok(Some(ts)) => event!(Level::INFO, "Next time for 5min job is {:?}", ts),
                    _ => event!(Level::ERROR, "Could not get next tick for 5min job"),
                }
            }
        })
    })?;

    sched.add(job.clone()).await?;

    // Start the scheduler
    sched.start().await?;

    match sched.next_tick_for_job(job.guid()).await {
        Ok(Some(ts)) => event!(Level::INFO, "Next time for 5min job is {:?}", ts),
        _ => event!(Level::INFO, "Could not get next tick for 5min job"),
    }

    // Just run the whole thing forever
    tokio::time::sleep(Duration::MAX).await;

    Ok(())
}
