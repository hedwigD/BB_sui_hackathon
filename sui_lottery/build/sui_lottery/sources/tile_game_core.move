module move_logic::tile_game_core;

use sui::clock::{Self, Clock};
use sui::event;
use sui::coin;
use sui::sui::SUI;

// --------------------------------------------------
// Constants / Errors
// --------------------------------------------------
const BOARD_SIZE: u8 = 10;                  // [CHANGED] 10x10
const MAX_TILES: u64 = 10;
const TURN_TIMEOUT_MS: u64 = 3000;
const DEFAULT_CAP_MOVES: u64 = 10000;
const DIR_NONE: u8 = 255;

// 상태코드: 0 Lobby, 1 Placement, 2 Playing, 3 Finished
const STATUS_LOBBY: u8 = 0;                 // [CHANGED] 상태 정의 추가
const STATUS_PLACEMENT: u8 = 1;             // [CHANGED]
const STATUS_PLAYING: u8 = 2;               // [CHANGED]
const STATUS_FINISHED: u8 = 3;              // [CHANGED]

const E_INVALID_PLAYER: u64 = 2;
const E_NOT_PLAYER_TURN: u64 = 3;
const E_GAME_NOT_ACTIVE: u64 = 6;
const E_CAP_EMPTY: u64 = 11;
const E_NOT_CREATOR: u64 = 13;
const E_WRONG_FUNDING_AMOUNT: u64 = 14;
const E_TURN_TIMEOUT_NOT_REACHED: u64 = 20;
const E_GAME_FULL: u64 = 21;
const E_ALREADY_JOINED: u64 = 22;
// const E_NOT_FOUND: u64 = 23;
const E_BAD_COORD: u64 = 24;                // [CHANGED] 좌표 범위 오류
const E_ALREADY_PLACED: u64 = 25;           // [CHANGED] 이미 시작 위치 선택함
const E_NOT_PLACEMENT: u64 = 26;            // [CHANGED] Placement 단계 아님
const E_NOT_BOTH_PLACED: u64 = 27;          // [CHANGED] 둘 다 선택 안 됨

// --------------------------------------------------
// Structs
// --------------------------------------------------
public struct Coord has copy, drop, store { x: u8, y: u8 }

public struct SuiTile has key, store {
    id: UID,
    game_id: ID,
    position: Coord,
    value: u64,
    claimed: bool,
    owner: option::Option<address>,
}

public struct GameStatus has copy, drop, store { value: u8 } // 0 Lobby, 1 Placement, 2 Playing, 3 Finished

#[allow(lint(coin_field))]
public struct Game has key {
    id: UID,
    creator: address,
    board_size: u8,
    players: vector<address>,          // length 0–2
    current_turn: u8,                  // 0 or 1 (Playing에서만 의미)
    status: GameStatus,                // [CHANGED] 단계 확장
    tiles_remaining: u64,
    turn_start_time: u64,
    winner: option::Option<address>,
    pot: coin::Coin<SUI>,
    tile_ids: vector<ID>,
    move_caps_created: bool,

    // 내부 상태
    players_positions: vector<Coord>,  // [CHANGED] Placement에서 채움
    players_scores: vector<u64>,
    last_directions: vector<u8>,
    scores_cache: vector<u64>,

    // Placement 단계 상태
    has_placed: vector<bool>,          // [CHANGED] 각 플레이어가 시작 위치를 선택했는지
    starter_index: u8,                 // [CHANGED] 마지막에 선택한 사람(= 선공)
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
public struct GameStarted has copy, drop { game_id: ID, players: vector<address>, starter_index: u8 }  // [CHANGED] starter_index 추가

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
    tile_id: ID,
    player: address,
    player_index: u8,
    position: Coord,
    value: u64,
    new_score: u64,
}

public struct TurnChanged has copy, drop { game_id: ID, new_turn_player: address, turn_index: u8 }

public struct GameFinished has copy, drop {
    game_id: ID,
    winner: option::Option<address>,
    scores: vector<u64>,
}

public struct StartPlaced has copy, drop {                 // [CHANGED] 시작 위치 선택 이벤트
    game_id: ID,
    player: address,
    player_index: u8,
    position: Coord,
    placed_count: u8, // 누적 몇 명 선택했는지
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
        status: GameStatus { value: STATUS_LOBBY },       // [CHANGED]
        tiles_remaining: MAX_TILES,
        turn_start_time: 0,
        winner: option::none<address>(),
        pot: coin::zero<SUI>(ctx),
        tile_ids: vector::empty(),
        move_caps_created: false,

        // 빈 상태로 시작
        players_positions: vector::empty<Coord>(),
        players_scores: vector::empty<u64>(),
        last_directions: vector::empty<u8>(),
        scores_cache: vector::empty<u64>(),

        has_placed: vector::empty<bool>(),                // [CHANGED]
        starter_index: 0,                                  // [CHANGED]
    };
    vector::push_back(&mut registry.games, gid_inner);
    event::emit(GameCreated { game_id: gid_inner, creator: tx_context::sender(ctx), board_size: BOARD_SIZE });
    transfer::share_object(game);
    gid_inner
}

public entry fun join_game(game: &mut Game, ctx: &mut TxContext) {
    assert!(game.status.value == STATUS_LOBBY, E_GAME_NOT_ACTIVE);
    let sender = tx_context::sender(ctx);
    if (contains_address(&game.players, sender)) {
        abort E_ALREADY_JOINED
    };
    assert!(vector::length(&game.players) < 2, E_GAME_FULL);

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

        game.status.value = STATUS_PLACEMENT;            // [CHANGED]
    }
}

// --------------------------------------------------
// Placement: choose starting cell (공개 보드 배치 전)
// --------------------------------------------------
public entry fun choose_start(game: &mut Game, x: u8, y: u8, ctx: &mut TxContext) {  // [CHANGED] 새 함수
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

    let _placed_count: u8 = (vector::length(&game.players) as u8)  // 두 명이라고 가정
        - (if (*vector::borrow(&game.has_placed, 0)) { 0 } else { 1 })
        - (if (*vector::borrow(&game.has_placed, 1)) { 0 } else { 1 });
    // placed_count 계산을 간단하게 다시:
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
// Start Game (보드 공개 + 선공 확정)
// --------------------------------------------------
public entry fun start_game(
    game: &mut Game,
    tile_funding: coin::Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext
) {
    assert!(game.status.value == STATUS_PLACEMENT, E_GAME_NOT_ACTIVE);
    assert!(vector::length(&game.players) == 2, E_NOT_PLAYER_TURN);
    assert!(tx_context::sender(ctx) == game.creator, E_NOT_CREATOR);

    // 두 플레이어 모두 시작 위치를 선택했는지 확인
    assert!(*vector::borrow(&game.has_placed, 0), E_NOT_BOTH_PLACED);
    assert!(*vector::borrow(&game.has_placed, 1), E_NOT_BOTH_PLACED);

    // 타일 펀딩: 총액 = MAX_TILES
    assert!(coin::value(&tile_funding) == MAX_TILES, E_WRONG_FUNDING_AMOUNT);
    coin::join(&mut game.pot, tile_funding);

    // 여기서 타일 생성(공개 보드)
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
// Forced timeout move (anyone can call)
// --------------------------------------------------
public entry fun force_timeout_move(
    game: &mut Game,
    clock: &Clock,
    _ctx: &mut TxContext
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

    capture_if_tile(game, cur_idx, _ctx);
    rotate_turn(game, now);
}

// --------------------------------------------------
// Tile generation / capture
// --------------------------------------------------
fun create_tiles(game: &mut Game, ctx: &mut TxContext) {
    let mut i = 0;
    while (i < MAX_TILES) {
        let pos = pseudo_position(i, game.board_size);
        let tile = SuiTile {
            id: object::new(ctx),
            game_id: object::uid_to_inner(&game.id),
            position: pos,
            value: 1,
            claimed: false,
            owner: option::none<address>(),
        };
        let tid = object::uid_to_inner(&tile.id);
        vector::push_back(&mut game.tile_ids, tid);
        transfer::share_object(tile);
        i = i + 1;
    };
}

fun capture_if_tile(game: &mut Game, player_uindex: u64, ctx: &mut TxContext) {
    if (game.tiles_remaining == 0) return;
    let pos = *vector::borrow(&game.players_positions, player_uindex);

    // 데모용 간단화: 실제로는 타일 객체 위치 비교 및 claimed 갱신을 해야 함.
    // 여기서는 1개 캡처 처리 후 break.
    let len = vector::length(&game.tile_ids);
    let i = 0;
    while (i < len) {
        let tid = *vector::borrow(&game.tile_ids, i);

        let paddr = *vector::borrow(&game.players, player_uindex);

        // 점수 +1
        let cur = *vector::borrow(&game.players_scores, player_uindex);
        let tile_value = 1u64;
        let new_score = cur + tile_value;
        *vector::borrow_mut(&mut game.players_scores, player_uindex) = new_score;
        *vector::borrow_mut(&mut game.scores_cache, player_uindex) = new_score;

        game.tiles_remaining = game.tiles_remaining - 1;

        if (coin::value(&game.pot) >= tile_value) {
            let reward = coin::split(&mut game.pot, tile_value, ctx);
            transfer::public_transfer(reward, paddr);
        };

        event::emit(TileCaptured {
            game_id: object::uid_to_inner(&game.id),
            tile_id: tid,
            player: paddr,
            player_index: player_uindex as u8,
            position: pos,
            value: tile_value,
            new_score,
        });

        if (game.tiles_remaining == 0) {
            finish_game(game);
        };
        break
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

// Linear search (only 2 players -> trivial cost)
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
// Getters
// --------------------------------------------------
public fun get_status(game: &Game): u8 { game.status.value }
public fun get_current_turn(game: &Game): u8 { game.current_turn }
public fun get_turn_start_time(game: &Game): u64 { game.turn_start_time }
public fun get_tiles_remaining(game: &Game): u64 { game.tiles_remaining }
public fun get_players(game: &Game): vector<address> { game.players }
public fun get_positions(game: &Game): vector<Coord> { game.players_positions }
public fun get_scores(game: &Game): vector<u64> { game.players_scores }
public fun get_last_directions(game: &Game): vector<u8> { game.last_directions }
public fun get_winner(game: &Game): option::Option<address> { game.winner }

// --------------------------------------------------
// Test-only
// --------------------------------------------------
#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    let reg = GameRegistry { id: object::new(ctx), games: vector::empty() };
    transfer::share_object(reg);
}
