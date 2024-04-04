use std::time::Duration;

use anyhow::Result;
use futures::join;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::{Pool, Sqlite};
use tokio_cron_scheduler::{Job, JobScheduler};
use tracing::{event, Level};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

use crate::leaderboard_collector::perform_tick;
use crate::leaderboard_config::LeaderboardConfig;
use crate::reqwest_helpers::create_client;
use crate::server::http_server;
use crate::st_client::StClient;

mod leaderboard_model;
mod model;
mod pagination;
mod reqwest_helpers;
mod st_client;

mod db;
mod leaderboard_collector;
mod leaderboard_config;
mod server;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(EnvFilter::from_default_env())
        .init();

    let cfg = LeaderboardConfig::from_env_vars()?;

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(cfg.database_url.as_str())
        .await?;

    let _ = join!(
        background_collect(pool.clone()),
        http_server(pool.clone(), cfg.bind_address())
    );

    Ok(())
}

async fn background_collect(pool: Pool<Sqlite>) -> Result<()> {
    let mut sched = JobScheduler::new().await?;

    // I don't know what I'm doing. `move`d stuff around, until the compiler was happy
    // Add async job
    let job = Job::new_async("0 */5 * * * *", move |uuid, mut l| {
        Box::pin({
            let clone_wars_pool = pool.clone();

            async move {
                let reqwest_client_with_middleware = create_client();
                let client = StClient::new(reqwest_client_with_middleware);

                let _ = perform_tick(&client, clone_wars_pool).await;

                // Query the next execution time for this job
                let next_tick = l.next_tick_for_job(uuid).await;
                match next_tick {
                    Ok(Some(ts)) => event!(Level::INFO, "Next time for 5min job is {:?}", ts),
                    _ => event!(Level::INFO, "Could not get next tick for 5min job"),
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
