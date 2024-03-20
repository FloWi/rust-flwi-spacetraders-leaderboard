use std::future::Future;

use futures::future::join_all;
use itertools::Itertools;
use reqwest_middleware::{ClientWithMiddleware, Middleware, Result};

use model::{
    AgentInfoResponse, AgentSymbol, FactionSymbol, ListWaypointsInSystemResponse, StStatusResponse,
    SystemSymbol, WaypointSymbol,
};

use crate::leaderboard_model::{
    LeaderboardCurrentAgentInfo, LeaderboardCurrentConstructionInfo, LeaderboardStaticAgentInfo,
};
use crate::model::{GetConstructionResponse, GetMeta};
use crate::pagination::{paginate, PaginationInput};
use crate::reqwest_helpers::create_client;

mod leaderboard_model;
mod model;
mod pagination;
mod reqwest_helpers;

#[tokio::main]
async fn main() -> Result<()> {
    let client = create_client();

    let resp: StStatusResponse = client
        .get("https://api.spacetraders.io/v2/")
        .send()
        .await?
        .json()
        .await?;

    println!("{:?}", resp.stats);

    let system_symbol = SystemSymbol("X1-ND96".to_string());

    println!("testing pagination",);

    // PAGINATION PLAYGROUND
    let pages: Vec<ListWaypointsInSystemResponse> =
        paginate(|page| list_waypoints_of_system(&client, &system_symbol, page)).await;

    println!(
        "successfully downloaded {:?} pages of system-waypoints for system {}",
        pages.len(),
        &system_symbol.0
    );

    let futures: Vec<_> = resp
        .leaderboards
        .most_credits
        .iter()
        .map(|a| get_static_agent_info(&client, AgentSymbol(a.agent_symbol.to_string())))
        .collect();

    let num_agents = futures.len();
    println!("Downloading static infos for {} agents", num_agents);
    let static_agent_info_results: Vec<_> = join_all(futures).await.into_iter().collect();
    println!("Done downloading static infos for {} agents", num_agents);

    let jump_gate_waypoints: Vec<_> = static_agent_info_results
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
    let construction_site_results: Vec<_> = join_all(construction_site_futures)
        .await
        .into_iter()
        .collect();
    println!(
        "Done downloading construction site infos for {} jump gates",
        num_construction_sites
    );

    println!(
        "found static agent infos for {} agents",
        static_agent_info_results.len()
    );
    for r in static_agent_info_results {
        println!("{:?}", r)
    }

    println!(
        "found {} distinct jump-gate waypoints",
        num_construction_sites
    );
    for r in &construction_site_results {
        println!("{:?}", r)
    }

    let num_completed_jump_gates = construction_site_results
        .iter()
        .filter(|c| c.is_complete)
        .count();

    println!(
        "{} out of {} jump gates are completed",
        num_completed_jump_gates, num_construction_sites
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
    client: &ClientWithMiddleware,
    agent_symbol: AgentSymbol,
) -> LeaderboardStaticAgentInfo {
    let agent_info = get_public_agent(&client, &agent_symbol).await.data;
    let headquarters = WaypointSymbol(agent_info.headquarters);
    let system_symbol = extract_system_symbol(&headquarters);
    let jump_gate_waypoints = get_waypoints_of_type_jump_gate(&client, system_symbol).await;
    let wp = &jump_gate_waypoints.data.get(0).unwrap();
    LeaderboardStaticAgentInfo {
        symbol: AgentSymbol(agent_info.symbol),
        headquarters: headquarters,
        starting_faction: FactionSymbol(agent_info.starting_faction),
        jump_gate: WaypointSymbol(wp.symbol.to_string()),
    }
}

async fn get_current_agent_info(
    client: &ClientWithMiddleware,
    agent_symbol: AgentSymbol,
) -> LeaderboardCurrentAgentInfo {
    let agent_info = get_public_agent(&client, &agent_symbol).await.data;
    LeaderboardCurrentAgentInfo {
        symbol: agent_symbol,
        credits: agent_info.credits,
        ship_count: agent_info.ship_count,
    }
}

async fn get_current_construction(
    client: &ClientWithMiddleware,
    waypoint_symbol: &WaypointSymbol,
) -> LeaderboardCurrentConstructionInfo {
    let construction_site_info = get_construction_site(&client, &waypoint_symbol).await.data;
    LeaderboardCurrentConstructionInfo {
        symbol: waypoint_symbol.clone(),
        materials: construction_site_info.materials,
        is_complete: construction_site_info.is_complete,
    }
}

async fn get_public_agent(
    client: &ClientWithMiddleware,
    agent_symbol: &AgentSymbol,
) -> AgentInfoResponse {
    let resp = client
        .get(format!(
            "https://api.spacetraders.io/v2/agents/{}",
            agent_symbol.0
        ))
        .send()
        .await;
    let agent_info = resp.unwrap().json().await.unwrap();
    agent_info
}

async fn get_construction_site(
    client: &ClientWithMiddleware,
    waypoint_symbol: &WaypointSymbol,
) -> GetConstructionResponse {
    //--url https://api.spacetraders.io/v2/systems/X1-ND96/waypoints/X1-ND96-I52/construction \
    let resp = client
        .get(format!(
            "https://api.spacetraders.io/v2/systems/{}/waypoints/{}/construction",
            extract_system_symbol(&waypoint_symbol).0,
            waypoint_symbol.0
        ))
        .send()
        .await;
    let construction_site_info = resp.unwrap().json().await.unwrap();
    construction_site_info
}

async fn get_waypoints_of_type_jump_gate(
    client: &ClientWithMiddleware,
    system_symbol: SystemSymbol,
) -> ListWaypointsInSystemResponse {
    /*
     --url 'https://api.spacetraders.io/v2/systems/systemSymbol/waypoints?type=JUMP_GATE' \
    */
    let query_param_list = [("type", "JUMP_GATE")];
    let request = client
        .get(format!(
            "https://api.spacetraders.io/v2/systems/{}/waypoints",
            system_symbol.0
        ))
        .query(&query_param_list);
    let resp = request.send().await;

    //TODO: implement pagination
    resp.unwrap().json().await.unwrap()
}

async fn list_waypoints_of_system(
    client: &ClientWithMiddleware,
    system_symbol: &SystemSymbol,
    pagination_input: PaginationInput,
) -> ListWaypointsInSystemResponse {
    /*
     --url 'https://api.spacetraders.io/v2/systems/systemSymbol/waypoints?type=JUMP_GATE' \
    */
    /*
     --url 'https://api.spacetraders.io/v2/systems/X1-ND96/waypoints?page=1&limit=20&type=JUMP_GATE' \
    */

    let query_param_list = [
        ("page", pagination_input.page.to_string()),
        ("limit", pagination_input.limit.to_string()),
    ];

    let request = client
        .get(format!(
            "https://api.spacetraders.io/v2/systems/{}/waypoints",
            system_symbol.0
        ))
        .query(&query_param_list);

    let resp = request.send().await;

    resp.unwrap().json().await.unwrap()
}
