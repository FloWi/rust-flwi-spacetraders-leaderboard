use std::collections::HashMap;

use chrono::{Local, NaiveDate, NaiveDateTime};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::{Error, Executor, Pool, Sqlite};

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
        None => {
            let reset_date = insert_reset_date(pool, reset_date, now).await?;
            Ok(reset_date)
        }
    }
}

pub(crate) async fn force_wal_checkpoint(pool: &Pool<Sqlite>) -> Result<(), Error> {
    // TRUNCATE is more aggressive than PASSIVE or RESTART
    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(pool)
        .await?;
    Ok(())
}

async fn insert_reset_date(
    pool: &Pool<Sqlite>,
    reset_date: NaiveDate,
    now: NaiveDateTime,
) -> Result<ResetDate, Error> {
    let reset_id = sqlx::query_scalar!(
        "
insert into reset_date (reset, first_ts)
VALUES (?, ?)
returning reset_id
        ",
        reset_date,
        now,
    )
    .fetch_one(pool)
    .await?;

    Ok(ResetDate {
        reset_id,
        reset: reset_date,
        first_ts: now,
        latest_ts: now,
        is_ongoing: true,
    })
}

async fn load_latest_reset_date(pool: &Pool<Sqlite>) -> Result<Option<ResetDate>, Error> {
    sqlx::query_as!(
        ResetDate,
        r#"
select r.reset_id as "reset_id!"
     , r.reset as "reset!"
     , r.first_ts as "first_ts!"
     , coalesce(max(jr.query_time), r.first_ts) as "latest_ts! :_"
     , (select count(*) from reset_date next where next.reset > r.reset ) = 0 as "is_ongoing! :_"
  from reset_date r
  left join main.job_run jr
       on r.reset_id = jr.reset_id
group by r.reset_id, r.first_ts, r.reset
order by r.reset desc
        "#,
    )
    .fetch_optional(pool)
    .await
}

pub(crate) async fn load_reset_date(
    pool: &Pool<Sqlite>,
    reset_date: NaiveDate,
) -> Result<Option<ResetDate>, Error> {
    sqlx::query_as!(
        ResetDate,
        r#"
select r.reset_id as "reset_id!"
     , r.reset as "reset!"
     , r.first_ts as "first_ts!"
     , max(jr.query_time) as "latest_ts! :_"
     , (select count(*) from reset_date next where next.reset > r.reset ) = 0 as "is_ongoing! :_"
from reset_date r
         join main.job_run jr
              on r.reset_id = jr.reset_id
where reset = ?
group by r.reset_id, r.first_ts, r.reset
        "#,
        reset_date
    )
    .fetch_optional(pool)
    .await
}

pub(crate) async fn load_reset_dates(pool: &Pool<Sqlite>) -> Result<Vec<ResetDate>, Error> {
    sqlx::query_as!(
        ResetDate,
        r#"
select r.reset_id as "reset_id!"
     , r.reset as "reset!"
     , r.first_ts as "first_ts!"
     , max(jr.query_time) as "latest_ts! :_"
     , (select count(*) from reset_date next where next.reset > r.reset ) = 0 as "is_ongoing! :_"
from reset_date r
         join main.job_run jr
              on r.reset_id = jr.reset_id
group by r.reset_id, r.first_ts, r.reset
        "#
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

pub(crate) async fn select_jump_gate_agent_assignment_for_reset(
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

pub(crate) async fn select_jump_gate_construction_event_overview_for_reset(
    pool: &Pool<Sqlite>,
    reset_date: NaiveDate,
) -> Result<Vec<DbJumpGateConstructionEventOverviewEntry>, Error> {
    sqlx::query_as!(
        DbJumpGateConstructionEventOverviewEntry,
        r#"
select first_event.first_ts   as ts_start_of_reset
     , cr.trade_symbol
     , cur.fulfilled
     , cr.required
     , cs.jump_gate_waypoint_symbol
     , first_event.query_time as ts_first_construction_event
     , last_event.query_time  as ts_last_construction_event
     , cur.is_jump_gate_complete
from mat_view_material_delivery_events first_event
         join main.construction_site cs
              on first_event.construction_site_id = cs.id
         join main.construction_requirement cr
              on first_event.construction_requirement_id = cr.id
                  and first_event.delivery_event = 'first'
         left join mat_view_material_delivery_events last_event
                   on first_event.construction_requirement_id = last_event.construction_requirement_id
                       and first_event.construction_site_id = last_event.construction_site_id
                       and last_event.delivery_event = 'last'
         join mat_view_current_construction_progress cur
              on cur.reset_id = cs.reset_id
                  and cur.construction_site_id = cs.id
                  and cur.construction_requirement_id = cr.id
         join reset_date rd
              on first_event.reset_id = rd.reset_id
where reset = ?
        "#,
            reset_date
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
) -> Result<Vec<DbConstructionMaterialHistoryEntry>, Error> {
    // TODO: resolution (include latest ts even if it's not included in modulo)
    let or_gte_value_to_include_latest = to_event_time_minutes_lte;
    let jump_gate_waypoint_json_string =
        serde_json::to_string(&jump_gate_waypoint_symbols).unwrap();

    // sqlx doesn't understand a group-concat with int-values apparently
    // using an alias with a type handles that
    sqlx::query_as!(
        DbConstructionMaterialHistoryEntry,
        r#"
with construction_material_details as (
    select cs.jump_gate_waypoint_symbol
         , cr.trade_symbol
         , cr.required
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
 order by cs.jump_gate_waypoint_symbol
        , event_time_minutes
)
select jump_gate_waypoint_symbol
     , trade_symbol
     , max(required) as "required: i64"
     , group_concat(event_time_minutes, ',') as "event_time_minutes_csv: String"
     , group_concat(fulfilled, ',') as "fulfilled_csv: String"
from construction_material_details
group by jump_gate_waypoint_symbol
       , trade_symbol
        "#,
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

pub(crate) async fn select_most_recent_construction_progress_for_reset(
    pool: &Pool<Sqlite>,
    reset_date: NaiveDate,
) -> Result<Vec<DbConstructionMaterialMostRecentStatus>, Error> {
    // TODO: resolution (include latest ts even if it's not included in modulo)

    sqlx::query_as!(
        DbConstructionMaterialMostRecentStatus,
        r#"
with last_entry_of_reset as (select *
                             from (select r.reset_id
                                        , r.first_ts
                                        , r.reset
                                        , row_number() over (partition by jr.reset_id order by jr.query_time desc) as rn
                                        , jr.query_time                                                            as ts_latest_entry_of_reset
                                        , jr.id                                                                    as job_run_id_latest_entry
                                   from reset_date r
                                            join main.job_run jr
                                                 on r.reset_id = jr.reset_id
                                   where reset = ?
                                   ) sub
                             where rn = 1)
select l.reset_id as "reset_id: _"
     , l.reset as "reset: _"
     , l.first_ts as "ts_start_of_reset: _"
     , l.ts_latest_entry_of_reset as "ts_latest_entry_of_reset: _"
     , cr.trade_symbol
     , cml.fulfilled
     , cr.required
     , cs.jump_gate_waypoint_symbol
     , cl.is_complete as is_jump_gate_complete
from construction_material_log cml
         join main.construction_log cl
              on cml.construction_log_id = cl.id
         join main.construction_site cs
              on cl.construction_site_id = cs.id
         join main.construction_requirement cr
              on cml.construction_requirement_id = cr.id
         join last_entry_of_reset l
              on l.job_run_id_latest_entry = cl.job_id
where required > 1
        "#,
        reset_date,
    )
    .fetch_all(pool)
    .await
}

pub(crate) async fn select_agent_history(
    pool: &Pool<Sqlite>,
    reset_date: NaiveDate,
    from_event_time_minutes_gte: i64,
    to_event_time_minutes_lte: i64,
    resolution_minutes: i64,
    agent_symbols: Vec<String>,
) -> Result<Vec<DbAgentHistoryEntry>, Error> {
    // TODO: resolution (include latest ts even if it's not included in modulo)
    let or_gte_value_to_include_latest = to_event_time_minutes_lte;
    let agent_symbols_json_string = serde_json::to_string(&agent_symbols).unwrap();

    dbg!(reset_date);
    dbg!(from_event_time_minutes_gte);
    dbg!(to_event_time_minutes_lte);
    dbg!(resolution_minutes);
    dbg!(or_gte_value_to_include_latest);
    dbg!(agent_symbols_json_string.clone());

    // sqlx doesn't understand a group-concat with int-values apparently
    // using an alias with a type handles that
    sqlx::query_as!(
        DbAgentHistoryEntry,
        "
with agent_details as (select jr.event_time_minutes
                            , sai.agent_symbol
                            , sai.construction_site_id
                            , al.credits
                            , al.ship_count
                            , jr.id as job_run_id
                       from reset_date rd
                                join main.job_run jr on rd.reset_id = jr.reset_id
                                join main.agent_log al on jr.id = al.job_id
                                join main.static_agent_info sai on al.agent_id = sai.id
                               where rd.reset = ?
                                 and event_time_minutes >= ?
                                 and event_time_minutes <= ?
                                 and (event_time_minutes % ? = 0 or event_time_minutes >= ?)
                                 and sai.agent_symbol in (select json_each.value as jump_gate_waypoint_symbol
                                                                      from json_each(json(?)))
                             order by agent_symbol
                              , event_time_minutes)
select ad.agent_symbol
     , max(ad.construction_site_id)         as \"construction_site_id: i64\"
     , json_group_array(event_time_minutes) as \"event_times_minutes: _\"
     , json_group_array(credits)            as \"credits_timeline: _\"
     , json_group_array(ship_count)         as \"ship_count_timeline: _\"
from agent_details ad
group by ad.agent_symbol
        ",
        reset_date,
        from_event_time_minutes_gte,
        to_event_time_minutes_lte,
        resolution_minutes,
        or_gte_value_to_include_latest,
        agent_symbols_json_string
    )
    .fetch_all(pool)
    .await
}

pub(crate) async fn select_all_time_performance(
    pool: &Pool<Sqlite>,
) -> Result<Vec<DbAllTimePerformanceEntry>, Error> {
    // sqlx doesn't understand a group-concat with int-values apparently
    // using an alias with a type handles that
    sqlx::query_as!(
        DbAllTimePerformanceEntry,
        r#"
with last_entry_of_reset as (select *
                             from (select r.reset_id
                                        , r.first_ts
                                        , r.reset
                                        , row_number() over (partition by jr.reset_id order by jr.query_time desc) as rn
                                        , jr.query_time                                                            as ts_latest_entry_of_reset
                                        , jr.id                                                                    as job_run_id_latest_entry
                                   from reset_date r
                                            join main.job_run jr
                                                 on r.reset_id = jr.reset_id) sub
                             where rn = 1)
   , ranked as (select rd.reset
                     , sai.agent_symbol
                     , al.credits
                     , row_number() over (partition by rd.reset order by credits desc, sai.agent_symbol) as rank
                from reset_date rd
                         join main.job_run jr on rd.reset_id = jr.reset_id
                         join main.agent_log al on jr.id = al.job_id
                         join main.static_agent_info sai on al.agent_id = sai.id
                         join last_entry_of_reset last
                              on last.job_run_id_latest_entry = jr.id)
select *
from ranked
order by reset
        "#
    )
    .fetch_all(pool)
    .await
}

pub(crate) async fn select_all_time_construction_leaderboard(
    pool: &Pool<Sqlite>,
) -> Result<Vec<DbConstructionLeaderboardEntry>, Error> {
    /*
        select r.reset_id as "reset_id!"
         , r.reset as "reset!"
         , r.first_ts as "first_ts!"
         , max(jr.query_time) as "latest_ts! :_"
         , (select count(*) from reset_date next where next.reset > r.reset ) = 0 as "is_ongoing! :_"
    from reset_date r
             join main.job_run jr
                  on r.reset_id = jr.reset_id
    group by r.reset_id, r.first_ts, r.reset

         */

    sqlx::query_as!(
        DbConstructionLeaderboardEntry,
        r#"
select reset_date as "reset_date! :_"
     , ts_start_of_reset as "ts_start_of_reset! :_"
     , jump_gate_waypoint_symbol as "jump_gate_waypoint_symbol! :_"
     , agents_in_system_csv as "agents_in_system_csv! :_"
     , ts_start_jump_gate_construction as "ts_start_jump_gate_construction! :_"
     , ts_finish_jump_gate_construction as "ts_finish_jump_gate_construction! :_"
     , duration_minutes__start_fortnight__start_jump_gate_construction as "duration_minutes_start_fortnight_start_jump_gate_construction! :_"
     , duration_minutes__start_fortnight__finish_jump_gate_construction as "duration_minutes_start_fortnight_finish_jump_gate_construction! :_"
     , duration_minutes__jump_gate_construction as "duration_minutes_jump_gate_construction! :_"
     , rank__jump_gate_construction as "rank_jump_gate_construction! :_"
     , rank__start_fortnight__start_jump_gate_construction as "rank_start_fortnight_start_jump_gate_construction! :_"
     , rank__start_fortnight__finish_jump_gate_construction as "rank_start_fortnight_finish_jump_gate_construction! :_"
from v_construction_leaderboard
        "#
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

#[tracing::instrument(level = "debug")]
pub(crate) async fn refresh_fake_materialized_view(pool: &Pool<Sqlite>) -> anyhow::Result<()> {
    // NOTE: THIS SCRIPTS IS _NOT_ BEING CHECKED BY SQLX AT COMPILE-TIME
    // sqlx can't handle temporary tables that are being created inside this sql script
    const SQL: &str = include_str!("queries/update_materialized_views.sql");

    let mut transaction = pool.begin().await?;

    sqlx::query(SQL).execute(pool).await?;

    transaction.commit().await?;

    Ok(())
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub(crate) struct ResetDate {
    reset_id: i64,
    pub reset: NaiveDate,
    pub first_ts: NaiveDateTime,
    pub latest_ts: NaiveDateTime,
    pub is_ongoing: bool,
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
pub(crate) struct DbConstructionMaterialHistoryEntry {
    pub(crate) jump_gate_waypoint_symbol: String,
    pub(crate) trade_symbol: String,
    pub(crate) required: Option<i64>,
    pub(crate) event_time_minutes_csv: Option<String>,
    pub(crate) fulfilled_csv: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub(crate) struct DbJumpGateConstructionEventOverviewEntry {
    pub(crate) ts_start_of_reset: NaiveDateTime,
    pub(crate) trade_symbol: String,
    pub(crate) fulfilled: Option<i64>,
    pub(crate) required: i64,
    pub(crate) jump_gate_waypoint_symbol: String,
    pub(crate) ts_first_construction_event: NaiveDateTime,
    pub(crate) ts_last_construction_event: Option<NaiveDateTime>,
    pub(crate) is_jump_gate_complete: Option<bool>,
}

// starting to dislike sqlx, since it always thinks values are optional
#[derive(Serialize, Deserialize, Debug, Clone)]
pub(crate) struct DbConstructionMaterialMostRecentStatus {
    pub(crate) reset_id: Option<i64>,
    pub(crate) reset: Option<NaiveDate>,
    pub(crate) ts_start_of_reset: Option<NaiveDateTime>,
    pub(crate) ts_latest_entry_of_reset: Option<NaiveDateTime>,
    pub(crate) trade_symbol: String,
    pub(crate) fulfilled: i64,
    pub(crate) required: i64,
    pub(crate) jump_gate_waypoint_symbol: String,
    pub(crate) is_jump_gate_complete: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub(crate) struct DbAgentHistoryEntry {
    pub(crate) agent_symbol: String,
    pub(crate) construction_site_id: Option<i64>,
    pub(crate) event_times_minutes: Option<sqlx::types::Json<Vec<u32>>>,
    pub(crate) credits_timeline: Option<sqlx::types::Json<Vec<i64>>>,
    pub(crate) ship_count_timeline: Option<sqlx::types::Json<Vec<u32>>>,
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

pub(crate) struct DbAllTimePerformanceEntry {
    pub(crate) reset: NaiveDate,
    pub(crate) agent_symbol: String,
    pub(crate) credits: i64,
    pub(crate) rank: i64,
}

pub(crate) struct DbConstructionLeaderboardEntry {
    pub(crate) reset_date: NaiveDate,
    pub(crate) ts_start_of_reset: NaiveDateTime,
    pub(crate) jump_gate_waypoint_symbol: String,
    pub(crate) agents_in_system_csv: String,
    pub(crate) ts_start_jump_gate_construction: NaiveDateTime,
    pub(crate) ts_finish_jump_gate_construction: Option<NaiveDateTime>,
    pub(crate) duration_minutes_start_fortnight_start_jump_gate_construction: i64,
    pub(crate) duration_minutes_start_fortnight_finish_jump_gate_construction: Option<i64>,
    pub(crate) duration_minutes_jump_gate_construction: Option<i64>,
    pub(crate) rank_jump_gate_construction: i64,
    pub(crate) rank_start_fortnight_start_jump_gate_construction: i64,
    pub(crate) rank_start_fortnight_finish_jump_gate_construction: i64,
}
