use std::fs::File;

use chrono::{Local, NaiveDate, NaiveDateTime};
use futures::future::join_all;
use itertools::Itertools;
use polars::lazy::prelude::*;
use polars::prelude::*;
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
mod polars_playground;
mod reqwest_helpers;

#[tokio::main]
async fn main() -> Result<()> {
    let client = create_client();

    let st_status: StStatusResponse = client
        .get("https://api.spacetraders.io/v2/")
        .send()
        .await?
        .json()
        .await?;

    println!("Reset Date: {:?}", st_status.reset_date);
    println!("{:?}", st_status.stats);

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

    let static_agent_futures: Vec<_> = st_status
        .leaderboards
        .most_credits
        .iter()
        .map(|a| get_static_agent_info(&client, AgentSymbol(a.agent_symbol.to_string())))
        .collect();

    let num_agents = static_agent_futures.len();
    println!("Downloading static infos for {} agents", num_agents);
    let static_agent_info_results: Vec<_> =
        join_all(static_agent_futures).await.into_iter().collect();
    println!("Done downloading static infos for {} agents", num_agents);
    let now = Local::now().naive_utc();

    //2024-03-10
    let reset_date = NaiveDate::parse_from_str(st_status.reset_date.as_str(), "%Y-%m-%d").unwrap();

    let current_agent_futures: Vec<_> = static_agent_info_results
        .clone()
        .into_iter()
        .map(|a| get_current_agent_info(&client, a.symbol))
        .collect();

    let current_agent_results: Vec<_> = join_all(current_agent_futures).await.into_iter().collect();

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
        .filter(|c| c.is_complete)
        .count();

    println!(
        "{} out of {} jump gates are completed",
        num_completed_jump_gates, num_construction_sites
    );

    create_and_write_polars_df(
        &static_agent_info_results,
        &current_agent_results,
        &construction_site_results,
        now,
        reset_date,
    );

    Ok(())
}

macro_rules! struct_to_dataframe {
    ($input:expr, [$($field:ident),+]) => {
        {
            // Extract the field values into separate vectors
            $(let mut $field = Vec::new();)*

            for e in $input.into_iter() {
                $($field.push(e.$field);)*
            }
            df! {
                $(stringify!($field) => $field,)*
            }
        }
    };
}

fn create_construction_struct_series(
    construction_site_results: &Vec<LeaderboardCurrentConstructionInfo>,
) -> DataFrame {
    struct ConstructionMaterialDenormalized {
        trade_symbol: String,
        required: u32,
        fulfilled: u32,
        symbol: String,
        is_complete: bool,
    }

    let materials: Vec<ConstructionMaterialDenormalized> = construction_site_results
        .into_iter()
        .flat_map(|cs| {
            cs.materials
                .iter()
                .map(|cm| ConstructionMaterialDenormalized {
                    trade_symbol: cm.trade_symbol.clone(),
                    is_complete: cs.is_complete,
                    symbol: cs.symbol.0.clone(),
                    required: cm.required,
                    fulfilled: cm.fulfilled,
                })
        })
        .collect();

    let mut df = struct_to_dataframe!(
        materials,
        [symbol, is_complete, trade_symbol, required, fulfilled]
    )
    .unwrap();

    let df_with_struct = df
        .lazy()
        .with_column(
            as_struct([col("trade_symbol"), col("required"), col("fulfilled")].into())
                .alias("materials"),
        )
        .drop(["trade_symbol", "required", "fulfilled"])
        .group_by([col("symbol"), col("is_complete")])
        .agg([col("materials")])
        .collect()
        .unwrap();

    df_with_struct
}

fn create_and_write_polars_df(
    leaderboard_static_agent_info: &Vec<LeaderboardStaticAgentInfo>,
    current_agent_results: &Vec<LeaderboardCurrentAgentInfo>,
    construction_site_results: &Vec<LeaderboardCurrentConstructionInfo>,
    query_time: NaiveDateTime,
    reset_date: NaiveDate,
) {
    let static_agent_symbols = Series::new(
        "agent_symbol",
        leaderboard_static_agent_info
            .iter()
            .map(|sad| sad.symbol.0.clone())
            .collect::<Vec<_>>(),
    );
    let static_agent_headquarters_waypoint_symbols = Series::new(
        "agent_headquarters_waypoint_symbol",
        leaderboard_static_agent_info
            .iter()
            .map(|sad| sad.headquarters.0.clone())
            .collect::<Vec<_>>(),
    );
    let static_jump_gate_waypoint_symbols = Series::new(
        "jump_gate_waypoint_symbol",
        leaderboard_static_agent_info
            .iter()
            .map(|sad| sad.jump_gate.0.clone())
            .collect::<Vec<_>>(),
    );
    let static_starting_factions = Series::new(
        "starting_faction",
        leaderboard_static_agent_info
            .iter()
            .map(|sad| sad.starting_faction.0.clone())
            .collect::<Vec<_>>(),
    );

    let current_agent_symbols = Series::new(
        "agent_symbol",
        current_agent_results
            .iter()
            .map(|c| c.symbol.0.clone())
            .collect::<Vec<_>>(),
    );

    let current_agent_ship_count = Series::new(
        "agent_ship_count",
        current_agent_results
            .iter()
            .map(|c| c.ship_count)
            .collect::<Vec<_>>(),
    );

    let current_agent_credits = Series::new(
        "agent_credits",
        current_agent_results
            .iter()
            .map(|c| c.credits)
            .collect::<Vec<_>>(),
    );

    let mut df_static_agent_infos: DataFrame = DataFrame::new(vec![
        static_agent_symbols,
        static_agent_headquarters_waypoint_symbols,
        static_jump_gate_waypoint_symbols,
        static_starting_factions,
    ])
    .unwrap();

    df_static_agent_infos = df_static_agent_infos
        .lazy()
        .with_column(lit(reset_date).alias("reset_date"))
        .with_column(lit(query_time).alias("query_time"))
        .collect()
        .unwrap();

    let mut df_current_agent_infos: DataFrame = DataFrame::new(vec![
        current_agent_symbols,
        current_agent_ship_count,
        current_agent_credits,
    ])
    .unwrap();

    df_current_agent_infos = df_current_agent_infos
        .lazy()
        .with_column(lit(reset_date).alias("reset_date"))
        .with_column(lit(query_time).alias("query_time"))
        .collect()
        .unwrap();

    let mut df_construction_materials =
        create_construction_struct_series(construction_site_results)
            .lazy()
            .with_column(lit(reset_date).alias("reset_date"))
            .with_column(lit(query_time).alias("query_time"))
            .collect()
            .unwrap();

    let mut df_complete = df_current_agent_infos
        .join(
            &df_static_agent_infos,
            ["agent_symbol"],
            ["agent_symbol"],
            JoinArgs::new(JoinType::Inner),
        )
        .unwrap()
        .join(
            &df_construction_materials,
            ["reset_date", "query_time"],
            ["reset_date", "query_time"],
            JoinArgs::new(JoinType::Inner),
        )
        .unwrap();

    let mut file = File::create("data/static_agent_infos.parquet").expect("could not create file");
    ParquetWriter::new(&mut file)
        .finish(&mut df_static_agent_infos)
        .unwrap();

    let mut file = File::create("data/current_agent_infos.parquet").expect("could not create file");
    ParquetWriter::new(&mut file)
        .finish(&mut df_current_agent_infos)
        .unwrap();

    let mut file =
        File::create("data/construction_materials.parquet").expect("could not create file");
    ParquetWriter::new(&mut file)
        .finish(&mut df_construction_materials)
        .unwrap();

    let mut file = File::create("data/complete.parquet").expect("could not create file");
    ParquetWriter::new(&mut file)
        .finish(&mut df_complete)
        .unwrap();
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
