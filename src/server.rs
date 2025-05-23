use std::io::Error;
use std::ops::RangeInclusive;
use std::path::PathBuf;
use std::str::FromStr;
use std::time::Duration;

use axum::{response::Result, routing, Router};
use chrono::TimeDelta;
use futures::TryFutureExt;
use sqlx::{Pool, Sqlite};
use tokio::net::TcpListener;
use tower_http::classify::ServerErrorsFailureClass;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use tracing::{event, Level, Span};
use utoipa::OpenApi;
use utoipa_rapidoc::RapiDoc;
use utoipa_redoc::{Redoc, Servable};
use utoipa_swagger_ui::SwaggerUi;

use crate::db::{
    DbAgentHistoryEntry, DbAllTimePerformanceEntry, DbConstructionLeaderboardEntry,
    DbConstructionMaterialHistoryEntry, DbConstructionMaterialMostRecentStatus,
    DbJumpGateConstructionEventOverviewEntry, ResetDate,
};
use crate::model::WaypointSymbol;
use crate::server::leaderboard::{
    ApiAgentHistoryEntry, ApiAgentSymbol, ApiAllTimeConstructionLeaderboardEntry,
    ApiAllTimePerformanceEntry, ApiConstructionMaterialHistoryEntry,
    ApiConstructionMaterialMostRecentProgressEntry,
    ApiGetJumpGateConstructionEventOverviewResponse, ApiJumpGateConstructionEventOverviewEntry,
    ApiResetAgentPeriodFilterBody, ApiResetDate, ApiTradeSymbol, ApiWaypointSymbol,
    RangeSelectionMode,
};

pub fn with_static_file_server(router: Router, _serve_dir: ServeDir) -> Router {
    // FIXME: ???
    router
}

pub async fn http_server(
    db: Pool<Sqlite>,
    address: String,
    maybe_asset_dir: Option<PathBuf>,
) -> Result<(), Error> {
    let app = Router::new()
        .merge(
            SwaggerUi::new("/docs/swagger-ui")
                .url("/api-docs/openapi.json", leaderboard::ApiDoc::openapi()),
        )
        .merge(Redoc::with_url(
            "/docs/redoc",
            leaderboard::ApiDoc::openapi(),
        ))
        // There is no need to create `RapiDoc::with_openapi` because the OpenApi is served
        // via SwaggerUi instead we only make rapidoc to point to the existing doc.
        .merge(RapiDoc::new("/api-docs/openapi.json").path("/rapidoc"))
        .route(
            "/api/reset-dates",
            routing::get(leaderboard::get_reset_dates),
        )
        .route(
            "/api/all-time-performance",
            routing::get(leaderboard::get_all_time_performance),
        )
        .route(
            "/api/all-time-construction-leaderboard",
            routing::get(leaderboard::get_all_time_construction_leaderboard),
        )
        .route(
            "/api/leaderboard/:reset_date",
            routing::get(leaderboard::get_leaderboard),
        )
        .route(
            "/api/jump-gate-assignment/:reset_date",
            routing::get(leaderboard::get_jump_gate_agents_assignment),
        )
        .route(
            "/api/jump-gate-most-recent-progress/:reset_date",
            routing::get(leaderboard::get_jump_gate_most_recent_progress),
        )
        .route(
            "/api/jump-gate-construction-event-overview/:reset_date",
            routing::get(leaderboard::get_jump_gate_construction_event_overview),
        )
        .route(
            "/api/history/:reset_date",
            routing::post(leaderboard::get_history_data_for_reset),
        )
        .layer(CorsLayer::very_permissive())
        .layer(TraceLayer::new_for_http().on_failure(
            |_error: ServerErrorsFailureClass, _latency: Duration, _span: &Span| {
                tracing::debug!("something went wrong")
            },
        ))
        .with_state(db);

    let app = match maybe_asset_dir {
        None => app,
        Some(asset_dir) => {
            let serve_dir_with_fallback = Router::new().nest_service(
                "/",
                ServeDir::new(asset_dir.clone())
                    .fallback(ServeFile::new(asset_dir.clone().join("index.html"))),
            );
            app.fallback_service(serve_dir_with_fallback)
        }
    };

    let listener = TcpListener::bind(address).await?;
    event!(
        Level::INFO,
        "listening on {}",
        listener.local_addr().unwrap()
    );

    axum::serve(listener, app.into_make_service()).await
}

pub mod leaderboard {
    use axum::extract::{Path, State};
    use axum::Json;
    use chrono::format::StrftimeItems;
    use chrono::{NaiveDate, NaiveDateTime, TimeDelta};
    use itertools::{process_results, Itertools};
    use serde::{Deserialize, Serialize};
    use sqlx::{Pool, Sqlite};
    use tracing::{event, Level};
    use utoipa::{OpenApi, ToSchema};

    use crate::db::{
        load_leaderboard_for_reset, load_reset_date, load_reset_dates, select_agent_history,
        select_all_time_construction_leaderboard, select_all_time_performance,
        select_construction_progress_for_reset, select_jump_gate_agent_assignment_for_reset,
        select_jump_gate_construction_event_overview_for_reset,
        select_most_recent_construction_progress_for_reset, ResetDate,
    };
    use crate::model::WaypointSymbol;
    use crate::server::{extract_reset_period_from_filter, ResetPeriodFilter};

    #[derive(OpenApi)]
    #[openapi(
        paths(
            get_reset_dates,
            get_leaderboard,
            get_jump_gate_agents_assignment,
            get_history_data_for_reset,
            get_jump_gate_most_recent_progress,
            get_jump_gate_construction_event_overview,
            get_all_time_performance,
            get_all_time_construction_leaderboard,
        ),
        components(
            schemas(ApiAgentHistoryEntry),
            schemas(ApiAgentSymbol),
            schemas(ApiAllTimePerformanceEntry),
            schemas(ApiConstructionMaterialHistoryEntry),
            schemas(ApiConstructionMaterialMostRecentProgressEntry),
            schemas(ApiGetJumpGateConstructionEventOverviewResponse),
            schemas(ApiJumpGateAssignmentEntry),
            schemas(ApiJumpGateAssignmentEntry),
            schemas(ApiJumpGateConstructionEventOverviewEntry),
            schemas(ApiLeaderboardEntry),
            schemas(ApiResetAgentPeriodFilterBody),
            schemas(ApiResetDate),
            schemas(ApiResetDateMeta),
            schemas(ApiTradeSymbol),
            schemas(ApiWaypointSymbol),
            schemas(GetAllTimeConstructionLeaderboardResult),
            schemas(ApiAllTimeConstructionLeaderboardEntry),
            schemas(GetAllTimePerformanceResult),
            schemas(GetHistoryDataForResetResponseContent),
            schemas(GetJumpGateAgentsAssignmentForResetResponseContent),
            schemas(GetJumpGateMostRecentProgressForResetResponseContent),
            schemas(GetLeaderboardForResetResponseContent),
            schemas(ListResetDatesResponseContent),
            schemas(RangeSelectionMode),
        )
    )]
    pub(crate) struct ApiDoc;

    #[derive(Serialize, Deserialize, ToSchema)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ListResetDatesResponseContent {
        reset_dates: Vec<ApiResetDateMeta>,
    }

    #[derive(Serialize, Deserialize, ToSchema)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ApiResetDateMeta {
        reset_date: ApiResetDate,
        first_ts: NaiveDateTime,
        latest_ts: NaiveDateTime,
        duration_minutes: u32,
        is_ongoing: bool,
    }

    #[derive(Serialize, Deserialize, ToSchema)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct GetLeaderboardForResetResponseContent {
        reset_date: ApiResetDate,
        leaderboard_entries: Vec<ApiLeaderboardEntry>,
    }

    #[derive(Serialize, Deserialize, ToSchema)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct GetJumpGateAgentsAssignmentForResetResponseContent {
        reset_date: ApiResetDate,
        jump_gate_assignment_entries: Vec<ApiJumpGateAssignmentEntry>,
    }

    #[derive(Serialize, Deserialize, ToSchema)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct GetAllTimePerformanceResult {
        entries: Vec<ApiAllTimePerformanceEntry>,
    }

    #[derive(Serialize, Deserialize, ToSchema)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct GetAllTimeConstructionLeaderboardResult {
        entries: Vec<ApiAllTimeConstructionLeaderboardEntry>,
    }

    #[derive(Serialize, Deserialize, ToSchema)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct GetJumpGateMostRecentProgressForResetResponseContent {
        reset_date: ApiResetDate,
        progress_entries: Vec<ApiConstructionMaterialMostRecentProgressEntry>,
    }

    #[derive(Serialize, Deserialize, ToSchema)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ApiGetJumpGateConstructionEventOverviewResponse {
        reset_date: ApiResetDate,
        event_entries: Vec<ApiJumpGateConstructionEventOverviewEntry>,
    }

    #[derive(Serialize, Deserialize, ToSchema, Debug)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ApiAgentHistoryEntry {
        pub(crate) agent_symbol: ApiAgentSymbol,
        pub(crate) event_times_minutes: Vec<u32>,
        pub(crate) credits_timeline: Vec<i64>,
        pub(crate) ship_count_timeline: Vec<u32>,
    }

    #[derive(Serialize, Deserialize, ToSchema, Debug)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ApiJumpGateConstructionEventOverviewEntry {
        pub(crate) ts_start_of_reset: NaiveDateTime,
        pub(crate) trade_symbol: ApiTradeSymbol,
        pub(crate) fulfilled: u32,
        pub(crate) required: u32,
        pub(crate) jump_gate_waypoint_symbol: ApiWaypointSymbol,
        pub(crate) ts_first_construction_event: NaiveDateTime,
        pub(crate) ts_last_construction_event: Option<NaiveDateTime>,
        pub(crate) is_jump_gate_complete: bool,
    }

    #[derive(Serialize, Deserialize, ToSchema, Debug)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ApiConstructionMaterialHistoryEntry {
        pub(crate) jump_gate_waypoint_symbol: ApiWaypointSymbol,
        pub(crate) trade_symbol: ApiTradeSymbol,
        pub(crate) event_times_minutes: Vec<u32>,
        pub(crate) fulfilled: Vec<u32>,
        pub(crate) required: u32,
    }

    #[derive(Serialize, Deserialize, ToSchema)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct GetHistoryDataForResetResponseContent {
        reset_date: ApiResetDate,
        agent_history: Vec<ApiAgentHistoryEntry>,
        construction_material_history: Vec<ApiConstructionMaterialHistoryEntry>,
        requested_agents: Vec<ApiAgentSymbol>,
        resolution_minutes: i64,
    }

    #[derive(Serialize, Deserialize, ToSchema, Debug)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ApiResetDate(pub String);

    #[derive(Serialize, Deserialize, ToSchema, Debug)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ApiAgentSymbol(pub String);

    #[derive(Serialize, Deserialize, ToSchema, Debug)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ApiWaypointSymbol(pub String);

    #[derive(Serialize, Deserialize, ToSchema, Debug)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ApiTradeSymbol(pub String);

    #[derive(Serialize, Deserialize, ToSchema)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ApiLeaderboardEntry {
        agent_symbol: ApiAgentSymbol,
        jump_gate_waypoint_symbol: ApiWaypointSymbol,
        credits: i64,
        ship_count: i64,
    }

    #[derive(Serialize, Deserialize, ToSchema, Debug)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ApiJumpGateAssignmentEntry {
        agent_headquarters_waypoint_symbol: ApiWaypointSymbol,
        jump_gate_waypoint_symbol: ApiWaypointSymbol,
        agents_in_system: Vec<ApiAgentSymbol>,
    }

    #[derive(Serialize, Deserialize, ToSchema, Debug)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ApiConstructionMaterialMostRecentProgressEntry {
        pub(crate) trade_symbol: ApiTradeSymbol,
        pub(crate) fulfilled: u32,
        pub(crate) required: u32,
        pub(crate) jump_gate_waypoint_symbol: ApiWaypointSymbol,
        pub(crate) is_jump_gate_complete: bool,
    }

    #[derive(Serialize, Deserialize, ToSchema, Debug)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ApiAllTimePerformanceEntry {
        pub(crate) reset: ApiResetDate,
        pub(crate) agent_symbol: ApiAgentSymbol,
        pub(crate) credits: i64,
        pub(crate) rank: u32,
    }

    #[derive(Serialize, Deserialize, ToSchema, Debug)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ApiAllTimeConstructionLeaderboardEntry {
        pub(crate) reset: ApiResetDate,
        pub(crate) ts_start_of_reset: NaiveDateTime,
        pub(crate) jump_gate_waypoint_symbol: ApiWaypointSymbol,
        pub(crate) agents_in_system: Vec<ApiAgentSymbol>,
        pub(crate) ts_start_jump_gate_construction: NaiveDateTime,
        pub(crate) ts_finish_jump_gate_construction: Option<NaiveDateTime>,
        pub(crate) duration_minutes_start_fortnight_start_jump_gate_construction: u32,
        pub(crate) duration_minutes_start_fortnight_finish_jump_gate_construction: Option<u32>,
        pub(crate) duration_minutes_jump_gate_construction: Option<u32>,
        pub(crate) rank_jump_gate_construction: u32,
        pub(crate) rank_start_fortnight_start_jump_gate_construction: u32,
        pub(crate) rank_start_fortnight_finish_jump_gate_construction: u32,
    }

    /// List all reset-dates
    #[utoipa::path(get, path = "/api/reset-dates", responses((status = 200, body = ListResetDatesResponseContent)))]
    pub(crate) async fn get_reset_dates(
        State(pool): State<Pool<Sqlite>>,
    ) -> Json<ListResetDatesResponseContent> {
        let fmt = StrftimeItems::new("%Y-%m-%d");
        let reset_dates = load_reset_dates(&pool).await.unwrap();
        let response = reset_dates
            .iter()
            .map(|r| ApiResetDateMeta {
                reset_date: ApiResetDate(r.reset.format_with_items(fmt.clone()).to_string()),
                first_ts: r.first_ts,
                latest_ts: r.latest_ts,
                duration_minutes: (r.latest_ts - r.first_ts).num_minutes().abs() as u32,
                is_ongoing: r.is_ongoing,
            })
            .collect();

        Json(ListResetDatesResponseContent {
            reset_dates: response,
        })
    }

    /// Get the leaderboard for a reset.
    #[utoipa::path(
    get,
    path = "/api/leaderboard/{resetDate}",
    responses((status = 200, body = GetLeaderboardForResetResponseContent)),
    params(
        ("resetDate" = NaiveDate, Path, description = "The reset date"),
    )
    )]
    pub(crate) async fn get_leaderboard(
        State(pool): State<Pool<Sqlite>>,
        Path(reset_date): Path<NaiveDate>,
    ) -> Json<GetLeaderboardForResetResponseContent> {
        let reset_dates = load_leaderboard_for_reset(&pool, reset_date).await.unwrap();
        let response = reset_dates
            .iter()
            .map(|r| ApiLeaderboardEntry {
                agent_symbol: ApiAgentSymbol(r.agent_symbol.clone()),
                credits: r.credits,
                ship_count: r.ship_count,
                jump_gate_waypoint_symbol: ApiWaypointSymbol(r.jump_gate_waypoint_symbol.clone()),
            })
            .collect();

        Json(GetLeaderboardForResetResponseContent {
            reset_date: ApiResetDate(reset_date.format("%Y-%m-%d").to_string()),
            leaderboard_entries: response,
        })
    }

    /// Get the ranked agents entries for all resets.
    #[utoipa::path(
    get,
    path = "/api/all-time-performance",
    responses((status = 200, body = GetAllTimePerformanceResult)),
    )]
    pub(crate) async fn get_all_time_performance(
        State(pool): State<Pool<Sqlite>>,
    ) -> Json<GetAllTimePerformanceResult> {
        let performance_entries = select_all_time_performance(&pool).await.unwrap();

        Json(GetAllTimePerformanceResult {
            entries: performance_entries
                .into_iter()
                .map(|e| e.try_into().unwrap())
                .collect(),
        })
    }

    /// Get the ranked construction performance for all resets.
    #[utoipa::path(
    get,
    path = "/api/all-time-construction-leaderboard",
    responses((status = 200, body = GetAllTimeConstructionLeaderboardResult)),
    )]
    pub(crate) async fn get_all_time_construction_leaderboard(
        State(pool): State<Pool<Sqlite>>,
    ) -> Json<GetAllTimeConstructionLeaderboardResult> {
        let performance_entries = select_all_time_construction_leaderboard(&pool)
            .await
            .unwrap();

        Json(GetAllTimeConstructionLeaderboardResult {
            entries: performance_entries
                .into_iter()
                .map(|e| e.try_into().unwrap())
                .collect(),
        })
    }

    /// Get the jump-gate to agents assignment for a reset.
    #[utoipa::path(
    get,
    path = "/api/jump-gate-assignment/{resetDate}",
    responses((status = 200, body = GetJumpGateAgentsAssignmentForResetResponseContent)),
    params(
        ("resetDate" = NaiveDate, Path, description = "The reset date"),
    )
    )]
    pub(crate) async fn get_jump_gate_agents_assignment(
        State(pool): State<Pool<Sqlite>>,
        Path(reset_date): Path<NaiveDate>,
    ) -> Json<GetJumpGateAgentsAssignmentForResetResponseContent> {
        let jump_gate_assignments = load_jump_gate_assignments(&pool, reset_date).await;

        Json(GetJumpGateAgentsAssignmentForResetResponseContent {
            reset_date: ApiResetDate(reset_date.format("%Y-%m-%d").to_string()),
            jump_gate_assignment_entries: jump_gate_assignments,
        })
    }

    /// Get the jump-gate to agents assignment for a reset.
    #[utoipa::path(
    get,
    path = "/api/jump-gate-most-recent-progress/{resetDate}",
    responses((status = 200, body = GetJumpGateMostRecentProgressForResetResponseContent)),
    params(
        ("resetDate" = NaiveDate, Path, description = "The reset date"),
    )
    )]
    pub(crate) async fn get_jump_gate_most_recent_progress(
        State(pool): State<Pool<Sqlite>>,
        Path(reset_date): Path<NaiveDate>,
    ) -> Json<GetJumpGateMostRecentProgressForResetResponseContent> {
        let progress_entries = load_jump_gate_most_recent_progress(&pool, reset_date).await;

        Json(GetJumpGateMostRecentProgressForResetResponseContent {
            reset_date: ApiResetDate(reset_date.format("%Y-%m-%d").to_string()),
            progress_entries,
        })
    }

    /// Get the jump-gate to agents assignment for a reset.
    #[utoipa::path(
    get,
    path = "/api/jump-gate-construction-event-overview/{resetDate}",
    responses((status = 200, body = ApiGetJumpGateConstructionEventOverviewResponse)),
    params(
        ("resetDate" = NaiveDate, Path, description = "The reset date"),
    )
    )]
    pub(crate) async fn get_jump_gate_construction_event_overview(
        State(pool): State<Pool<Sqlite>>,
        Path(reset_date): Path<NaiveDate>,
    ) -> Json<ApiGetJumpGateConstructionEventOverviewResponse> {
        let db_progress_entries =
            select_jump_gate_construction_event_overview_for_reset(&pool, reset_date)
                .await
                .unwrap();

        let progress_entries: Vec<ApiJumpGateConstructionEventOverviewEntry> = db_progress_entries
            .iter()
            .map(|e| e.clone().try_into().unwrap())
            .collect();

        Json(ApiGetJumpGateConstructionEventOverviewResponse {
            reset_date: ApiResetDate(reset_date.format("%Y-%m-%d").to_string()),
            event_entries: progress_entries,
        })
    }

    async fn load_jump_gate_assignments(
        pool: &Pool<Sqlite>,
        reset_date: NaiveDate,
    ) -> Vec<ApiJumpGateAssignmentEntry> {
        let db_jump_gate_assignment_entries =
            select_jump_gate_agent_assignment_for_reset(&pool, reset_date)
                .await
                .unwrap();

        let jump_gate_assignments = db_jump_gate_assignment_entries
            .iter()
            .map(|r| ApiJumpGateAssignmentEntry {
                agent_headquarters_waypoint_symbol: ApiWaypointSymbol(
                    r.agent_headquarters_waypoint_symbol.clone(),
                ),
                jump_gate_waypoint_symbol: ApiWaypointSymbol(r.jump_gate_waypoint_symbol.clone()),
                agents_in_system: r
                    .agents_in_system_csv
                    .split(',')
                    .map(|a| ApiAgentSymbol(a.into()))
                    .collect(),
            })
            .collect();
        jump_gate_assignments
    }

    async fn load_jump_gate_most_recent_progress(
        pool: &Pool<Sqlite>,
        reset_date: NaiveDate,
    ) -> Vec<ApiConstructionMaterialMostRecentProgressEntry> {
        let db_progress_entries =
            select_most_recent_construction_progress_for_reset(&pool, reset_date)
                .await
                .unwrap();

        let jump_gate_assignments = db_progress_entries
            .iter()
            .map(|r| r.clone().try_into().unwrap())
            .collect();
        jump_gate_assignments
    }

    #[derive(Deserialize, ToSchema, Debug, Clone)]
    #[serde(rename_all = "camelCase")]
    pub(crate) enum RangeSelectionMode {
        First,
        Last,
    }

    /// Filter for period and agent symbols
    #[derive(Deserialize, ToSchema)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ApiResetAgentPeriodFilterBody {
        pub(crate) agent_symbols: Vec<String>,
        pub(crate) event_time_minutes_lte: u32,
        pub(crate) event_time_minutes_gte: Option<u32>,
        pub(crate) selection_mode: RangeSelectionMode,
    }

    /// Get the history data for a reset
    #[utoipa::path(
    post,
    path = "/api/history/{resetDate}",
    responses((status = 200, body = GetHistoryDataForResetResponseContent)),
    params(
        ("resetDate" = NaiveDate, Path, description = "The reset date"),
    ),
    request_body = ApiResetAgentPeriodFilterBody
    )]
    pub(crate) async fn get_history_data_for_reset(
        State(pool): State<Pool<Sqlite>>,
        Path(reset_date): Path<NaiveDate>,
        Json(filter): Json<ApiResetAgentPeriodFilterBody>,
    ) -> Json<GetHistoryDataForResetResponseContent> {
        let jump_gate_assignments = load_jump_gate_assignments(&pool, reset_date).await;

        let reset_infos = load_reset_date(&pool, reset_date).await.unwrap().unwrap();

        let ResetPeriodFilter {
            from_event_time_minutes,
            to_event_time_minutes,
            resolution_minutes,
        } = extract_reset_period_from_filter(&filter, reset_infos);

        let agent_symbols = filter.agent_symbols; //.unwrap_or(vec![]);

        let jump_gate_symbols: Vec<String> = jump_gate_assignments
            .iter()
            .filter(|j| {
                j.agents_in_system
                    .iter()
                    .any(|a| agent_symbols.contains(&a.0))
            })
            .map(|j| j.jump_gate_waypoint_symbol.0.clone())
            .unique()
            .collect();

        let construction_material_progress = select_construction_progress_for_reset(
            &pool,
            reset_date,
            from_event_time_minutes.into(),
            to_event_time_minutes.into(),
            resolution_minutes,
            jump_gate_symbols.clone(),
        )
        .await
        .unwrap();

        let agent_history_progress = select_agent_history(
            &pool,
            reset_date,
            from_event_time_minutes.into(),
            to_event_time_minutes.into(),
            resolution_minutes,
            agent_symbols.clone(),
        )
        .await
        .unwrap();

        let api_construction_progress: Vec<_> = construction_material_progress
            .iter()
            .map(|cmp| ApiConstructionMaterialHistoryEntry::try_from(cmp.clone()).unwrap())
            .collect();

        let api_agent_history_progress: Vec<_> = agent_history_progress
            .iter()
            .map(|cmp| ApiAgentHistoryEntry::try_from(cmp.clone()).unwrap())
            .collect();

        let num_jump_gates = jump_gate_symbols.len();
        let num_agents = agent_symbols.len();

        event!(
            Level::DEBUG,
            "Done collecting history agent data for {num_agents}. from_event_time_minutes: {from_event_time_minutes}; to_event_time_minutes: {to_event_time_minutes}; selection_mode: {selection_mode:?}",
            selection_mode=filter.selection_mode
        );
        event!(
            Level::DEBUG,
            "Agent Symbols are {}",
            agent_symbols.join(", ")
        );
        //dbg!(agent_history_progress);
        event!(
            Level::DEBUG,
            "Done collecting history construction data for {num_jump_gates} jump gates",
        );
        event!(
            Level::DEBUG,
            "Jump Gate symbols are {}",
            jump_gate_symbols.join(", ")
        );

        //dbg!(construction_material_progress);

        let response = GetHistoryDataForResetResponseContent {
            requested_agents: agent_symbols
                .iter()
                .map(|s| ApiAgentSymbol(s.clone()))
                .collect(),
            reset_date: ApiResetDate(reset_date.format("%Y-%m-%d").to_string()),
            agent_history: api_agent_history_progress,
            construction_material_history: api_construction_progress,
            resolution_minutes,
        };

        Json(response)
    }
}

struct ResetPeriodFilter {
    from_event_time_minutes: i64,
    to_event_time_minutes: i64,
    resolution_minutes: i64,
}

fn safe_range(v1: u32, v2: u32) -> RangeInclusive<u32> {
    if v1 > v2 {
        v2..=v1
    } else {
        v1..=v2
    }
}

fn extract_reset_period_from_filter(
    filter: &ApiResetAgentPeriodFilterBody,
    reset_infos: ResetDate,
) -> ResetPeriodFilter {
    let event_time_minutes_gte = filter.event_time_minutes_gte;
    let event_time_minutes_lte = filter.event_time_minutes_lte;
    let num_minutes = (reset_infos.latest_ts - reset_infos.first_ts)
        .num_minutes()
        .abs() as u32;

    extract_reset_period(
        filter.selection_mode.clone(),
        event_time_minutes_gte,
        event_time_minutes_lte,
        num_minutes,
    )
}

fn extract_reset_period(
    selection_mode: RangeSelectionMode,
    event_time_minutes_gte: Option<u32>,
    event_time_minutes_lte: u32,
    num_minutes: u32,
) -> ResetPeriodFilter {
    let event_time_minutes = match selection_mode {
        RangeSelectionMode::First => {
            safe_range(event_time_minutes_gte.unwrap_or(0), event_time_minutes_lte)
        }
        RangeSelectionMode::Last => {
            event!(Level::DEBUG, "num_minutes {}", num_minutes);

            if event_time_minutes_lte > num_minutes {
                safe_range(0, num_minutes)
            } else {
                // event_time_minutes_lte <= num_minutes
                // reset is 14 days old
                // asks for last 7 days
                // [14d-7d ... 14 d]
                safe_range(num_minutes - event_time_minutes_lte, num_minutes)
            }
        }
    };

    let from_event_time_minutes: i64 = (*event_time_minutes.start()).into();
    let to_event_time_minutes: i64 = (*event_time_minutes.end()).into();
    let num_minutes: i64 = to_event_time_minutes - from_event_time_minutes;

    let resolution_minutes: i64 = if num_minutes < TimeDelta::hours(6).num_minutes() {
        5
    } else if num_minutes < TimeDelta::days(1).num_minutes() {
        15
    } else {
        60
    };

    ResetPeriodFilter {
        from_event_time_minutes,
        to_event_time_minutes,
        resolution_minutes,
    }
}

fn parse_csv<T: FromStr>(s: &str) -> Vec<T> {
    s.split(',')
        .filter_map(|item| item.trim().parse::<T>().ok())
        .collect()
}

impl TryFrom<DbConstructionMaterialHistoryEntry> for ApiConstructionMaterialHistoryEntry {
    type Error = ();
    fn try_from(cmp: DbConstructionMaterialHistoryEntry) -> Result<Self, Self::Error> {
        Ok(ApiConstructionMaterialHistoryEntry {
            jump_gate_waypoint_symbol: ApiWaypointSymbol(cmp.jump_gate_waypoint_symbol),
            trade_symbol: ApiTradeSymbol(cmp.trade_symbol),
            event_times_minutes: parse_csv(
                cmp.event_time_minutes_csv
                    .unwrap_or("".to_string())
                    .as_str(),
            ),
            fulfilled: parse_csv(cmp.fulfilled_csv.unwrap_or("".to_string()).as_str()),
            required: cmp
                .required
                .and_then(|v| u32::try_from(v).ok()) // flatMap is called and_then in rust-land
                .unwrap_or(0),
        })
    }
}

impl TryFrom<DbAgentHistoryEntry> for ApiAgentHistoryEntry {
    type Error = ();
    fn try_from(db: DbAgentHistoryEntry) -> Result<Self, Self::Error> {
        Ok(ApiAgentHistoryEntry {
            agent_symbol: ApiAgentSymbol(db.agent_symbol),
            event_times_minutes: db.event_times_minutes.unwrap().0,
            credits_timeline: db.credits_timeline.unwrap().0,
            ship_count_timeline: db.ship_count_timeline.unwrap().0,
        })
    }
}

impl TryFrom<DbConstructionMaterialMostRecentStatus>
    for ApiConstructionMaterialMostRecentProgressEntry
{
    type Error = ();
    fn try_from(db: DbConstructionMaterialMostRecentStatus) -> Result<Self, Self::Error> {
        Ok(ApiConstructionMaterialMostRecentProgressEntry {
            trade_symbol: ApiTradeSymbol(db.trade_symbol),
            fulfilled: u32::try_from(db.fulfilled).unwrap(),
            required: u32::try_from(db.required).unwrap(),
            jump_gate_waypoint_symbol: ApiWaypointSymbol(db.jump_gate_waypoint_symbol),
            is_jump_gate_complete: db.is_jump_gate_complete,
        })
    }
}

impl TryFrom<DbJumpGateConstructionEventOverviewEntry>
    for ApiJumpGateConstructionEventOverviewEntry
{
    type Error = ();
    fn try_from(db: DbJumpGateConstructionEventOverviewEntry) -> Result<Self, Self::Error> {
        Ok(ApiJumpGateConstructionEventOverviewEntry {
            ts_start_of_reset: db.ts_start_of_reset,
            trade_symbol: ApiTradeSymbol(db.trade_symbol),
            fulfilled: u32::try_from(db.fulfilled.unwrap_or(0)).unwrap(),
            required: u32::try_from(db.required).unwrap(),
            jump_gate_waypoint_symbol: ApiWaypointSymbol(db.jump_gate_waypoint_symbol),
            ts_first_construction_event: db.ts_first_construction_event,
            ts_last_construction_event: db.ts_last_construction_event,
            is_jump_gate_complete: db.is_jump_gate_complete.unwrap_or(false),
        })
    }
}

impl TryFrom<DbAllTimePerformanceEntry> for ApiAllTimePerformanceEntry {
    type Error = ();
    fn try_from(db: DbAllTimePerformanceEntry) -> Result<Self, Self::Error> {
        Ok(ApiAllTimePerformanceEntry {
            reset: ApiResetDate(db.reset.format("%Y-%m-%d").to_string()),
            agent_symbol: ApiAgentSymbol(db.agent_symbol),
            credits: db.credits,
            rank: u32::try_from(db.rank).unwrap(),
        })
    }
}

impl TryFrom<DbConstructionLeaderboardEntry> for ApiAllTimeConstructionLeaderboardEntry {
    type Error = ();
    fn try_from(db: DbConstructionLeaderboardEntry) -> Result<Self, Self::Error> {
        Ok(ApiAllTimeConstructionLeaderboardEntry {
            reset: ApiResetDate(db.reset_date.format("%Y-%m-%d").to_string()),
            ts_start_of_reset: db.ts_start_of_reset,
            jump_gate_waypoint_symbol: ApiWaypointSymbol(db.jump_gate_waypoint_symbol),
            agents_in_system: db
                .agents_in_system_csv
                .split(',')
                .map(|a| ApiAgentSymbol(a.into()))
                .collect(),
            ts_start_jump_gate_construction: db.ts_start_jump_gate_construction,
            ts_finish_jump_gate_construction: db.ts_finish_jump_gate_construction,
            duration_minutes_start_fortnight_start_jump_gate_construction: u32::try_from(
                db.duration_minutes_start_fortnight_start_jump_gate_construction,
            )
            .unwrap(),
            duration_minutes_start_fortnight_finish_jump_gate_construction: db
                .duration_minutes_start_fortnight_finish_jump_gate_construction
                .and_then(|x| x.try_into().ok()),
            duration_minutes_jump_gate_construction: db
                .duration_minutes_jump_gate_construction
                .and_then(|x| x.try_into().ok()),
            rank_jump_gate_construction: u32::try_from(db.rank_jump_gate_construction).unwrap(),
            rank_start_fortnight_start_jump_gate_construction: u32::try_from(
                db.rank_start_fortnight_start_jump_gate_construction,
            )
            .unwrap(),
            rank_start_fortnight_finish_jump_gate_construction: u32::try_from(
                db.rank_start_fortnight_finish_jump_gate_construction,
            )
            .unwrap(),
        })
    }
}

#[cfg(test)]
mod tests {
    use std::ops::Add;

    use super::*;

    const LAST_WEEK_TEST_DATA: ApiResetAgentPeriodFilterBody = ApiResetAgentPeriodFilterBody {
        agent_symbols: vec![],
        event_time_minutes_lte: TimeDelta::weeks(1).num_minutes() as u32,
        event_time_minutes_gte: None,
        selection_mode: RangeSelectionMode::Last,
    };

    const LAST_DAY_TEST_DATA: ApiResetAgentPeriodFilterBody = ApiResetAgentPeriodFilterBody {
        agent_symbols: vec![],
        event_time_minutes_lte: TimeDelta::days(1).num_minutes() as u32,
        event_time_minutes_gte: None,
        selection_mode: RangeSelectionMode::Last,
    };

    #[test]
    fn test_last_week_of_reset_when_reset_is_less_than_one_week_old() {
        let age_of_reset = TimeDelta::days(4).add(TimeDelta::hours(19));
        let actual = extract_reset_period(
            RangeSelectionMode::Last,
            LAST_WEEK_TEST_DATA.event_time_minutes_gte,
            LAST_WEEK_TEST_DATA.event_time_minutes_lte,
            age_of_reset.num_minutes() as u32,
        );
        assert_eq!(actual.resolution_minutes, 60);
        assert_eq!(actual.from_event_time_minutes, 0);
        assert_eq!(actual.to_event_time_minutes, age_of_reset.num_minutes());
    }

    #[test]
    fn test_last_day_of_reset_when_reset_is_one_week_old() {
        let age_of_reset = TimeDelta::days(7);
        let actual = extract_reset_period(
            RangeSelectionMode::Last,
            LAST_DAY_TEST_DATA.event_time_minutes_gte,
            LAST_DAY_TEST_DATA.event_time_minutes_lte,
            age_of_reset.num_minutes() as u32,
        );
        assert_eq!(actual.resolution_minutes, 60);
        assert_eq!(
            actual.from_event_time_minutes,
            TimeDelta::days(6).num_minutes()
        );
        assert_eq!(actual.to_event_time_minutes, age_of_reset.num_minutes());
    }
}
