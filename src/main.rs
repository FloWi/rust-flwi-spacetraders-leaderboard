use std::sync::Arc;

use governor::{DefaultDirectRateLimiter, Quota, RateLimiter};
use reqwest::{Client, Request};
use reqwest_middleware::{ClientBuilder, Middleware, Next, Result};
use serde::{Deserialize, Serialize};
use task_local_extensions::Extensions;

#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct StStatusResponse {
    status: String,
    version: String,
    reset_date: String,
    description: String,
    stats: Stats,
    leaderboards: Leaderboards,
}

#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct Stats {
    agents: i32,
    ships: i32,
    systems: i32,
    waypoints: i32,
}

#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct Leaderboards {
    most_credits: Vec<AgentCredits>,
    most_submitted_charts: Vec<AgentCharts>,
}

#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct AgentCredits {
    agent_symbol: String,
    credits: i64,
}

#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct AgentCharts {
    agent_symbol: String,
    chart_count: i32,
}


#[tokio::main]
async fn main() -> Result<()> {
    let reqwest_client = Client::builder().build().unwrap();

    let limiter = RateLimiter::direct(Quota::per_second(std::num::NonZeroU32::new(2u32).unwrap()));
    let arc_limiter = Arc::new(limiter);

    let middleware = RateLimitingMiddleware { limiter: arc_limiter };

    let client = ClientBuilder::new(reqwest_client)
        .with(middleware)
        .build();

    for _i in 0..20 {
        let resp: StStatusResponse = client.get("https://api.spacetraders.io/v2/")
            .send()
            .await?
            .json()
            .await?;

        println!("{:?}", resp.stats);
    }


    Ok(())
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
        res
    }
}


fn foo() {
    let limiter = RateLimiter::direct(Quota::per_second(std::num::NonZeroU32::new(2u32).unwrap()));
    let arc_limiter = Arc::new(limiter);
}
