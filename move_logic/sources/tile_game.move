module move_logic::tile_game;

use sui::event;
use sui::clock::{Self, Clock};

// Constants
const BOARD_SIZE: u8 = 10;
const MAX_TILES: u64 = 10;
const TURN_TIMEOUT_MS: u64 = 3000; // 3 seconds

// Error codes
const E_GAME_NOT_FOUND: u64 = 1;
const E_INVALID_PLAYER: u64 = 2;
const E_NOT_PLAYER_TURN: u64 = 3;
const E_INVALID_MOVE: u64 = 4;
const E_GAME_FULL: u64 = 5;
const E_GAME_NOT_ACTIVE: u64 = 6;
const E_OUT_OF_BOUNDS: u64 = 7;
const E_TURN_TIMEOUT: u64 = 8;

// Coordinate struct
public struct Coord has copy, drop, store {
    x: u8,
    y: u8,
}

// Player struct
public struct Player has key, store {
    id: UID,
    game_id: ID,
    owner: address,
    name: vector<u8>,
    position: Coord,
    score: u64,
    player_index: u8,
}

// Sui Tile struct
public struct SuiTile has key, store {
    id: UID,
    game_id: ID,
    position: Coord,
    value: u64,
    owner: option::Option<address>,
}

// Game state enum
public struct GameStatus has copy, drop, store {
    value: u8, // 0: Lobby, 1: Playing, 2: Finished
}

// Game struct
public struct Game has key {
    id: UID,
    creator: address,
    board_size: u8,
    players: vector<address>,
    current_turn: u8,
    status: GameStatus,
    tiles_remaining: u64,
    turn_start_time: u64,
    winner: option::Option<address>,
}

// Game Registry for tracking games
public struct GameRegistry has key {
    id: UID,
    games: vector<ID>,
}

// Move capability - allows holder to make moves without repeated approvals
public struct MoveCap has key, store {
    id: UID,
    game_id: ID,
    player_address: address,
    moves_remaining: u64,
    expires_at: u64,
}

// Events
public struct GameCreated has copy, drop {
    game_id: ID,
    creator: address,
    board_size: u8,
}

public struct PlayerJoined has copy, drop {
    game_id: ID,
    player: address,
    player_name: vector<u8>,
    player_index: u8,
}

public struct GameStarted has copy, drop {
    game_id: ID,
    players: vector<address>,
}

public struct PlayerMoved has copy, drop {
    game_id: ID,
    player: address,
    from_pos: Coord,
    to_pos: Coord,
    turn: u8,
}

public struct TileCaptured has copy, drop {
    game_id: ID,
    tile_id: ID,
    player: address,
    position: Coord,
    value: u64,
}

public struct GameFinished has copy, drop {
    game_id: ID,
    winner: address,
    final_scores: vector<u64>,
}

public struct TurnChanged has copy, drop {
    game_id: ID,
    new_turn_player: address,
    turn_index: u8,
}

// Initialize module
fun init(ctx: &mut TxContext) {
    let registry = GameRegistry {
        id: object::new(ctx),
        games: vector::empty(),
    };
    transfer::share_object(registry);
}

// Create a new game
public fun create_game(
    registry: &mut GameRegistry,
    clock: &Clock,
    ctx: &mut TxContext
): ID {
    let game_id = object::new(ctx);
    let game_id_copy = object::uid_to_inner(&game_id);
    
    let game = Game {
        id: game_id,
        creator: tx_context::sender(ctx),
        board_size: BOARD_SIZE,
        players: vector::empty(),
        current_turn: 0,
        status: GameStatus { value: 0 }, // Lobby
        tiles_remaining: MAX_TILES,
        turn_start_time: clock::timestamp_ms(clock),
        winner: option::none<address>(),
    };
    
    vector::push_back(&mut registry.games, game_id_copy);
    
    event::emit(GameCreated {
        game_id: game_id_copy,
        creator: tx_context::sender(ctx),
        board_size: BOARD_SIZE,
    });
    
    transfer::share_object(game);
    game_id_copy
}

// Join a game
public fun join_game(
    game: &mut Game,
    name: vector<u8>,
    ctx: &mut TxContext
): ID {
    assert!(game.status.value == 0, E_GAME_NOT_ACTIVE); // Must be in lobby
    assert!(vector::length(&game.players) < 2, E_GAME_FULL);
    
    let player_address = tx_context::sender(ctx);
    let player_index = (vector::length(&game.players) as u8);
    
    // Set starting position based on player index
    let start_pos = if (player_index == 0) {
        Coord { x: 0, y: 0 }
    } else {
        Coord { x: BOARD_SIZE - 1, y: BOARD_SIZE - 1 }
    };
    
    let player_id = object::new(ctx);
    let player_id_copy = object::uid_to_inner(&player_id);
    
    let player = Player {
        id: player_id,
        game_id: object::uid_to_inner(&game.id),
        owner: player_address,
        name,
        position: start_pos,
        score: 0,
        player_index,
    };
    
    vector::push_back(&mut game.players, player_address);
    
    event::emit(PlayerJoined {
        game_id: object::uid_to_inner(&game.id),
        player: player_address,
        player_name: name,
        player_index,
    });
    
    transfer::transfer(player, player_address);
    player_id_copy
}

// Start the game and create tiles
public fun start_game(
    game: &mut Game,
    clock: &Clock,
    ctx: &mut TxContext
) {
    assert!(game.status.value == 0, E_GAME_NOT_ACTIVE); // Must be in lobby
    assert!(vector::length(&game.players) == 2, E_GAME_FULL); // Need exactly 2 players
    assert!(tx_context::sender(ctx) == game.creator, E_INVALID_PLAYER);
    
    game.status.value = 1; // Playing
    game.turn_start_time = clock::timestamp_ms(clock);
    
    // Create 10 random Sui tiles
    create_random_tiles(game, ctx);
    
    event::emit(GameStarted {
        game_id: object::uid_to_inner(&game.id),
        players: game.players,
    });
}

// Create move capability for a player (approve once, move multiple times)
public fun create_move_capability(
    game: &Game,
    moves_count: u64,
    duration_minutes: u64,
    clock: &Clock,
    ctx: &mut TxContext
): MoveCap {
    assert!(game.status.value == 1, E_GAME_NOT_ACTIVE); // Must be playing
    
    let player_address = tx_context::sender(ctx);
    let expires_at = clock::timestamp_ms(clock) + (duration_minutes * 60 * 1000);
    
    MoveCap {
        id: object::new(ctx),
        game_id: object::uid_to_inner(&game.id),
        player_address,
        moves_remaining: moves_count,
        expires_at,
    }
}

// Create random tiles for the game
fun create_random_tiles(_game: &Game, ctx: &mut TxContext) {
    let game_id = object::uid_to_inner(&_game.id);
    
    // Create 10 tiles with pseudo-random positions
    let mut i = 0;
    while (i < MAX_TILES) {
        let position = generate_random_position(i, ctx);
        
        let tile = SuiTile {
            id: object::new(ctx),
            game_id,
            position,
            value: 1, // Each tile worth 1 point
            owner: option::none<address>(),
        };
        
        transfer::share_object(tile);
        i = i + 1;
    };
}

// Generate pseudo-random position (avoiding corners)
fun generate_random_position(seed: u64, _ctx: &mut TxContext): Coord {
    // Simple pseudo-random based on seed
    let rand_x = ((seed * 17 + 42) % (BOARD_SIZE as u64)) as u8;
    let rand_y = ((seed * 23 + 73) % (BOARD_SIZE as u64)) as u8;
    
    // Avoid corners where players start
    if ((rand_x == 0 && rand_y == 0) || (rand_x == BOARD_SIZE - 1 && rand_y == BOARD_SIZE - 1)) {
        Coord { x: BOARD_SIZE / 2, y: BOARD_SIZE / 2 }
    } else {
        Coord { x: rand_x, y: rand_y }
    }
}

// Move player using capability (no wallet approval needed after first one)
public fun move_player_with_cap(
    cap: &mut MoveCap,
    game: &mut Game,
    player: &mut Player,
    direction: u8,
    clock: &Clock,
    ctx: &mut TxContext
) {
    assert!(game.status.value == 1, E_GAME_NOT_ACTIVE);
    assert!(cap.moves_remaining > 0, E_INVALID_MOVE);
    assert!(clock::timestamp_ms(clock) <= cap.expires_at, E_TURN_TIMEOUT);
    assert!(cap.player_address == tx_context::sender(ctx), E_INVALID_PLAYER);
    
    // Execute the move
    move_player_internal(game, player, direction, clock, ctx);
    
    // Consume one move from capability
    cap.moves_remaining = cap.moves_remaining - 1;
}

// Original move player function (requires approval each time)
public fun move_player(
    game: &mut Game,
    player: &mut Player,
    direction: u8, // 0: up, 1: right, 2: down, 3: left
    clock: &Clock,
    ctx: &mut TxContext
) {
    assert!(game.status.value == 1, E_GAME_NOT_ACTIVE); // Must be playing
    
    let player_address = tx_context::sender(ctx);
    assert!(player.owner == player_address, E_INVALID_PLAYER);
    assert!(vector::borrow(&game.players, (game.current_turn as u64)) == &player_address, E_NOT_PLAYER_TURN);
    
    move_player_internal(game, player, direction, clock, ctx);
}

// Internal move logic (shared by both functions)
fun move_player_internal(
    game: &mut Game,
    player: &mut Player,
    direction: u8,
    clock: &Clock,
    ctx: &mut TxContext
) {
    // Check turn timeout
    let current_time = clock::timestamp_ms(clock);
    assert!(current_time - game.turn_start_time <= TURN_TIMEOUT_MS, E_TURN_TIMEOUT);
    
    let old_pos = player.position;
    let new_pos = calculate_new_position(old_pos, direction);
    
    // Validate new position is within bounds
    assert!(new_pos.x < BOARD_SIZE && new_pos.y < BOARD_SIZE, E_OUT_OF_BOUNDS);
    
    // Update player position
    player.position = new_pos;
    
    let player_address = tx_context::sender(ctx);
    event::emit(PlayerMoved {
        game_id: object::uid_to_inner(&game.id),
        player: player_address,
        from_pos: old_pos,
        to_pos: new_pos,
        turn: game.current_turn,
    });
    
    // Switch turns
    game.current_turn = (game.current_turn + 1) % 2;
    game.turn_start_time = current_time;
    
    let next_player = *vector::borrow(&game.players, (game.current_turn as u64));
    event::emit(TurnChanged {
        game_id: object::uid_to_inner(&game.id),
        new_turn_player: next_player,
        turn_index: game.current_turn,
    });
}

// Calculate new position based on direction
fun calculate_new_position(current: Coord, direction: u8): Coord {
    if (direction == 0) { // up
        Coord { x: current.x, y: if (current.y > 0) current.y - 1 else current.y }
    } else if (direction == 1) { // right
        Coord { x: if (current.x < BOARD_SIZE - 1) current.x + 1 else current.x, y: current.y }
    } else if (direction == 2) { // down
        Coord { x: current.x, y: if (current.y < BOARD_SIZE - 1) current.y + 1 else current.y }
    } else { // left
        Coord { x: if (current.x > 0) current.x - 1 else current.x, y: current.y }
    }
}

// Capture tile when player moves over it
public fun capture_tile(
    game: &mut Game,
    player: &mut Player,
    tile: &mut SuiTile,
    ctx: &mut TxContext
) {
    assert!(game.status.value == 1, E_GAME_NOT_ACTIVE);
    
    let player_address = tx_context::sender(ctx);
    assert!(player.owner == player_address, E_INVALID_PLAYER);
    assert!(option::is_none<address>(&tile.owner), E_INVALID_MOVE); // Tile must be uncaptured
    
    // Check if player is at tile position
    assert!(player.position.x == tile.position.x && player.position.y == tile.position.y, E_INVALID_MOVE);
    
    // Capture the tile
    tile.owner = option::some<address>(player_address);
    player.score = player.score + tile.value;
    game.tiles_remaining = game.tiles_remaining - 1;
    
    event::emit(TileCaptured {
        game_id: object::uid_to_inner(&game.id),
        tile_id: object::uid_to_inner(&tile.id),
        player: player_address,
        position: tile.position,
        value: tile.value,
    });
    
    // Check if game is finished
    if (game.tiles_remaining == 0) {
        finish_game(game, ctx);
    }
}

// Finish the game
fun finish_game(game: &mut Game, _ctx: &TxContext) {
    game.status.value = 2; // Finished
    
    // Determine winner (for now, just set to first player - would need to track scores properly)
    let winner = *vector::borrow(&game.players, 0);
    game.winner = option::some<address>(winner);
    
    event::emit(GameFinished {
        game_id: object::uid_to_inner(&game.id),
        winner,
        final_scores: vector[0, 0], // Would track actual scores
    });
}

// Accessor functions
public fun get_player_position(player: &Player): Coord {
    player.position
}

public fun get_player_score(player: &Player): u64 {
    player.score
}

public fun get_game_status(game: &Game): u8 {
    game.status.value
}

public fun get_current_turn(game: &Game): u8 {
    game.current_turn
}

public fun get_tile_position(tile: &SuiTile): Coord {
    tile.position
}

public fun get_tile_owner(tile: &SuiTile): option::Option<address> {
    tile.owner
}

public fun is_tile_captured(tile: &SuiTile): bool {
    option::is_some<address>(&tile.owner)
}

// Helper function to get coordinate values
public fun coord_x(coord: &Coord): u8 {
    coord.x
}

public fun coord_y(coord: &Coord): u8 {
    coord.y
}

// Helper function to create coordinates for testing
public fun new_coord(x: u8, y: u8): Coord {
    Coord { x, y }
}

// Get remaining moves from capability
public fun get_cap_moves_remaining(cap: &MoveCap): u64 {
    cap.moves_remaining
}

// Check if capability is expired
public fun is_cap_expired(cap: &MoveCap, clock: &Clock): bool {
    clock::timestamp_ms(clock) > cap.expires_at
}

// Destroy empty capability
public fun destroy_empty_cap(cap: MoveCap) {
    let MoveCap { id, game_id: _, player_address: _, moves_remaining, expires_at: _ } = cap;
    assert!(moves_remaining == 0, E_INVALID_MOVE);
    object::delete(id);
}

// Test helper to create and share registry
#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    let registry = GameRegistry {
        id: object::new(ctx),
        games: vector::empty(),
    };
    transfer::share_object(registry);
}