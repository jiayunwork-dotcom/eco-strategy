mod engine;
mod game;
mod handlers;
mod models;

use actix_web::{web, App, HttpServer};
use handlers::AppState;
use sqlx::postgres::PgPoolOptions;
use std::collections::HashMap;
use std::sync::Mutex;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init();

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://eco:eco_secret@db:5432/eco_strategy".to_string());

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .unwrap_or_else(|e| {
            log::warn!("Database connection failed: {}. Running in memory-only mode.", e);
            PgPoolOptions::new()
                .max_connections(1)
                .connect_lazy(&database_url)
                .expect("Failed to create lazy pool")
        });

    let app_state = web::Data::new(AppState {
        games: Mutex::new(HashMap::new()),
        db: pool,
        sessions: Mutex::new(HashMap::new()),
    });

    log::info!("Starting server on 0.0.0.0:8080");

    HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone())
            .route("/api/games", web::post().to(handlers::create_game))
            .route("/api/games", web::get().to(handlers::list_games))
            .route("/api/games/{game_id}/join", web::post().to(handlers::join_game))
            .route("/api/games/{game_id}", web::get().to(handlers::get_game_state))
            .route(
                "/api/games/{game_id}/action",
                web::post().to(handlers::submit_action),
            )
            .route(
                "/api/games/{game_id}/turn",
                web::post().to(handlers::advance_turn),
            )
            .route(
                "/api/games/{game_id}/replay",
                web::get().to(handlers::get_replay),
            )
            .route("/ws/{game_id}", web::get().to(handlers::game_ws))
    })
    .bind("0.0.0.0:8080")?
    .run()
    .await
}
