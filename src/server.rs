use std::io::Error;
use std::time::Duration;

use axum::{response::Result, routing, Router};
use sqlx::{Pool, Sqlite};
use tokio::net::TcpListener;
use tower_http::classify::ServerErrorsFailureClass;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing::{event, Level, Span};
use utoipa::OpenApi;
use utoipa_rapidoc::RapiDoc;
use utoipa_redoc::{Redoc, Servable};
use utoipa_swagger_ui::SwaggerUi;

pub async fn http_server(db: Pool<Sqlite>, address: String) -> Result<(), Error> {
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

    let listener = TcpListener::bind(address).await?;
    event!(
        Level::INFO,
        "listening on {}",
        listener.local_addr().unwrap()
    );

    axum::serve(listener, app.into_make_service()).await
}

mod leaderboard {
    use axum::extract::{Path, State};
    use axum::Json;
    use chrono::format::StrftimeItems;
    use chrono::NaiveDate;
    use itertools::Itertools;
    use serde::{Deserialize, Serialize};
    use sqlx::{Pool, Sqlite};
    use tracing::{event, Level};
    use utoipa::{IntoParams, OpenApi, ToSchema};

    use crate::db::{
        load_jump_gate_agent_assignment_for_reset, load_leaderboard_for_reset, load_reset_dates,
        select_construction_progress_for_reset,
    };

    #[derive(OpenApi)]
    #[openapi(
        paths(
            get_reset_dates,
            get_leaderboard,
            get_jump_gate_agents_assignment,
            get_history_data_for_reset
        ),
        components(
            schemas(ApiAgentSymbol),
            schemas(ApiJumpGateAssignmentEntry),
            schemas(ApiLeaderboardEntry),
            schemas(ApiResetDate),
            schemas(ApiWaypointSymbol),
            schemas(GetJumpGateAgentsAssignmentForResetResponseContent),
            schemas(GetLeaderboardForResetResponseContent),
            schemas(ListResetDatesResponseContent),
            schemas(AgentSymbolSearchFilter),
        )
    )]
    pub(crate) struct ApiDoc;

    #[derive(Serialize, Deserialize, ToSchema)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ListResetDatesResponseContent {
        reset_dates: Vec<ApiResetDate>,
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

    #[derive(Serialize, Deserialize, ToSchema, Debug)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ApiHistoryEntry {
        agent_symbol: ApiAgentSymbol,
        event_times_minutes: Vec<u32>,
        min_event_time_minutes: String,
        max_event_time_minutes: String,
        num_entries: String,
        credits_timeline: Vec<i64>,
        ship_count_timeline: Vec<u32>,
    }

    #[derive(Serialize, Deserialize, ToSchema)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct GetHistoryDataForResetResponseContent {
        reset_date: ApiResetDate,
        agent_history: Vec<ApiHistoryEntry>,
    }

    #[derive(Serialize, Deserialize, ToSchema)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ApiResetDate(pub String);

    #[derive(Serialize, Deserialize, ToSchema, Debug)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ApiAgentSymbol(pub String);

    #[derive(Serialize, Deserialize, ToSchema, Debug)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ApiWaypointSymbol(pub String);

    #[derive(Serialize, Deserialize, ToSchema)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ApiLeaderboardEntry {
        agent_symbol: ApiAgentSymbol,
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

    /// List all reset-dates
    #[utoipa::path(get, path = "/api/reset-dates", responses((status = 200, body = ListResetDatesResponseContent)))]
    pub(crate) async fn get_reset_dates(
        State(pool): State<Pool<Sqlite>>,
    ) -> Json<ListResetDatesResponseContent> {
        let fmt = StrftimeItems::new("%Y-%m-%d");
        let reset_dates = load_reset_dates(&pool).await.unwrap();
        let response = reset_dates
            .iter()
            .map(|r| ApiResetDate(r.reset.format_with_items(fmt.clone()).to_string()))
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

    async fn load_jump_gate_assignments(
        pool: &Pool<Sqlite>,
        reset_date: NaiveDate,
    ) -> Vec<ApiJumpGateAssignmentEntry> {
        let db_jump_gate_assignment_entries =
            load_jump_gate_agent_assignment_for_reset(&pool, reset_date)
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

    /// Agent Symbols Filter
    #[derive(Deserialize, ToSchema)]
    pub(crate) struct AgentSymbolSearchFilter {
        pub(crate) agent_symbols: Vec<String>,
    }

    /// Get the history data for a reset
    #[utoipa::path(
    post,
    path = "/api/history/{resetDate}",
    responses((status = 200, body = String)),
    params(
        ("resetDate" = NaiveDate, Path, description = "The reset date"),
    ),
    request_body = AgentSymbolSearchFilter
    )]
    pub(crate) async fn get_history_data_for_reset(
        State(pool): State<Pool<Sqlite>>,
        Path(reset_date): Path<NaiveDate>,
        Json(filter): Json<AgentSymbolSearchFilter>,
    ) -> Json<String> {
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

        let construction_progress = select_construction_progress_for_reset(
            &pool,
            reset_date,
            0,
            1 * 24 * 60,
            30,
            jump_gate_symbols.clone(),
        )
        .await
        .unwrap();

        let num_jump_gates = jump_gate_symbols.len();
        let num_agents = agent_symbols.len();

        event!(
            Level::DEBUG,
            "Done collecting construction data for {num_agents} and {num_jump_gates} jump gates",
        );
        event!(
            Level::DEBUG,
            "Jump Gate symbols are {}",
            jump_gate_symbols.join(", ")
        );

        dbg!(jump_gate_symbols);
        dbg!(construction_progress);

        Json("???".into())
    }
}
