use std::collections::HashMap;

use chrono::{Local, NaiveDate, NaiveDateTime};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::{Error, Pool, Sqlite};

use crate::leaderboard_model::{
    LeaderboardCurrentAgentInfo, LeaderboardCurrentConstructionInfo, LeaderboardStaticAgentInfo,
};
use crate::model::ConstructionMaterial;

#[tokio::main]
async fn main() -> Result<(), Error> {
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect("sqlite://data/flwi-leaderboard.db?mode=rwc")
        .await?;

    // Make a simple query to return the given parameter (use a question mark `?` instead of `$1` for MySQL/MariaDB)
    let reset_date = NaiveDate::from_ymd_opt(2024, 03, 10).unwrap();
    let now = Local::now().naive_utc();

    let maybe_reset_date = load_or_create_reset_date(&pool, reset_date, now).await?;
    println!("?:{res:?}", res = maybe_reset_date);

    Ok(())
}

pub(crate) async fn load_or_create_reset_date(
    pool: &Pool<Sqlite>,
    reset_date: NaiveDate,
    now: NaiveDateTime,
) -> Result<ResetDate, Error> {
    let maybe_db_reset = load_reset_date(pool, reset_date).await?;
    match maybe_db_reset {
        Some(rd) => Ok(rd),
        None => insert_reset_date(pool, reset_date, now).await,
    }
}

async fn insert_reset_date(
    pool: &Pool<Sqlite>,
    reset_date: NaiveDate,
    now: NaiveDateTime,
) -> Result<ResetDate, Error> {
    sqlx::query_as!(
        ResetDate,
        "
insert into reset_date (reset, first_ts) 
VALUES (?, ?)
returning reset_id, reset, first_ts
        ",
        reset_date,
        now
    )
    .fetch_one(pool)
    .await
}

async fn load_latest_reset_date(pool: &Pool<Sqlite>) -> Result<Option<ResetDate>, Error> {
    sqlx::query_as!(
        ResetDate,
        "
select reset_id, reset, first_ts
from reset_date
order by reset desc
        ",
    )
    .fetch_optional(pool)
    .await
}

async fn load_reset_date(
    pool: &Pool<Sqlite>,
    reset_date: NaiveDate,
) -> Result<Option<ResetDate>, Error> {
    sqlx::query_as!(
        ResetDate,
        "
select reset_id
     , reset
     , first_ts
  from reset_date
 where reset = ?
        ",
        reset_date
    )
    .fetch_optional(pool)
    .await
}

pub(crate) async fn load_reset_dates(pool: &Pool<Sqlite>) -> Result<Vec<ResetDate>, Error> {
    sqlx::query_as!(
        ResetDate,
        "
select reset_id
     , reset
     , first_ts
  from reset_date
 order by reset
        "
    )
    .fetch_all(pool)
    .await
}

pub(crate) async fn load_leaderboard_for_reset(
    pool: &Pool<Sqlite>,
    reset_date: NaiveDate,
) -> Result<Vec<LeaderboardEntry>, Error> {
    sqlx::query_as!(
        LeaderboardEntry,
        "
select agent_symbol
     , credits
     , ship_count
     , agent_headquarters_waypoint_symbol
     , jump_gate_waypoint_symbol
from agent_log a
         join static_agent_info sai on a.agent_id = sai.id
         join main.construction_site cs on sai.construction_site_id = cs.id
where job_id = (select id
                from job_run j
                         join reset_date rd on j.reset_id = rd.reset_id
                where rd.reset = ?
                order by datetime(query_time) desc
                limit 1)
order by credits desc, ship_count desc
",
        reset_date
    )
    .fetch_all(pool)
    .await
}

pub(crate) async fn load_jump_gate_agent_assignment_for_reset(
    pool: &Pool<Sqlite>,
    reset_date: NaiveDate,
) -> Result<Vec<DbJumpGateAssignmentEntry>, Error> {
    sqlx::query_as!(
        DbJumpGateAssignmentEntry,
        "
select rd.reset
     , agent_headquarters_waypoint_symbol
     , jump_gate_waypoint_symbol
     , group_concat(agent_symbol order by agent_symbol, ',') as agents_in_system_csv
from static_agent_info sai
         join main.construction_site cs on sai.construction_site_id = cs.id
         join main.reset_date rd on cs.reset_id = rd.reset_id
where reset = ?
group by rd.reset
       , agent_headquarters_waypoint_symbol
       , cs.jump_gate_waypoint_symbol
       , construction_site_id
order by rd.reset
       , jump_gate_waypoint_symbol
",
        reset_date
    )
    .fetch_all(pool)
    .await
}

pub(crate) async fn save_construction_sites(
    pool: &Pool<Sqlite>,
    reset_date: ResetDate,
    static_agent_infos: Vec<LeaderboardStaticAgentInfo>,
) -> () {
    let reset_id = reset_date.reset_id;

    for static_agent_info in static_agent_infos {
        sqlx::query!(
            "
insert into construction_site (reset_id, jump_gate_waypoint_symbol)
values (?, ?)
on conflict (reset_id, jump_gate_waypoint_symbol) do nothing
        ",
            reset_id,
            static_agent_info.jump_gate.0
        )
        .execute(pool)
        .await
        .unwrap();
    }
}

pub(crate) async fn save_static_agent_infos(
    pool: &Pool<Sqlite>,
    reset_date: ResetDate,
    static_agent_infos: Vec<LeaderboardStaticAgentInfo>,
    construction_sites: Vec<DbConstructionSite>,
    now: NaiveDateTime,
) {
    let cs_lookup: HashMap<&String, &i64> = HashMap::from_iter(
        construction_sites
            .iter()
            .map(|cs| (&cs.jump_gate_waypoint_symbol, &cs.id)),
    );

    for static_agent_info in static_agent_infos {
        let agent_symbol = static_agent_info.symbol.0;
        let agent_headquarters_waypoint_symbol = static_agent_info.headquarters.0;
        let construction_site_id = cs_lookup
            .get(&static_agent_info.jump_gate.0.to_string())
            .unwrap();
        let starting_faction = static_agent_info.starting_faction.0;
        let reset_id = reset_date.reset_id;
        let query_time = now;

        sqlx::query!(
        "
insert into static_agent_info (agent_symbol, agent_headquarters_waypoint_symbol, construction_site_id, starting_faction, reset_id, query_time)
values (?, ?, ?, ?, ?, ?)
        ",
        agent_symbol,
agent_headquarters_waypoint_symbol,
            construction_site_id,
starting_faction,
reset_id,
query_time
            )
            .execute(pool)
            .await
            .unwrap();
    }
}

pub(crate) async fn select_static_agent_infos_for_reset(
    pool: &Pool<Sqlite>,
    reset_date: ResetDate,
) -> Result<Vec<DbStaticAgentInfo>, Error> {
    sqlx::query_as!(
        DbStaticAgentInfo,
        "
select id
     , agent_symbol
     , construction_site_id
     , starting_faction
     , reset_id
     , query_time
  from static_agent_info
 where reset_id = ?
        ",
        reset_date.reset_id
    )
    .fetch_all(pool)
    .await
}

pub(crate) async fn insert_job_run(
    pool: &Pool<Sqlite>,
    reset_date: ResetDate,
    now: NaiveDateTime,
) -> Result<DbJobRun, Error> {
    let event_time_minutes = (now - reset_date.first_ts).num_minutes();

    sqlx::query_as!(
        DbJobRun,
        "
insert into job_run (reset_id, query_time, event_time_minutes)
VALUES (?, ?, ?)
returning id, reset_id, query_time, event_time_minutes
        ",
        reset_date.reset_id,
        now,
        event_time_minutes
    )
    .fetch_one(pool)
    .await
}

pub(crate) async fn select_construction_sites_for_reset(
    pool: &Pool<Sqlite>,
    reset_date: ResetDate,
) -> Result<Vec<DbConstructionSite>, Error> {
    sqlx::query_as!(
        DbConstructionSite,
        "
select id
     , reset_id
     , jump_gate_waypoint_symbol
  from construction_site
 where reset_id = ?
        ",
        reset_date.reset_id
    )
    .fetch_all(pool)
    .await
}

pub(crate) async fn select_construction_progress_for_reset(
    pool: &Pool<Sqlite>,
    reset_date: NaiveDate,
    from_event_time_minutes_gte: i64,
    to_event_time_minutes_lte: i64,
    resolution_minutes: i64,
    jump_gate_waypoint_symbols: Vec<String>,
) -> Result<Vec<DbConstructionMaterialProgress>, Error> {
    // TODO: resolution (include latest ts even if it's not included in modulo)
    let or_gte_value_to_include_latest = to_event_time_minutes_lte - resolution_minutes;
    let jump_gate_waypoint_json_string =
        serde_json::to_string(&jump_gate_waypoint_symbols).unwrap();

    // sqlx doesn't understand a group-concat with int-values apparently
    // using an alias with a type handles that
    sqlx::query_as!(
        DbConstructionMaterialProgress,
        "
with construction_material_details as (
    select cs.jump_gate_waypoint_symbol
         , cr.trade_symbol
         , event_time_minutes
         , fulfilled
    from reset_date rd
             join job_run jr on rd.reset_id = jr.reset_id
             join construction_log cl on jr.id = cl.job_id
             join main.construction_material_log cml on cl.id = cml.construction_log_id
             join main.construction_requirement cr on cml.construction_requirement_id = cr.id
             join main.construction_site cs on cl.construction_site_id = cs.id
    where rd.reset = ?
      and event_time_minutes >= ?
      and event_time_minutes <= ?
      and (event_time_minutes % ? = 0 or event_time_minutes >= ? )
      and cr.required > 1
      and cs.jump_gate_waypoint_symbol in (select json_each.value as jump_gate_waypoint_symbol
                                           from json_each(json(?)))
)
select jump_gate_waypoint_symbol
     , trade_symbol
     , group_concat(event_time_minutes, ',') as \"event_time_minutes_csv: String\"
     , group_concat(fulfilled, ',') as \"fulfilled_csv: String\"
from construction_material_details
group by jump_gate_waypoint_symbol
       , trade_symbol
        ",
        reset_date,
        from_event_time_minutes_gte,
        to_event_time_minutes_lte,
        resolution_minutes,
        or_gte_value_to_include_latest,
        jump_gate_waypoint_json_string
    )
    .fetch_all(pool)
    .await
}

async fn insert_agent_log_entry(
    pool: &Pool<Sqlite>,
    job_run: DbJobRun,
    leaderboard_current_agent_info: LeaderboardCurrentAgentInfo,
    db_static_agent_info: DbStaticAgentInfo,
) {
    // sqlx for sqlite doesn't handle u64 (bigint)
    let credits = leaderboard_current_agent_info.credits as i64;
    sqlx::query!(
        "
insert into agent_log (agent_id, job_id, credits, ship_count)
values (?, ?, ?, ?)
        ",
        db_static_agent_info.id,
        job_run.id,
        credits,
        leaderboard_current_agent_info.ship_count,
    )
    .execute(pool)
    .await
    .unwrap();
}

async fn insert_construction_log(
    pool: &Pool<Sqlite>,
    job_run: DbJobRun,
    current: LeaderboardCurrentConstructionInfo,
    db_construction_site: DbConstructionSite,
    db_construction_requirements: &Vec<DbConstructionRequirement>,
) -> Result<(), Box<dyn std::error::Error>> {
    let construction_log: DbConstructionLog = sqlx::query_as!(
        DbConstructionLog,
        "
insert into construction_log (job_id, construction_site_id, is_complete)
values (?, ?, ?)
returning id, job_id, construction_site_id, is_complete
        ",
        job_run.id,
        db_construction_site.id,
        current.is_complete
    )
    .fetch_one(pool)
    .await?;

    for material in current.materials {
        let db_requirement = db_construction_requirements
            .iter()
            .find(|r| r.trade_symbol == material.trade_symbol)
            .unwrap();

        insert_construction_material_log(pool, &construction_log, material, db_requirement).await;
    }

    Ok(())
}

async fn insert_construction_material_log(
    pool: &Pool<Sqlite>,
    db_construction_log: &DbConstructionLog,
    construction_material: ConstructionMaterial,
    db_construction_requirement: &DbConstructionRequirement,
) -> () {
    sqlx::query!(
        "
insert into construction_material_log (construction_log_id, construction_requirement_id, fulfilled)
values (?, ?, ?)
        ",
        db_construction_log.id,
        db_construction_requirement.id,
        construction_material.fulfilled
    )
    .execute(pool)
    .await
    .unwrap();
}

pub(crate) async fn insert_job_run_and_details(
    pool: &Pool<Sqlite>,
    now: NaiveDateTime,
    reset_date: ResetDate,
    current_agent_infos: Vec<LeaderboardCurrentAgentInfo>,
    db_static_agent_infos: Vec<DbStaticAgentInfo>,
    current_construction_infos: Vec<LeaderboardCurrentConstructionInfo>,
    db_construction_infos: Vec<DbConstructionSite>,
) -> Result<(), Box<dyn std::error::Error>> {
    let agent_lookup: HashMap<&String, &DbStaticAgentInfo> = HashMap::from_iter(
        db_static_agent_infos
            .iter()
            .map(|sai| (&sai.agent_symbol, sai)),
    );

    let cs_lookup: HashMap<&String, &DbConstructionSite> = HashMap::from_iter(
        db_construction_infos
            .iter()
            .map(|cs| (&cs.jump_gate_waypoint_symbol, cs)),
    );

    let construction_materials: Vec<ConstructionMaterial> = current_construction_infos
        .get(0)
        .into_iter()
        .flat_map(|c| c.clone().materials)
        .collect();

    for construction_material in construction_materials {
        sqlx::query!(
            "
insert into construction_requirement (reset_id, trade_symbol, required)
values (?, ?, ?)
on conflict (reset_id, trade_symbol) do nothing
        ",
            reset_date.reset_id,
            construction_material.trade_symbol,
            construction_material.required,
        )
        .execute(pool)
        .await?;
    }

    let construction_requirements: Vec<DbConstructionRequirement> = sqlx::query_as!(
        DbConstructionRequirement,
        "
select id, reset_id, trade_symbol, required
  from construction_requirement
 where reset_id = ?
        ",
        reset_date.reset_id,
    )
    .fetch_all(pool)
    .await?;

    let job_run = insert_job_run(pool, reset_date, now).await?;
    for current in current_agent_infos {
        let static_agent_info = *agent_lookup.get(&current.symbol.0).unwrap();
        insert_agent_log_entry(pool, job_run, current, static_agent_info.clone()).await;
    }

    for current in current_construction_infos {
        let cs = *cs_lookup.get(&current.symbol.0).unwrap();
        insert_construction_log(
            pool,
            job_run,
            current,
            cs.clone(),
            &construction_requirements,
        )
        .await?;
    }

    Ok(())
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub(crate) struct ResetDate {
    reset_id: i64,
    pub reset: NaiveDate,
    first_ts: NaiveDateTime,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub(crate) struct LeaderboardEntry {
    pub agent_symbol: String,
    pub credits: i64,
    pub ship_count: i64,
    pub agent_headquarters_waypoint_symbol: String,
    pub jump_gate_waypoint_symbol: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, sqlx::FromRow)]
pub(crate) struct DbJumpGateAssignmentEntry {
    pub reset: NaiveDate,
    pub agent_headquarters_waypoint_symbol: String,
    pub jump_gate_waypoint_symbol: String,

    // for some reason, sqlx thinks this is a string if I use json_group_array.
    // I'm now concatenating the values with a comma to then split in the rust world
    pub agents_in_system_csv: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub(crate) struct DbConstructionSite {
    id: i64,
    reset_id: i64,
    pub(crate) jump_gate_waypoint_symbol: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub(crate) struct DbConstructionMaterialProgress {
    jump_gate_waypoint_symbol: String,
    trade_symbol: String,
    event_time_minutes_csv: Option<String>,
    fulfilled_csv: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub(crate) struct DbConstructionLog {
    id: i64,
    job_id: i64,
    construction_site_id: i64,
    is_complete: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub(crate) struct DbJobRun {
    id: i64,
    reset_id: i64,
    query_time: NaiveDate,
    event_time_minutes: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub(crate) struct DbStaticAgentInfo {
    id: i64,
    pub(crate) agent_symbol: String,
    construction_site_id: i64,
    starting_faction: String,
    reset_id: i64,
    query_time: NaiveDateTime,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DbConstructionRequirement {
    pub id: i64,
    pub reset_id: i64,
    pub trade_symbol: String,
    pub required: i64,
}
