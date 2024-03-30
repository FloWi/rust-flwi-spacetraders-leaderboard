use std::collections::HashSet;
use std::error::Error;

use chrono::{Local, NaiveDate};
use futures::future::join_all;
use itertools::Itertools;
use sqlx::sqlite::SqlitePoolOptions;
use tracing::{event, Level};
use tracing_subscriber::fmt::format::FmtSpan;

use model::{AgentSymbol, FactionSymbol, SystemSymbol, WaypointSymbol};

use crate::db::{
    insert_job_run_and_details, load_or_create_reset_date, save_construction_sites,
    save_static_agent_infos, select_construction_sites_for_reset,
    select_static_agent_infos_for_reset, DbConstructionSite, DbStaticAgentInfo,
};
use crate::leaderboard_model::{
    LeaderboardCurrentAgentInfo, LeaderboardCurrentConstructionInfo, LeaderboardStaticAgentInfo,
};
use crate::model::StStatusResponse;
use crate::reqwest_helpers::create_client;
use crate::st_client::StClient;

mod leaderboard_model;
mod model;
mod pagination;
mod polars_helper;
mod polars_playground;
mod reqwest_helpers;
mod st_client;

mod db;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let reqwest_client_with_middleware = create_client();
    let client = StClient::new(reqwest_client_with_middleware);

    tracing_subscriber::fmt()
        .with_span_events(FmtSpan::CLOSE)
        .init();

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
        "Of these {num} agent_symbols are new: {infos:?}",
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

    event!(
        Level::INFO,
        "Downloading current infos for {num_agents} agents and {num_construction_sites} construction sites",
        num_agents = static_agent_info_results.len(),
        num_construction_sites = construction_sites.len(),
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

    panic!("early exit");

    // TODO: Figure out how type-inference works with Vec<Future<Result<Foo, Err>>>

    let jump_gate_waypoints: Vec<WaypointSymbol> = static_agent_info_results
        .clone()
        .into_iter()
        .map(|sad| sad.jump_gate)
        .unique()
        .collect();

    let construction_site_futures: Vec<_> = jump_gate_waypoints
        .iter()
        .map(|a| get_current_construction(&client, a.clone()))
        .collect();

    let num_construction_sites = construction_site_futures.len();
    event!(
        Level::INFO,
        "Downloading construction site infos for {} jump gates",
        num_construction_sites
    );

    let construction_site_results: Result<Vec<LeaderboardCurrentConstructionInfo>, Box<dyn Error>> =
        join_all(construction_site_futures)
            .await
            .into_iter()
            .collect();

    let construction_site_results = construction_site_results?;

    event!(
        Level::INFO,
        "Done downloading construction site infos for {} jump gates",
        num_construction_sites
    );

    event!(
        Level::INFO,
        "found static agent infos for {} agents",
        static_agent_info_results.len()
    );
    for r in &static_agent_info_results {
        event!(Level::INFO, "{:?}", r)
    }

    event!(
        Level::INFO,
        "found {} distinct jump-gate waypoints",
        num_construction_sites
    );
    for r in &construction_site_results {
        event!(Level::INFO, "{:?}", r)
    }

    let num_completed_jump_gates = &construction_site_results
        .iter()
        .clone()
        .filter(|c| c.is_complete)
        .count();

    event!(
        Level::INFO,
        "{} out of {} jump gates are completed",
        num_completed_jump_gates,
        num_construction_sites
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
) -> Result<Vec<LeaderboardStaticAgentInfo>, Box<dyn Error>> {
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

    let static_agent_info_results: Result<Vec<LeaderboardStaticAgentInfo>, Box<dyn Error>> =
        joined.into_iter().collect();

    static_agent_info_results
}

async fn collect_data(
    client: &StClient,
    static_agent_infos: Vec<DbStaticAgentInfo>,
    construction_sites: Vec<DbConstructionSite>,
) -> Result<
    (
        Vec<LeaderboardCurrentAgentInfo>,
        Vec<LeaderboardCurrentConstructionInfo>,
    ),
    Box<dyn Error>,
> {
    let current_agent_infos = collect_current_agent_infos(client, static_agent_infos).await?;
    let current_construction_infos =
        collect_current_construction_infos(client, construction_sites).await?;

    Ok((current_agent_infos, current_construction_infos))
}

async fn collect_current_agent_infos(
    client: &StClient,
    static_agent_infos: Vec<DbStaticAgentInfo>,
) -> Result<Vec<LeaderboardCurrentAgentInfo>, Box<dyn Error>> {
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
) -> Result<Vec<LeaderboardCurrentConstructionInfo>, Box<dyn Error>> {
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
) -> Result<LeaderboardStaticAgentInfo, Box<dyn Error>> {
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
) -> Result<LeaderboardCurrentAgentInfo, Box<dyn Error>> {
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
) -> Result<LeaderboardCurrentConstructionInfo, Box<dyn Error>> {
    let construction_site_info = client.get_construction_site(&waypoint_symbol).await?.data;
    Ok(LeaderboardCurrentConstructionInfo {
        symbol: waypoint_symbol.clone(),
        materials: construction_site_info.materials,
        is_complete: construction_site_info.is_complete,
    })
}
