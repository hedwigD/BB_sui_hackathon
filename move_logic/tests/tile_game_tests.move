#[test_only]
module move_logic::tile_game_tests;

use move_logic::tile_game::{Self, GameRegistry, Game, Player, SuiTile, Coord};
use sui::test_scenario::{Self as test, Scenario, next_tx, ctx};
use sui::clock;
use sui::transfer;

// Test addresses
const ADMIN: address = @0xAD;
const PLAYER1: address = @0x1;
const PLAYER2: address = @0x2;

#[test]
public fun test_create_game() {
    let mut scenario = test::begin(ADMIN);
    let clock = clock::create_for_testing(ctx(&mut scenario));
    
    // Create game registry
    tile_game::init_for_testing(ctx(&mut scenario));
    
    next_tx(&mut scenario, ADMIN);
    {
        let mut registry = test::take_shared<GameRegistry>(&scenario);
        let game_id = tile_game::create_game(&mut registry, &clock, ctx(&mut scenario));
        
        // Verify game was created
        assert!(game_id != sui::object::id_from_address(@0x0), 0);
        
        test::return_shared(registry);
    };
    
    clock::destroy_for_testing(clock);
    test::end(scenario);
}

#[test]
public fun test_join_game() {
    let mut scenario = test::begin(ADMIN);
    let clock = clock::create_for_testing(ctx(&mut scenario));
    
    // Initialize and create game
    tile_game::init_for_testing(ctx(&mut scenario));
    
    next_tx(&mut scenario, ADMIN);
    let game_id = {
        let mut registry = test::take_shared<GameRegistry>(&scenario);
        let id = tile_game::create_game(&mut registry, &clock, ctx(&mut scenario));
        test::return_shared(registry);
        id
    };
    
    // Player 1 joins
    next_tx(&mut scenario, PLAYER1);
    {
        let mut game = test::take_shared<Game>(&scenario);
        let player_id = tile_game::join_game(&mut game, b"Player1", ctx(&mut scenario));
        
        // Verify player was created
        assert!(player_id != sui::object::id_from_address(@0x0), 0);
        
        test::return_shared(game);
    };
    
    // Player 2 joins
    next_tx(&mut scenario, PLAYER2);
    {
        let mut game = test::take_shared<Game>(&scenario);
        let player_id = tile_game::join_game(&mut game, b"Player2", ctx(&mut scenario));
        
        // Verify player was created
        assert!(player_id != sui::object::id_from_address(@0x0), 0);
        
        test::return_shared(game);
    };
    
    clock::destroy_for_testing(clock);
    test::end(scenario);
}

#[test]
public fun test_start_game() {
    let mut scenario = test::begin(ADMIN);
    let clock = clock::create_for_testing(ctx(&mut scenario));
    
    // Initialize and create game
    tile_game::init_for_testing(ctx(&mut scenario));
    
    next_tx(&mut scenario, ADMIN);
    let game_id = {
        let mut registry = test::take_shared<GameRegistry>(&scenario);
        let id = tile_game::create_game(&mut registry, &clock, ctx(&mut scenario));
        test::return_shared(registry);
        id
    };
    
    // Players join
    next_tx(&mut scenario, PLAYER1);
    {
        let mut game = test::take_shared<Game>(&scenario);
        tile_game::join_game(&mut game, b"Player1", ctx(&mut scenario));
        test::return_shared(game);
    };
    
    next_tx(&mut scenario, PLAYER2);
    {
        let mut game = test::take_shared<Game>(&scenario);
        tile_game::join_game(&mut game, b"Player2", ctx(&mut scenario));
        test::return_shared(game);
    };
    
    // Start game
    next_tx(&mut scenario, ADMIN);
    {
        let mut game = test::take_shared<Game>(&scenario);
        tile_game::start_game(&mut game, &clock, ctx(&mut scenario));
        
        // Verify game status changed to playing (1)
        assert!(tile_game::get_game_status(&game) == 1, 0);
        
        test::return_shared(game);
    };
    
    clock::destroy_for_testing(clock);
    test::end(scenario);
}

#[test]
public fun test_player_movement() {
    let mut scenario = test::begin(ADMIN);
    let clock = clock::create_for_testing(ctx(&mut scenario));
    
    // Setup complete game
    tile_game::init_for_testing(ctx(&mut scenario));
    
    next_tx(&mut scenario, ADMIN);
    let game_id = {
        let mut registry = test::take_shared<GameRegistry>(&scenario);
        let id = tile_game::create_game(&mut registry, &clock, ctx(&mut scenario));
        test::return_shared(registry);
        id
    };
    
    // Players join
    next_tx(&mut scenario, PLAYER1);
    {
        let mut game = test::take_shared<Game>(&scenario);
        tile_game::join_game(&mut game, b"Player1", ctx(&mut scenario));
        test::return_shared(game);
    };
    
    next_tx(&mut scenario, PLAYER2);
    {
        let mut game = test::take_shared<Game>(&scenario);
        tile_game::join_game(&mut game, b"Player2", ctx(&mut scenario));
        test::return_shared(game);
    };
    
    // Start game
    next_tx(&mut scenario, ADMIN);
    {
        let mut game = test::take_shared<Game>(&scenario);
        tile_game::start_game(&mut game, &clock, ctx(&mut scenario));
        test::return_shared(game);
    };
    
    // Test player movement
    next_tx(&mut scenario, PLAYER1);
    {
        let mut game = test::take_shared<Game>(&scenario);
        let mut player = test::take_from_sender<Player>(&scenario);
        
        // Get initial position
        let initial_pos = tile_game::get_player_position(&player);
        assert!(tile_game::coord_x(&initial_pos) == 0, 0);
        assert!(tile_game::coord_y(&initial_pos) == 0, 0);
        
        // Move right (direction 1)
        tile_game::move_player(&mut game, &mut player, 1, &clock, ctx(&mut scenario));
        
        // Check new position
        let new_pos = tile_game::get_player_position(&player);
        assert!(tile_game::coord_x(&new_pos) == 1, 0);
        assert!(tile_game::coord_y(&new_pos) == 0, 0);
        
        // Verify turn changed
        assert!(tile_game::get_current_turn(&game) == 1, 0);
        
        test::return_to_sender(&scenario, player);
        test::return_shared(game);
    };
    
    clock::destroy_for_testing(clock);
    test::end(scenario);
}

#[test]
public fun test_coordinate_helpers() {
    let coord = tile_game::new_coord(5, 3);
    
    assert!(tile_game::coord_x(&coord) == 5, 0);
    assert!(tile_game::coord_y(&coord) == 3, 0);
}