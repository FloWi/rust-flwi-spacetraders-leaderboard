use std::fs::File;

use chrono::{NaiveDate, NaiveDateTime};
use polars::frame::DataFrame;
use polars::prelude::*;

use crate::leaderboard_model::{
    LeaderboardCurrentAgentInfo, LeaderboardCurrentConstructionInfo, LeaderboardStaticAgentInfo,
};

pub fn create_and_write_polars_df(
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

    let df = struct_to_dataframe!(
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
