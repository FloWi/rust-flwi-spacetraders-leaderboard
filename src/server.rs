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
    use axum::extract::State;
    use axum::Json;
    use chrono::format::StrftimeItems;
    use serde::{Deserialize, Serialize};
    use sqlx::{Pool, Sqlite};
    use utoipa::{OpenApi, ToSchema};

    use crate::db::load_reset_dates;

    #[derive(OpenApi)]
    #[openapi(
        paths(get_reset_dates),
        components(schemas(ListResetDatesResponseContent), schemas(ApiResetDate))
    )]
    pub(crate) struct ApiDoc;

    #[derive(Serialize, Deserialize, ToSchema)]
    pub(crate) struct ListResetDatesResponseContent {
        reset_dates: Vec<ApiResetDate>,
    }

    #[derive(Serialize, Deserialize, ToSchema)]
    pub(crate) struct ApiResetDate(pub String);

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
}
