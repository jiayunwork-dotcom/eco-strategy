use actix::{Actor, Addr, Handler, Message, StreamHandler};
use actix_web::{web, Error, HttpRequest, HttpResponse};
use actix_web_actors::ws;
use serde::Deserialize;
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::Mutex;
use uuid::Uuid;

use crate::game::{
    check_player_elimination, check_victory, execute_player_action, generate_map,
    initialize_species_catalog, process_turn,
};
use crate::models::{
    GameStatus, GameState, Player, PlayerAction, PlayerActionType, Population, TrophicLevel,
    TurnResult, ClimateState,
};

pub struct AppState {
    pub games: Mutex<HashMap<Uuid, GameState>>,
    pub db: PgPool,
    pub sessions: Mutex<HashMap<Uuid, Vec<Addr<GameSession>>>>,
}

#[derive(Deserialize)]
pub struct CreateGameRequest {
    pub name: String,
    pub max_players: u8,
}

#[derive(Deserialize)]
pub struct JoinGameRequest {
    pub player_name: String,
}

#[derive(Deserialize)]
pub struct ActionRequest {
    pub player_id: Uuid,
    pub action: PlayerAction,
}

#[derive(Deserialize)]
#[serde(tag = "type")]
pub enum WsMessage {
    #[serde(rename = "join")]
    Join { player_id: Uuid },
    #[serde(rename = "action")]
    Action { action: PlayerAction },
    #[serde(rename = "advance_turn")]
    AdvanceTurn,
}

pub async fn create_game(
    data: web::Data<AppState>,
    body: web::Json<CreateGameRequest>,
) -> HttpResponse {
    if body.max_players < 4 || body.max_players > 6 {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "max_players must be between 4 and 6"
        }));
    }

    let game_id = Uuid::new_v4();
    let cells = generate_map(body.max_players as usize, 5);
    let (species_catalog, predation_matrix) = initialize_species_catalog();

    let game = GameState {
        id: game_id,
        name: body.name.clone(),
        players: HashMap::new(),
        cells,
        species_catalog,
        predation_matrix,
        climate: ClimateState::default(),
        current_turn: 0,
        max_turns: 50,
        max_players: body.max_players,
        status: GameStatus::Waiting,
    };

    let mut games = data.games.lock().unwrap();
    games.insert(game_id, game);

    HttpResponse::Ok().json(serde_json::json!({ "game_id": game_id }))
}

pub async fn join_game(
    data: web::Data<AppState>,
    path: web::Path<Uuid>,
    body: web::Json<JoinGameRequest>,
) -> HttpResponse {
    let game_id = path.into_inner();
    let mut games = data.games.lock().unwrap();

    let game = match games.get_mut(&game_id) {
        Some(g) => g,
        None => {
            return HttpResponse::NotFound()
                .json(serde_json::json!({ "error": "Game not found" }))
        }
    };

    if game.status != GameStatus::Waiting {
        return HttpResponse::BadRequest()
            .json(serde_json::json!({ "error": "Game is not waiting for players" }));
    }

    let player_count = game.players.len() as u8;
    if player_count >= game.max_players {
        return HttpResponse::BadRequest()
            .json(serde_json::json!({ "error": "Game is full" }));
    }

    let player_id = Uuid::new_v4();
    let palette = [
        "#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c",
    ];
    let color = palette[player_count as usize % palette.len()];

    let mut actions_remaining = HashMap::new();
    actions_remaining.insert(PlayerActionType::IntroduceSpecies, 3);
    actions_remaining.insert(PlayerActionType::HabitatConversion, 2);
    actions_remaining.insert(PlayerActionType::HuntingQuota, 3);
    actions_remaining.insert(PlayerActionType::SpeciesProtection, 2);
    actions_remaining.insert(PlayerActionType::BioInvasion, 1);

    let player = Player {
        id: player_id,
        name: body.player_name.clone(),
        color: color.to_string(),
        resource_points: 50,
        is_alive: true,
        actions_remaining,
        stable_turns_count: 0,
    };

    let producer_ids: Vec<Uuid> = game
        .species_catalog
        .iter()
        .filter(|s| s.trophic_level == TrophicLevel::Producer)
        .take(2)
        .map(|s| s.id)
        .collect();
    let consumer_id = game
        .species_catalog
        .iter()
        .find(|s| s.trophic_level == TrophicLevel::PrimaryConsumer)
        .map(|s| s.id);
    let decomposer_id = game
        .species_catalog
        .iter()
        .find(|s| s.trophic_level == TrophicLevel::Decomposer)
        .map(|s| s.id);

    let player_idx = game.players.len();
    let angle = 2.0 * std::f64::consts::PI * player_idx as f64 / game.max_players as f64;
    let start_q = (5.0_f64 * 0.6 * angle.cos()).round() as i32;
    let start_r = (5.0_f64 * 0.6 * angle.sin()).round() as i32;

    let mut assigned_cells: Vec<(i32, i32)> = Vec::new();
    let mut candidates: Vec<((i32, i32), f64)> = Vec::new();
    for (pos, cell) in game.cells.iter() {
        if cell.owner_id.is_none() && !matches!(cell.biome, crate::models::Biome::Ocean) {
            let dist = ((cell.q - start_q) as f64).powi(2) + ((cell.r - start_r) as f64).powi(2);
            candidates.push((*pos, dist));
        }
    }
    candidates.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
    for (pos, _) in candidates.iter().take(8) {
        assigned_cells.push(*pos);
    }

    for pos in &assigned_cells {
        if let Some(cell) = game.cells.get_mut(pos) {
            cell.owner_id = Some(player_id);

            for &sid in &producer_ids {
                cell.populations.push(Population {
                    species_id: sid,
                    count: 30.0,
                    biomass: 15.0,
                    protected: false,
                    hunting_quota: 0,
                    introduced_by: Some(player_id),
                });
            }
            if let Some(cid) = consumer_id {
                cell.populations.push(Population {
                    species_id: cid,
                    count: 30.0,
                    biomass: 15.0,
                    protected: false,
                    hunting_quota: 0,
                    introduced_by: Some(player_id),
                });
            }
            if let Some(did) = decomposer_id {
                cell.populations.push(Population {
                    species_id: did,
                    count: 30.0,
                    biomass: 15.0,
                    protected: false,
                    hunting_quota: 0,
                    introduced_by: Some(player_id),
                });
            }
        }
    }

    game.players.insert(player_id, player);

    if game.players.len() as u8 >= game.max_players {
        game.status = GameStatus::Running;
    }

    HttpResponse::Ok().json(serde_json::json!({ "player_id": player_id }))
}

pub async fn get_game_state(
    data: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> HttpResponse {
    let game_id = path.into_inner();
    let games = data.games.lock().unwrap();

    match games.get(&game_id) {
        Some(game) => HttpResponse::Ok().json(game),
        None => HttpResponse::NotFound().json(serde_json::json!({ "error": "Game not found" })),
    }
}

pub async fn submit_action(
    data: web::Data<AppState>,
    path: web::Path<Uuid>,
    body: web::Json<ActionRequest>,
) -> HttpResponse {
    let game_id = path.into_inner();
    let mut games = data.games.lock().unwrap();

    let game = match games.get_mut(&game_id) {
        Some(g) => g,
        None => {
            return HttpResponse::NotFound()
                .json(serde_json::json!({ "error": "Game not found" }))
        }
    };

    if game.status != GameStatus::Running {
        return HttpResponse::BadRequest()
            .json(serde_json::json!({ "error": "Game is not running" }));
    }

    if !game.players.contains_key(&body.player_id) {
        return HttpResponse::BadRequest()
            .json(serde_json::json!({ "error": "Player not in game" }));
    }

    match execute_player_action(game, body.player_id, body.action.clone()) {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({ "success": true })),
        Err(e) => HttpResponse::BadRequest().json(serde_json::json!({ "error": e })),
    }
}

pub async fn advance_turn(
    data: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> HttpResponse {
    let game_id = path.into_inner();
    let result;

    {
        let mut games = data.games.lock().unwrap();

        let game = match games.get_mut(&game_id) {
            Some(g) => g,
            None => {
                return HttpResponse::NotFound()
                    .json(serde_json::json!({ "error": "Game not found" }))
            }
        };

        if game.status != GameStatus::Running {
            return HttpResponse::BadRequest()
                .json(serde_json::json!({ "error": "Game is not running" }));
        }

        result = process_turn(game);

        check_player_elimination(game);

        if let Some(_vr) = check_victory(game) {
            game.status = GameStatus::Finished;
        }
    }

    broadcast_turn_result(game_id, &result, &data.sessions);

    HttpResponse::Ok().json(result)
}

pub struct GameSession {
    game_id: Uuid,
    player_id: Option<Uuid>,
    state: web::Data<AppState>,
}

impl Actor for GameSession {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        let addr = ctx.address();
        let mut sessions = self.state.sessions.lock().unwrap();
        sessions
            .entry(self.game_id)
            .or_insert_with(Vec::new)
            .push(addr);
    }

    fn stopping(&mut self, ctx: &mut Self::Context) -> actix::Running {
        let mut sessions = self.state.sessions.lock().unwrap();
        if let Some(list) = sessions.get_mut(&self.game_id) {
            list.retain(|addr| addr != &ctx.address());
        }
        actix::Running::Stop
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for GameSession {
    fn handle(
        &mut self,
        msg: Result<ws::Message, ws::ProtocolError>,
        ctx: &mut ws::WebsocketContext<Self>,
    ) {
        let msg = match msg {
            Ok(msg) => msg,
            Err(_) => {
                ctx.stop();
                return;
            }
        };

        match msg {
            ws::Message::Text(text) => {
                let ws_msg: WsMessage = match serde_json::from_str(&text) {
                    Ok(m) => m,
                    Err(_) => return,
                };

                match ws_msg {
                    WsMessage::Join { player_id } => {
                        self.player_id = Some(player_id);
                    }
                    WsMessage::Action { action } => {
                        if let Some(pid) = self.player_id {
                            let mut games = self.state.games.lock().unwrap();
                            if let Some(game) = games.get_mut(&self.game_id) {
                                let _ = execute_player_action(game, pid, action);
                            }
                        }
                    }
                    WsMessage::AdvanceTurn => {
                        let mut games = self.state.games.lock().unwrap();
                        let game = match games.get_mut(&self.game_id) {
                            Some(g) if g.status == GameStatus::Running => g,
                            _ => return,
                        };
                        let result = process_turn(game);
                        check_player_elimination(game);
                        if let Some(_vr) = check_victory(game) {
                            game.status = GameStatus::Finished;
                        }
                        drop(games);
                        broadcast_turn_result(self.game_id, &result, &self.state.sessions);
                    }
                }
            }
            ws::Message::Close(_) => {
                ctx.stop();
            }
            _ => {}
        }
    }
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct WsOut(pub String);

impl Handler<WsOut> for GameSession {
    type Result = ();

    fn handle(&mut self, msg: WsOut, ctx: &mut ws::WebsocketContext<Self>) {
        ctx.text(msg.0);
    }
}

pub fn broadcast_turn_result(
    game_id: Uuid,
    result: &TurnResult,
    sessions: &Mutex<HashMap<Uuid, Vec<Addr<GameSession>>>>,
) {
    let json = match serde_json::to_string(result) {
        Ok(j) => j,
        Err(_) => return,
    };

    let sessions = sessions.lock().unwrap();
    if let Some(addrs) = sessions.get(&game_id) {
        for addr in addrs {
            addr.do_send(WsOut(json.clone()));
        }
    }
}

pub async fn game_ws(
    req: HttpRequest,
    stream: web::Payload,
    data: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, Error> {
    let game_id = path.into_inner();

    {
        let games = data.games.lock().unwrap();
        if !games.contains_key(&game_id) {
            return Ok(HttpResponse::NotFound().finish());
        }
    }

    let session = GameSession {
        game_id,
        player_id: None,
        state: data,
    };

    ws::start(session, &req, stream)
}
