use std::collections::HashSet;
use std::error::Error;
use std::time::Duration;

use anyhow::Result;
use chrono::{Local, NaiveDate};
use futures::future::join_all;
use itertools::Itertools;
use sqlx::sqlite::SqlitePoolOptions;
use tokio_cron_scheduler::{Job, JobScheduler};
use tracing::{event, Level};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

use model::{AgentSymbol, FactionSymbol, SystemSymbol, WaypointSymbol};

use crate::db::{
    insert_job_run_and_details, load_or_create_reset_date, save_construction_sites,
    save_static_agent_infos, select_construction_sites_for_reset,
    select_static_agent_infos_for_reset, DbConstructionSite, DbStaticAgentInfo,
};
use crate::leaderboard_model::{
    LeaderboardCurrentAgentInfo, LeaderboardCurrentConstructionInfo, LeaderboardStaticAgentInfo,
};
use crate::model::{GetMeta, StStatusResponse};
use crate::pagination::paginate;
use crate::reqwest_helpers::create_client;
use crate::st_client::StClient;

mod leaderboard_model;
mod model;
mod pagination;
mod reqwest_helpers;
mod st_client;

mod db;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(EnvFilter::from_default_env())
        .init();

    let mut sched = JobScheduler::new().await?;

    // Add async job
    sched
        .add(Job::new_async("0 */5 * * * *", |uuid, mut l| {
            Box::pin(async move {
                let reqwest_client_with_middleware = create_client();
                let client = StClient::new(reqwest_client_with_middleware);

                let _ = perform_tick(&client).await;

                // Query the next execution time for this job
                let next_tick = l.next_tick_for_job(uuid).await;
                match next_tick {
                    Ok(Some(ts)) => event!(Level::INFO, "Next time for 5min job is {:?}", ts),
                    _ => event!(Level::INFO, "Could not get next tick for 5min job"),
                }
            })
        })?)
        .await?;

    // Start the scheduler
    sched.start().await?;

    // Just run the whole thing for 1h
    tokio::time::sleep(Duration::from_secs(60 * 60)).await;

    Ok(())
}

async fn perform_tick(client: &StClient) -> Result<()> {
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect("sqlite://data/flwi-leaderboard.db?mode=rwc")
        .await?;

    let st_status = client.get_status().await?;

    event!(Level::INFO, "Reset Date: {:?}", st_status.reset_date);
    event!(Level::INFO, "{:?}", st_status.stats);

    let now = Local::now().naive_utc();

    let reset_date = NaiveDate::parse_from_str(st_status.reset_date.as_str(), "%Y-%m-%d").unwrap();

    let reset_date_db = load_or_create_reset_date(&pool, reset_date, now).await?;
    event!(Level::INFO, "Using reset_date_db {:?}", reset_date_db);
    let static_agent_infos: Vec<DbStaticAgentInfo> =
        select_static_agent_infos_for_reset(&pool, reset_date_db).await?;

    event!(
        Level::INFO,
        "Got these {num} static_agent_infos {infos:?}",
        num = static_agent_infos.len(),
        infos = static_agent_infos
    );

    let new_agent_symbols = determine_missing_agent_symbols(st_status, static_agent_infos);

    event!(
        Level::INFO,
        "{num} agent_symbols are new: {infos:?}",
        num = new_agent_symbols.len(),
        infos = new_agent_symbols
    );

    event!(
        Level::INFO,
        "Done downloading static infos for {num_agents} agents",
        num_agents = new_agent_symbols.len()
    );

    let static_agent_info_results = load_static_agent_infos(&client, new_agent_symbols).await?;
    save_construction_sites(&pool, reset_date_db, static_agent_info_results.clone()).await;
    let construction_sites = select_construction_sites_for_reset(&pool, reset_date_db).await?;
    save_static_agent_infos(
        &pool,
        reset_date_db,
        static_agent_info_results.clone(),
        construction_sites.clone(),
        now,
    )
    .await;

    let static_agent_infos: Vec<DbStaticAgentInfo> =
        select_static_agent_infos_for_reset(&pool, reset_date_db).await?;

    let num_agents = static_agent_infos.len();
    let num_construction_sites = construction_sites.len();

    event!(
        Level::INFO,
        "Downloading current infos for {num_agents} agents and {num_construction_sites} construction sites",
    );

    let (current_agent_entries, current_construction_entries) =
        collect_data(&client, static_agent_infos.clone(), construction_sites).await?;

    let db_construction_infos = select_construction_sites_for_reset(&pool, reset_date_db).await?;

    let _ = insert_job_run_and_details(
        &pool,
        now,
        reset_date_db,
        current_agent_entries,
        static_agent_infos.clone(),
        current_construction_entries,
        db_construction_infos,
    )
    .await;

    event!(
        Level::INFO,
        "Done collecting current infos for {num_agents} agents and {num_construction_sites} construction sites",
    );

    Ok(())
}

fn determine_missing_agent_symbols(
    st_status: StStatusResponse,
    static_agent_infos: Vec<DbStaticAgentInfo>,
) -> Vec<String> {
    let leading_credit_agents: Vec<String> = st_status
        .leaderboards
        .most_credits
        .iter()
        .map(|x| x.agent_symbol.clone())
        .collect();
    let leading_chart_agents: Vec<String> = st_status
        .leaderboards
        .most_submitted_charts
        .iter()
        .map(|x| x.agent_symbol.clone())
        .collect();

    let new_agent_symbols = [leading_chart_agents, leading_credit_agents]
        .concat()
        .into_iter()
        .unique();

    let known_agent_symbols: HashSet<_> = static_agent_infos
        .iter()
        .map(|a| a.agent_symbol.clone())
        .collect();

    new_agent_symbols
        .filter(|sym| !known_agent_symbols.contains(sym))
        .collect()
}

async fn load_static_agent_infos(
    client: &StClient,
    agent_symbols: Vec<String>,
) -> Result<Vec<LeaderboardStaticAgentInfo>> {
    let static_agent_futures: Vec<_> = agent_symbols
        .iter()
        .map(|a| get_static_agent_info(&client, AgentSymbol(a.to_string())))
        .collect();

    let num_agents = static_agent_futures.len();
    event!(
        Level::INFO,
        "Downloading static infos for {} agents",
        num_agents
    );

    let joined = join_all(static_agent_futures).await;

    let static_agent_info_results: Result<Vec<LeaderboardStaticAgentInfo>> =
        joined.into_iter().collect();

    static_agent_info_results
}

async fn collect_data(
    client: &StClient,
    static_agent_infos: Vec<DbStaticAgentInfo>,
    construction_sites: Vec<DbConstructionSite>,
) -> Result<(
    Vec<LeaderboardCurrentAgentInfo>,
    Vec<LeaderboardCurrentConstructionInfo>,
)> {
    let current_agent_infos = collect_current_agent_infos(client, static_agent_infos).await?;
    let current_construction_infos =
        collect_current_construction_infos(client, construction_sites).await?;

    Ok((current_agent_infos, current_construction_infos))
}

async fn collect_current_agent_infos(
    client: &StClient,
    static_agent_infos: Vec<DbStaticAgentInfo>,
) -> Result<Vec<LeaderboardCurrentAgentInfo>> {
    let current_agent_futures: Vec<_> = static_agent_infos
        .clone()
        .into_iter()
        .map(|a| get_current_agent_info(&client, AgentSymbol(a.agent_symbol)))
        .collect();

    join_all(current_agent_futures).await.into_iter().collect()
}

async fn collect_current_construction_infos(
    client: &StClient,
    construction_sites: Vec<DbConstructionSite>,
) -> Result<Vec<LeaderboardCurrentConstructionInfo>> {
    let current_agent_futures: Vec<_> = construction_sites
        .clone()
        .into_iter()
        .map(|cs| get_current_construction(&client, WaypointSymbol(cs.jump_gate_waypoint_symbol)))
        .collect();

    join_all(current_agent_futures).await.into_iter().collect()
}

fn extract_system_symbol(waypoint_symbol: &WaypointSymbol) -> SystemSymbol {
    let parts: Vec<&str> = waypoint_symbol.0.split('-').collect();
    // Join the first two parts with '-'
    let first_two_parts = parts[..2].join("-");
    SystemSymbol(first_two_parts)
}

async fn get_static_agent_info(
    client: &StClient,
    agent_symbol: AgentSymbol,
) -> Result<LeaderboardStaticAgentInfo> {
    let agent_info = client.get_public_agent(&agent_symbol).await?.data;
    let headquarters = WaypointSymbol(agent_info.headquarters);
    let system_symbol = extract_system_symbol(&headquarters);
    let jump_gate_waypoints = client
        .get_waypoints_of_type_jump_gate(system_symbol)
        .await?;
    let wp = &jump_gate_waypoints.data.get(0).unwrap();
    Ok(LeaderboardStaticAgentInfo {
        symbol: AgentSymbol(agent_info.symbol),
        headquarters: headquarters,
        starting_faction: FactionSymbol(agent_info.starting_faction),
        jump_gate: WaypointSymbol(wp.symbol.to_string()),
    })
}

async fn get_current_agent_info(
    client: &StClient,
    agent_symbol: AgentSymbol,
) -> Result<LeaderboardCurrentAgentInfo> {
    let agent_info = client.get_public_agent(&agent_symbol).await?.data;
    Ok(LeaderboardCurrentAgentInfo {
        symbol: agent_symbol,
        credits: agent_info.credits,
        ship_count: agent_info.ship_count,
    })
}

async fn get_current_construction(
    client: &StClient,
    waypoint_symbol: WaypointSymbol,
) -> Result<LeaderboardCurrentConstructionInfo> {
    let construction_site_info = client.get_construction_site(&waypoint_symbol).await?.data;
    Ok(LeaderboardCurrentConstructionInfo {
        symbol: waypoint_symbol.clone(),
        materials: construction_site_info.materials,
        is_complete: construction_site_info.is_complete,
    })
}

// example for paginated fetching
async fn download_all_agents(client: &StClient) -> Result<()> {
    event!(Level::INFO, "Downloading all agents");

    let results = paginate(|p| client.list_agents_page(p)).await;

    let headquarters: Vec<String> = results
        .iter()
        .flat_map(|page| &page.data)
        .into_iter()
        .map(|a| a.headquarters.clone())
        .unique()
        .collect();

    event!(
        Level::INFO,
        "Done downloading all agents: Agents: {num_agents}, Number of distinct headquarters: {num_distinct_headquarters}",
        num_agents = results.len(),
        num_distinct_headquarters = headquarters.len()
    );

    Ok(())
}
