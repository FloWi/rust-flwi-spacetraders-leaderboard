use chrono::{Local, NaiveDate};
use futures::future::join_all;
use itertools::Itertools;
use reqwest_middleware::Result;

use model::{AgentSymbol, FactionSymbol, SystemSymbol, WaypointSymbol};

use crate::leaderboard_model::{
    LeaderboardCurrentAgentInfo, LeaderboardCurrentConstructionInfo, LeaderboardStaticAgentInfo,
};
use crate::reqwest_helpers::create_client;
use crate::st_client::StClient;

mod leaderboard_model;
mod model;
mod pagination;
mod polars_helper;
mod polars_playground;
mod reqwest_helpers;
mod st_client;

#[tokio::main]
async fn main() -> Result<()> {
    let reqwest_client_with_middleware = create_client();
    let client = StClient::new(reqwest_client_with_middleware);

    let st_status = client.get_status().await?;

    println!("Reset Date: {:?}", st_status.reset_date);
    println!("{:?}", st_status.stats);

    let static_agent_futures: Vec<_> = st_status
        .leaderboards
        .most_credits
        .iter()
        .map(|a| get_static_agent_info(&client, AgentSymbol(a.agent_symbol.to_string())))
        .collect();

    let num_agents = static_agent_futures.len();
    println!("Downloading static infos for {} agents", num_agents);

    let joined = join_all(static_agent_futures).await;

    let static_agent_info_results: Result<Vec<LeaderboardStaticAgentInfo>> =
        joined.into_iter().collect();

    let static_agent_info_results = static_agent_info_results?;

    println!("Done downloading static infos for {} agents", num_agents);
    let now = Local::now().naive_utc();

    let reset_date = NaiveDate::parse_from_str(st_status.reset_date.as_str(), "%Y-%m-%d").unwrap();

    // TODO: Figure out how type-inference works with Vec<Future<Result<Foo, Err>>>

    let current_agent_futures: Vec<_> = static_agent_info_results
        .clone()
        .into_iter()
        .map(|a: LeaderboardStaticAgentInfo| get_current_agent_info(&client, a.symbol))
        .collect();

    let current_agent_results: Result<Vec<LeaderboardCurrentAgentInfo>> =
        join_all(current_agent_futures).await.into_iter().collect();

    let current_agent_results = current_agent_results?;

    let jump_gate_waypoints: Vec<WaypointSymbol> = static_agent_info_results
        .clone()
        .into_iter()
        .map(|sad| sad.jump_gate)
        .unique()
        .collect();

    let construction_site_futures: Vec<_> = jump_gate_waypoints
        .iter()
        .map(|a| get_current_construction(&client, &a))
        .collect();

    let num_construction_sites = construction_site_futures.len();
    println!(
        "Downloading construction site infos for {} jump gates",
        num_construction_sites
    );

    let construction_site_results: Result<Vec<LeaderboardCurrentConstructionInfo>> =
        join_all(construction_site_futures)
            .await
            .into_iter()
            .collect();

    let construction_site_results = construction_site_results?;

    println!(
        "Done downloading construction site infos for {} jump gates",
        num_construction_sites
    );

    println!(
        "found static agent infos for {} agents",
        static_agent_info_results.len()
    );
    for r in &static_agent_info_results {
        println!("{:?}", r)
    }

    println!(
        "found {} distinct jump-gate waypoints",
        num_construction_sites
    );
    for r in &construction_site_results {
        println!("{:?}", r)
    }

    let num_completed_jump_gates = &construction_site_results
        .iter()
        .clone()
        .filter(|c| c.is_complete)
        .count();

    println!(
        "{} out of {} jump gates are completed",
        num_completed_jump_gates, num_construction_sites
    );

    polars_helper::create_and_write_polars_df(
        &static_agent_info_results,
        &current_agent_results,
        &construction_site_results,
        now,
        reset_date,
    );

    Ok(())
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
    waypoint_symbol: &WaypointSymbol,
) -> Result<LeaderboardCurrentConstructionInfo> {
    let construction_site_info = client.get_construction_site(&waypoint_symbol).await?.data;
    Ok(LeaderboardCurrentConstructionInfo {
        symbol: waypoint_symbol.clone(),
        materials: construction_site_info.materials,
        is_complete: construction_site_info.is_complete,
    })
}
