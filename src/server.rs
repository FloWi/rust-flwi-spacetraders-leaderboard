use std::io::Error;
use std::path::PathBuf;
use std::str::FromStr;
use std::time::Duration;

use axum::{response::Result, routing, Router};
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
    DbAgentHistoryEntry, DbConstructionMaterialHistoryEntry, DbConstructionMaterialMostRecentStatus,
};
use crate::server::leaderboard::{
    ApiAgentHistoryEntry, ApiAgentSymbol, ApiConstructionMaterialHistoryEntry,
    ApiConstructionMaterialMostRecentProgressEntry, ApiResetDate, ApiTradeSymbol,
    ApiWaypointSymbol,
};

pub fn with_static_file_server(router: Router, serve_dir: ServeDir) -> Router {
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
            "/api/history/:reset_date",
            routing::post(leaderboard::get_history_data_for_reset),
        )
        .layer(CorsLayer::very_permissive())
        .layer(TraceLayer::new_for_http().on_failure(
            |error: ServerErrorsFailureClass, latency: Duration, _span: &Span| {
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
                    .not_found_service(ServeFile::new(asset_dir.clone().join("index.html"))),
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
    use chrono::{NaiveDate, NaiveDateTime};
    use itertools::Itertools;
    use serde::{Deserialize, Serialize};
    use sqlx::{Pool, Sqlite};
    use tracing::{event, Level};
    use utoipa::{IntoParams, OpenApi, ToSchema};

    use crate::db::{
        load_leaderboard_for_reset, load_reset_dates, select_agent_history,
        select_construction_progress_for_reset, select_jump_gate_agent_assignment_for_reset,
        select_most_recent_construction_progress_for_reset,
    };

    #[derive(OpenApi)]
    #[openapi(
        paths(
            get_reset_dates,
            get_leaderboard,
            get_jump_gate_agents_assignment,
            get_history_data_for_reset,
            get_jump_gate_most_recent_progress
        ),
        components(
            schemas(ApiAgentSymbol),
            schemas(ApiJumpGateAssignmentEntry),
            schemas(ApiLeaderboardEntry),
            schemas(ApiResetDate),
            schemas(ApiResetDateMeta),
            schemas(ApiWaypointSymbol),
            schemas(GetJumpGateAgentsAssignmentForResetResponseContent),
            schemas(GetLeaderboardForResetResponseContent),
            schemas(GetHistoryDataForResetResponseContent),
            schemas(ListResetDatesResponseContent),
            schemas(AgentSymbolFilterBody),
            schemas(ApiTradeSymbol),
            schemas(ApiAgentHistoryEntry),
            schemas(ApiConstructionMaterialHistoryEntry),
            schemas(GetJumpGateMostRecentProgressForResetResponseContent),
            schemas(ApiJumpGateAssignmentEntry),
            schemas(ApiConstructionMaterialMostRecentProgressEntry),
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
    pub(crate) struct GetJumpGateMostRecentProgressForResetResponseContent {
        reset_date: ApiResetDate,
        progress_entries: Vec<ApiConstructionMaterialMostRecentProgressEntry>,
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

    /// Agent Symbols Filter
    #[derive(Deserialize, ToSchema)]
    pub(crate) struct AgentSymbolFilterBody {
        pub(crate) agent_symbols: Vec<String>,
    }

    /// Get the history data for a reset
    #[utoipa::path(
    post,
    path = "/api/history/{resetDate}",
    responses((status = 200, body = GetHistoryDataForResetResponseContent)),
    params(
        ("resetDate" = NaiveDate, Path, description = "The reset date"),
    ),
    request_body = AgentSymbolFilterBody
    )]
    pub(crate) async fn get_history_data_for_reset(
        State(pool): State<Pool<Sqlite>>,
        Path(reset_date): Path<NaiveDate>,
        Json(filter): Json<AgentSymbolFilterBody>,
    ) -> Json<GetHistoryDataForResetResponseContent> {
        let jump_gate_assignments = load_jump_gate_assignments(&pool, reset_date).await;

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
            0,
            1 * 24 * 60,
            30,
            jump_gate_symbols.clone(),
        )
        .await
        .unwrap();

        let agent_history_progress =
            select_agent_history(&pool, reset_date, 0, 1 * 24 * 60, 30, agent_symbols.clone())
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
            "Done collecting history agent data for {num_agents}",
        );
        event!(
            Level::DEBUG,
            "Agent Symbols are {}",
            agent_symbols.join(", ")
        );
        dbg!(agent_history_progress);
        event!(
            Level::DEBUG,
            "Done collecting history construction data for {num_jump_gates} jump gates",
        );
        event!(
            Level::DEBUG,
            "Jump Gate symbols are {}",
            jump_gate_symbols.join(", ")
        );

        dbg!(construction_material_progress);

        let response = GetHistoryDataForResetResponseContent {
            requested_agents: agent_symbols
                .iter()
                .map(|s| ApiAgentSymbol(s.clone()))
                .collect(),
            reset_date: ApiResetDate(reset_date.format("%Y-%m-%d").to_string()),
            agent_history: api_agent_history_progress,
            construction_material_history: api_construction_progress,
        };

        Json(response)
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
