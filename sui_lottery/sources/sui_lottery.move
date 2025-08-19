module move_logic::tile_game_core;

use sui::clock::{Self, Clock};
use sui::event;
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::dynamic_object_field as dof;
use sui::object::{Self, ID, UID};
use sui::tx_context::{Self, TxContext};
use sui::transfer;
use sui::option::{Self, Option};
use sui::vec_set::{Self, VecSet};

// --------------------------------------------------
// Constants / Errors
// --------------------------------------------------
const BOARD_SIZE: u8 = 10;                  // 10x10
const MAX_TILES: u64 = 10;
const TURN_TIMEOUT_MS: u64 = 3000;
const DEFAULT_CAP_MOVES: u64 = 10000;
const DIR_NONE: u8 = 255;
const JOIN_FEE: u64 = 50000000;             // 0.05 SUI in MIST (10^9 MIST = 1 SUI)
const TOTAL_POT: u64 = 100000000;           // 0.1 SUI in MIST
const TILE_REWARD: u64 = 10000000;          // 0.01 SUI per tile in MIST

// 상태코드: 0 Lobby, 1 Placement, 2 Playing, 3 Finished
const STATUS_LOBBY: u8 = 0;
const STATUS_PLACEMENT: u8 = 1;
const STATUS_PLAYING: u8 = 2;
const STATUS_FINISHED: u8 = 3;

const E_INVALID_PLAYER: u64 = 2;
const E_NOT_PLAYER_TURN: u64 = 3;
const E_GAME_NOT_ACTIVE: u64 = 6;
const E_CAP_EMPTY: u64 = 11;
const E_NOT_CREATOR: u64 = 13;
const E_WRONG_FUNDING_AMOUNT: u64 = 14;
const E_TURN_TIMEOUT_NOT_REACHED: u64 = 20;
const E_GAME_FULL: u64 = 21;
const E_ALREADY_JOINED: u64 = 22;
const E_BAD_COORD: u64 = 24;
const E_ALREADY_PLACED: u64 = 25;
const E_NOT_PLACEMENT: u64 = 26;
const E_NOT_BOTH_PLACED: u64 = 27;
const E_TILE_NOT_FOUND: u64 = 28;           // 추가: 타일 없음
const E_ALREADY_CLAIMED: u64 = 29;          // 추가: 이미 캡처됨
const E_INSUFFICIENT_POT: u64 = 30;         // 추가: pot 부족

// --------------------------------------------------
// Structs
// --------------------------------------------------
public struct Coord has copy, drop, store { x: u8, y: u8 }

public struct SuiTile has key, store {
    id: UID,
    game_id: ID,
    position: Coord,
    reward: Option<Coin<SUI>>,              // 타일 보상 코인 (캡처 시 이전)
    claimed: bool,
    owner: Option<address>,
}

public struct GameStatus has copy, drop, store { value: u8 } // 0 Lobby, 1 Placement, 2 Playing, 3 Finished

#[allow(lint(coin_field))]
public struct Game has key {
    id: UID,
    creator: address,
    board_size: u8,
    players: vector<address>,          // length 0–2
    current_turn: u8,                  // 0 or 1 (Playing에서만 의미)
    status: GameStatus,
    tiles_remaining: u64,
    turn_start_time: u64,
    winner: Option<address>,
    pot: Coin<SUI>,
    move_caps_created: bool,

    // 내부 상태
    players_positions: vector<Coord>,
    players_scores: vector<u64>,
    last_directions: vector<u8>,
    scores_cache: vector<u64>,

    // Placement 단계 상태
    has_placed: vector<bool>,
    starter_index: u8,

    // 타일 관리 (dynamic object fields 키로 사용)
    tile_positions: vector<Coord>,     // 모든 타일 좌표 목록 (조회용)
}

public struct GameRegistry has key {
    id: UID,
    games: vector<ID>,
}

public struct MoveCap has key, store {
    id: UID,
    game_id: ID,
    player_address: address,
    moves_remaining: u64,
}

// --------------------------------------------------
// Events
// --------------------------------------------------
public struct GameCreated has copy, drop { game_id: ID, creator: address, board_size: u8 }
public struct PlayerJoined has copy, drop { game_id: ID, player: address, player_index: u8 }
public struct GameStarted has copy, drop { game_id: ID, players: vector<address>, starter_index: u8 }

public struct PlayerMoved has copy, drop {
    game_id: ID,
    player: address,
    player_index: u8,
    from_pos: Coord,
    to_pos: Coord,
    turn_index: u8,
    direction: u8,
}

public struct PlayerAutoMoved has copy, drop {
    game_id: ID,
    player: address,
    player_index: u8,
    from_pos: Coord,
    to_pos: Coord,
    direction: u8,
}

public struct TileCaptured has copy, drop {
    game_id: ID,
    position: Coord,
    player: address,
    player_index: u8,
    value: u64,
    new_score: u64,
}

public struct TurnChanged has copy, drop { game_id: ID, new_turn_player: address, turn_index: u8 }

public struct GameFinished has copy, drop {
    game_id: ID,
    winner: Option<address>,
    scores: vector<u64>,
}

public struct StartPlaced has copy, drop {
    game_id: ID,
    player: address,
    player_index: u8,
    position: Coord,
    placed_count: u8,
}

// --------------------------------------------------
// Initialization
// --------------------------------------------------
fun init(ctx: &mut TxContext) {
    let reg = GameRegistry { id: object::new(ctx), games: vector::empty() };
    transfer::share_object(reg);
}

// --------------------------------------------------
// Game creation / joining
// --------------------------------------------------
public entry fun create_game(registry: &mut GameRegistry, ctx: &mut TxContext): ID {
    let gid = object::new(ctx);
    let gid_inner = object::uid_to_inner(&gid);
    let game = Game {
        id: gid,
        creator: tx_context::sender(ctx),
        board_size: BOARD_SIZE,
        players: vector::empty(),
        current_turn: 0,
        status: GameStatus { value: STATUS_LOBBY },
        tiles_remaining: MAX_TILES,
        turn_start_time: 0,
        winner: option::none<address>(),
        pot: coin::zero<SUI>(ctx),
        move_caps_created: false,

        // 빈 상태로 시작
        players_positions: vector::empty<Coord>(),
        players_scores: vector::empty<u64>(),
        last_directions: vector::empty<u8>(),
        scores_cache: vector::empty<u64>(),

        has_placed: vector::empty<bool>(),
        starter_index: 0,

        tile_positions: vector::empty<Coord>(),
    };
    vector::push_back(&mut registry.games, gid_inner);
    event::emit(GameCreated { game_id: gid_inner, creator: tx_context::sender(ctx), board_size: BOARD_SIZE });
    transfer::share_object(game);
    gid_inner
}

public entry fun join_game(game: &mut Game, fee: Coin<SUI>, ctx: &mut TxContext) {
    assert!(game.status.value == STATUS_LOBBY, E_GAME_NOT_ACTIVE);
    assert!(coin::value(&fee) == JOIN_FEE, E_WRONG_FUNDING_AMOUNT);
    let sender = tx_context::sender(ctx);
    if (contains_address(&game.players, sender)) {
        abort E_ALREADY_JOINED
    };
    assert!(vector::length(&game.players) < 2, E_GAME_FULL);

    // pot에 fee 추가
    coin::join(&mut game.pot, fee);

    vector::push_back(&mut game.players, sender);
    let idx = (vector::length(&game.players) as u8) - 1;
    event::emit(PlayerJoined {
        game_id: object::uid_to_inner(&game.id),
        player: sender,
        player_index: idx
    });

    // 두 명이 모이면 Placement 단계 준비
    if (vector::length(&game.players) == 2) {
        // players_positions / has_placed / 점수/방향 초기화
        vector::push_back(&mut game.players_positions, Coord { x: 0, y: 0 }); // placeholder
        vector::push_back(&mut game.players_positions, Coord { x: 0, y: 0 }); // placeholder

        vector::push_back(&mut game.has_placed, false);
        vector::push_back(&mut game.has_placed, false);

        vector::push_back(&mut game.players_scores, 0);
        vector::push_back(&mut game.players_scores, 0);
        vector::push_back(&mut game.last_directions, DIR_NONE);
        vector::push_back(&mut game.last_directions, DIR_NONE);
        vector::push_back(&mut game.scores_cache, 0);
        vector::push_back(&mut game.scores_cache, 0);

        game.status.value = STATUS_PLACEMENT;
    }
}

// --------------------------------------------------
// Placement: choose starting cell
// --------------------------------------------------
public entry fun choose_start(game: &mut Game, x: u8, y: u8, ctx: &mut TxContext) {
    assert!(game.status.value == STATUS_PLACEMENT, E_NOT_PLACEMENT);
    assert!(x < game.board_size && y < game.board_size, E_BAD_COORD);

    let sender = tx_context::sender(ctx);
    let idx = player_index(&game.players, sender);
    assert!(idx < 2, E_INVALID_PLAYER);

    // 이미 선택했는지 확인
    let already = *vector::borrow(&game.has_placed, idx);
    assert!(!already, E_ALREADY_PLACED);

    // 좌표 기록 & placed 표시
    *vector::borrow_mut(&mut game.players_positions, idx) = Coord { x, y };
    *vector::borrow_mut(&mut game.has_placed, idx) = true;

    // 마지막 선택자 = 선공
    game.starter_index = idx as u8;

    let mut count: u8 = 0;
    if (*vector::borrow(&game.has_placed, 0)) { count = count + 1; };
    if (*vector::borrow(&game.has_placed, 1)) { count = count + 1; };

    event::emit(StartPlaced {
        game_id: object::uid_to_inner(&game.id),
        player: sender,
        player_index: idx as u8,
        position: Coord { x, y },
        placed_count: count,
    });
}

// --------------------------------------------------
// Start Game
// --------------------------------------------------
public entry fun start_game(
    game: &mut Game,
    clock: &Clock,
    ctx: &mut TxContext
) {
    assert!(game.status.value == STATUS_PLACEMENT, E_GAME_NOT_ACTIVE);
    assert!(vector::length(&game.players) == 2, E_NOT_PLAYER_TURN);
    assert!(tx_context::sender(ctx) == game.creator, E_NOT_CREATOR);

    // 두 플레이어 모두 시작 위치를 선택했는지 확인
    assert!(*vector::borrow(&game.has_placed, 0), E_NOT_BOTH_PLACED);
    assert!(*vector::borrow(&game.has_placed, 1), E_NOT_BOTH_PLACED);

    // pot 총액 확인: 0.1 SUI
    assert!(coin::value(&game.pot) == TOTAL_POT, E_WRONG_FUNDING_AMOUNT);

    // 타일 생성 (pot을 10개로 쪼개서 각 타일에 배정)
    create_tiles(game, ctx);

    // MoveCap 생성 및 전송
    create_move_caps(game, ctx);

    // 선공은 starter_index
    game.current_turn = game.starter_index;
    game.status.value = STATUS_PLAYING;
    game.turn_start_time = clock::timestamp_ms(clock);

    event::emit(GameStarted {
        game_id: object::uid_to_inner(&game.id),
        players: game.players,
        starter_index: game.starter_index,
    });
}

// --------------------------------------------------
// MoveCap creation
// --------------------------------------------------
public entry fun create_move_caps(game: &mut Game, ctx: &mut TxContext) {
    assert!(!game.move_caps_created, E_INVALID_PLAYER);
    let p0 = *vector::borrow(&game.players, 0);
    let p1 = *vector::borrow(&game.players, 1);

    let cap0 = MoveCap {
        id: object::new(ctx),
        game_id: object::uid_to_inner(&game.id),
        player_address: p0,
        moves_remaining: DEFAULT_CAP_MOVES,
    };
    let cap1 = MoveCap {
        id: object::new(ctx),
        game_id: object::uid_to_inner(&game.id),
        player_address: p1,
        moves_remaining: DEFAULT_CAP_MOVES,
    };

    transfer::transfer(cap0, p0);
    transfer::transfer(cap1, p1);
    game.move_caps_created = true;
}

// --------------------------------------------------
// Manual move
// --------------------------------------------------
public entry fun move_with_cap(
    game: &mut Game,
    cap: &mut MoveCap,
    direction: u8,
    clock: &Clock,
    ctx: &mut TxContext
) {
    assert!(game.status.value == STATUS_PLAYING, E_GAME_NOT_ACTIVE);
    let sender = tx_context::sender(ctx);
    assert!(cap.player_address == sender, E_INVALID_PLAYER);

    let idx = player_index(&game.players, sender);
    assert!(idx < 999, E_INVALID_PLAYER);
    let uidx = idx;
    let turn_idx = game.current_turn as u64;
    assert!(uidx == turn_idx, E_NOT_PLAYER_TURN);
    assert!(cap.moves_remaining > 0, E_CAP_EMPTY);

    let now = clock::timestamp_ms(clock);
    let old_pos = *vector::borrow(&game.players_positions, uidx);
    let new_pos = apply_direction(old_pos, direction, game.board_size);

    // Update state
    *vector::borrow_mut(&mut game.players_positions, uidx) = new_pos;
    *vector::borrow_mut(&mut game.last_directions, uidx) = direction;
    cap.moves_remaining = cap.moves_remaining - 1;

    event::emit(PlayerMoved {
        game_id: object::uid_to_inner(&game.id),
        player: sender,
        player_index: game.current_turn,
        from_pos: old_pos,
        to_pos: new_pos,
        turn_index: game.current_turn,
        direction,
    });

    capture_if_tile(game, uidx, ctx);
    rotate_turn(game, now);
}

// --------------------------------------------------
// Forced timeout move
// --------------------------------------------------
public entry fun force_timeout_move(
    game: &mut Game,
    clock: &Clock,
    ctx: &mut TxContext
) {
    assert!(game.status.value == STATUS_PLAYING, E_GAME_NOT_ACTIVE);
    let now = clock::timestamp_ms(clock);
    let elapsed = now - game.turn_start_time;
    assert!(elapsed > TURN_TIMEOUT_MS, E_TURN_TIMEOUT_NOT_REACHED);

    let cur_idx = game.current_turn as u64;
    let player_addr = *vector::borrow(&game.players, cur_idx);

    let old_pos = *vector::borrow(&game.players_positions, cur_idx);
    let dir = *vector::borrow(&game.last_directions, cur_idx);
    let new_pos = if (dir == DIR_NONE) { old_pos } else { apply_direction(old_pos, dir, game.board_size) };
    *vector::borrow_mut(&mut game.players_positions, cur_idx) = new_pos;

    event::emit(PlayerAutoMoved {
        game_id: object::uid_to_inner(&game.id),
        player: player_addr,
        player_index: game.current_turn,
        from_pos: old_pos,
        to_pos: new_pos,
        direction: dir,
    });

    capture_if_tile(game, cur_idx, ctx);
    rotate_turn(game, now);
}

// --------------------------------------------------
// Tile generation / capture
// --------------------------------------------------
fun create_tiles(game: &mut Game, ctx: &mut TxContext) {
    let mut placed_positions = vec_set::empty<Coord>();
    let mut i = 0;
    while (i < MAX_TILES) {
        // pot에서 TILE_REWARD만큼 split
        assert!(coin::value(&game.pot) >= TILE_REWARD, E_INSUFFICIENT_POT);
        let reward_coin = coin::split(&mut game.pot, TILE_REWARD, ctx);

        // 중복되지 않는 위치 생성
        let mut pos: Coord;
        loop {
            pos = pseudo_position(i, game.board_size);
            if (!vec_set::contains(&placed_positions, &pos)) {
                break
            };
            i = i + 1; // 시드 변경을 위해 i 증가 (간단한 방법)
        };
        vec_set::insert(&mut placed_positions, pos);

        let tile = SuiTile {
            id: object::new(ctx),
            game_id: object::uid_to_inner(&game.id),
            position: pos,
            reward: option::some(reward_coin),
            claimed: false,
            owner: option::none<address>(),
        };

        // Game의 dynamic object field에 추가 (키: Coord, 값: SuiTile)
        dof::add(&mut game.id, pos, tile);

        // 조회용 position 목록 추가
        vector::push_back(&mut game.tile_positions, pos);

        i = i + 1;
    };
}

fun capture_if_tile(game: &mut Game, player_uindex: u64, ctx: &mut TxContext) {
    if (game.tiles_remaining == 0) return;
    let pos = *vector::borrow(&game.players_positions, player_uindex);

    // 위치에 타일이 존재하는지 확인
    if (!dof::exists_<Coord>(&game.id, pos)) {
        return; // 타일 없음, 무시
    };

    // 타일 mutable borrow
    let tile = dof::borrow_mut<Coord, SuiTile>(&mut game.id, pos);
    assert!(!tile.claimed, E_ALREADY_CLAIMED);

    let paddr = *vector::borrow(&game.players, player_uindex);

    // reward 추출 및 이전
    let reward_opt = &mut tile.reward;
    assert!(option::is_some(reward_opt), E_TILE_NOT_FOUND);
    let reward = option::extract(reward_opt);
    let tile_value = coin::value(&reward);

    // 점수 업데이트
    let cur = *vector::borrow(&game.players_scores, player_uindex);
    let new_score = cur + tile_value;
    *vector::borrow_mut(&mut game.players_scores, player_uindex) = new_score;
    *vector::borrow_mut(&mut game.scores_cache, player_uindex) = new_score;

    // 타일 상태 업데이트
    tile.claimed = true;
    tile.owner = option::some(paddr);

    // 보상 코인 소유권 이전
    transfer::public_transfer(reward, paddr);

    game.tiles_remaining = game.tiles_remaining - 1;

    event::emit(TileCaptured {
        game_id: object::uid_to_inner(&game.id),
        position: pos,
        player: paddr,
        player_index: player_uindex as u8,
        value: tile_value,
        new_score,
    });

    if (game.tiles_remaining == 0) {
        finish_game(game);
    };
}

// --------------------------------------------------
// Winner resolution
// --------------------------------------------------
fun finish_game(game: &mut Game) {
    if (game.status.value != STATUS_PLAYING) return;
    game.status.value = STATUS_FINISHED;

    let s0 = *vector::borrow(&game.players_scores, 0);
    let s1 = *vector::borrow(&game.players_scores, 1);
    if (s0 > s1) {
        let p0 = *vector::borrow(&game.players, 0);
        game.winner = option::some<address>(p0);
    } else if (s1 > s0) {
        let p1 = *vector::borrow(&game.players, 1);
        game.winner = option::some<address>(p1);
    } else {
        game.winner = option::none<address>();
    };

    event::emit(GameFinished {
        game_id: object::uid_to_inner(&game.id),
        winner: game.winner,
        scores: game.players_scores,
    });
}

// --------------------------------------------------
// Turn rotation
// --------------------------------------------------
fun rotate_turn(game: &mut Game, now: u64) {
    if (game.status.value != STATUS_PLAYING) return;
    game.current_turn = (game.current_turn + 1) % 2;
    game.turn_start_time = now;
    let next_addr = *vector::borrow(&game.players, (game.current_turn as u64));
    event::emit(TurnChanged {
        game_id: object::uid_to_inner(&game.id),
        new_turn_player: next_addr,
        turn_index: game.current_turn,
    });
}

// --------------------------------------------------
// Utility functions
// --------------------------------------------------
fun apply_direction(pos: Coord, dir: u8, size: u8): Coord {
    if (dir == 0) {
        if (pos.y > 0) { Coord { x: pos.x, y: pos.y - 1 } } else { pos }
    } else if (dir == 1) {
        if (pos.x < size - 1) { Coord { x: pos.x + 1, y: pos.y } } else { pos }
    } else if (dir == 2) {
        if (pos.y < size - 1) { Coord { x: pos.x, y: pos.y + 1 } } else { pos }
    } else if (dir == 3) {
        if (pos.x > 0) { Coord { x: pos.x - 1, y: pos.y } } else { pos }
    } else {
        pos
    }
}

fun pseudo_position(seed: u64, size: u8): Coord {
    let x = ((seed * 17 + 5) % (size as u64)) as u8;
    let y = ((seed * 19 + 11) % (size as u64)) as u8;
    Coord { x, y }
}

fun contains_address(addrs: &vector<address>, target: address): bool {
    let len = vector::length(addrs);
    let mut i = 0;
    while (i < len) {
        let v = *vector::borrow(addrs, i);
        if (v == target) return true;
        i = i + 1;
    };
    false
}

fun player_index(addrs: &vector<address>, a: address): u64 {
    let len = vector::length(addrs);
    let mut i = 0;
    while (i < len) {
        if (*vector::borrow(addrs, i) == a) {
            return i
        };
        i = i + 1;
    };
    999 // not found
}

// --------------------------------------------------
// Real-time status query functions (실시간 상태 조회 함수)
// --------------------------------------------------
// 모든 타일 위치 목록 반환 (클라이언트가 각 위치로 세부 정보 조회 가능)
public fun get_tile_positions(game: &Game): vector<Coord> {
    game.tile_positions
}

// 특정 위치의 타일 정보 조회 (position, claimed, owner, reward value if not claimed)
public fun get_tile_info(game: &Game, pos: Coord): (Coord, u64, bool, Option<address>) {
    if (!dof::exists_<Coord>(&game.id, pos)) {
        abort E_TILE_NOT_FOUND
    };
    let tile = dof::borrow<Coord, SuiTile>(&game.id, pos);
    let reward_value = if (option::is_some(&tile.reward)) {
        coin::value(option::borrow(&tile.reward))
    } else {
        0
    };
    (tile.position, reward_value, tile.claimed, tile.owner)
}

// --------------------------------------------------
// Getters (기존)
// --------------------------------------------------
public fun get_status(game: &Game): u8 { game.status.value }
public fun get_current_turn(game: &Game): u8 { game.current_turn }
public fun get_turn_start_time(game: &Game): u64 { game.turn_start_time }
public fun get_tiles_remaining(game: &Game): u64 { game.tiles_remaining }
public fun get_players(game: &Game): vector<address> { game.players }
public fun get_positions(game: &Game): vector<Coord> { game.players_positions }
public fun get_scores(game: &Game): vector<u64> { game.players_scores }
public fun get_last_directions(game: &Game): vector<u8> { game.last_directions }
public fun get_winner(game: &Game): Option<address> { game.winner }

// --------------------------------------------------
// Test-only
// --------------------------------------------------
#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    let reg = GameRegistry { id: object::new(ctx), games: vector::empty() };
    transfer::share_object(reg);
}