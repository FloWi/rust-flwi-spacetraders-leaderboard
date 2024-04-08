use std::io::Error;

use axum::{response::Result, routing, Router};
use sqlx::{Pool, Sqlite};
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;
use tracing::{event, Level};
use utoipa::OpenApi;
use utoipa_rapidoc::RapiDoc;
use utoipa_redoc::{Redoc, Servable};
use utoipa_swagger_ui::SwaggerUi;

pub async fn http_server(db: Pool<Sqlite>, address: String) -> Result<(), Error> {
    let app = Router::new()
        .merge(
            SwaggerUi::new("/swagger-ui")
                .url("/api-docs/openapi.json", leaderboard::ApiDoc::openapi()),
        )
        .merge(Redoc::with_url("/redoc", leaderboard::ApiDoc::openapi()))
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
        .layer(CorsLayer::very_permissive())
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
    use serde::{Deserialize, Serialize};
    use sqlx::{Pool, Sqlite};
    use utoipa::{OpenApi, ToSchema};

    use crate::db::{load_leaderboard_for_reset, load_reset_dates};
    use crate::model::AgentSymbol;

    #[derive(OpenApi)]
    #[openapi(
        paths(get_reset_dates, get_leaderboard),
        components(
            schemas(ListResetDatesResponseContent),
            schemas(ApiResetDate),
            schemas(GetLeaderboardForResetResponseContent),
            schemas(ApiLeaderboardEntry),
            schemas(ApiAgentSymbol),
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
    pub(crate) struct ApiResetDate(pub String);

    #[derive(Serialize, Deserialize, ToSchema)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ApiAgentSymbol(pub String);

    #[derive(Serialize, Deserialize, ToSchema)]
    #[serde(rename_all = "camelCase")]
    pub(crate) struct ApiLeaderboardEntry {
        agent_symbol: ApiAgentSymbol,
        credits: i64,
        ship_count: i64,
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
}
