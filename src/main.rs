use std::sync::Arc;

use futures::future::join_all;
use governor::{DefaultDirectRateLimiter, Quota, RateLimiter};
use reqwest::{Client, Request};
use reqwest_middleware::{ClientBuilder, ClientWithMiddleware, Middleware, Next, Result};
use task_local_extensions::Extensions;

use model::{AgentInfoResponse, AgentSymbol, FactionSymbol, ListWaypointsInSystemResponse, StStatusResponse, SystemSymbol, WaypointSymbol};

use crate::leaderboard_model::LeaderboardStaticAgentInfo;

mod model;
mod leaderboard_model;

#[tokio::main]
async fn main() -> Result<()> {
    let reqwest_client = Client::builder().build().unwrap();

    let limiter = RateLimiter::direct(Quota::per_second(std::num::NonZeroU32::new(2u32).unwrap()));
    let arc_limiter = Arc::new(limiter);

    let middleware = RateLimitingMiddleware { limiter: arc_limiter };

    let client = ClientBuilder::new(reqwest_client)
        .with(middleware)
        .build();

    let resp: StStatusResponse = client.get("https://api.spacetraders.io/v2/")
        .send()
        .await?
        .json()
        .await?;

    println!("{:?}", resp.stats);

    let futures: Vec<_> = resp.leaderboards.most_credits.iter().map(|a| get_static_agent_info(&client, AgentSymbol(a.agent_symbol.to_string()))).collect();

    let results: Vec<_> = join_all(futures).await.into_iter().collect();

    for r in results {
        println!("{:?}", r)
    }


    Ok(())
}

fn extract_system_symbol(waypoint_symbol: &WaypointSymbol) -> SystemSymbol {
    let parts: Vec<&str> = waypoint_symbol.0.split('-').collect();
    // Join the first two parts with '-'
    let first_two_parts = parts[..2].join("-");
    SystemSymbol(first_two_parts)
}

async fn get_static_agent_info(client: &ClientWithMiddleware, agent_symbol: AgentSymbol) -> LeaderboardStaticAgentInfo {
    let agent_info = get_public_agent(&client, agent_symbol).await.data;
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

async fn get_public_agent(client: &ClientWithMiddleware, agent_symbol: AgentSymbol) -> AgentInfoResponse {
    let resp = client.get(format!("https://api.spacetraders.io/v2/agents/{}", agent_symbol.0))
        .send().await;
    let agent_info = resp.unwrap().json().await.unwrap();
    agent_info
}

async fn get_waypoints_of_type_jump_gate(client: &ClientWithMiddleware, system_symbol: SystemSymbol) -> ListWaypointsInSystemResponse {
    /*
      --url 'https://api.spacetraders.io/v2/systems/systemSymbol/waypoints?type=JUMP_GATE' \
     */
    let request = client.get(format!("https://api.spacetraders.io/v2/systems/{}/waypoints", system_symbol.0))
        .query(&[("type", "JUMP_GATE")]);
    let resp = request
        .send().await;

    //TODO: implement pagination
    resp.unwrap().json().await.unwrap()
}

struct RateLimitingMiddleware {
    limiter: Arc<DefaultDirectRateLimiter>,
}

#[async_trait::async_trait]
impl Middleware for RateLimitingMiddleware {
    async fn handle(&self,
                    req: Request,
                    extensions: &mut Extensions,
                    next: Next<'_>,
    ) -> reqwest_middleware::Result<reqwest::Response> {
        println!("checking rate_limiting availability");
        self.limiter.until_ready().await;
        println!("rate_limit check ok");

        println!("Request started {:?}", req);
        let res = next.run(req, extensions).await;
        println!("   got response: {:?}", res);
        res
    }
}
