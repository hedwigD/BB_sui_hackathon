/*
/// Module: sui_lottery
module sui_lottery::sui_lottery;
*/

// For Move coding conventions, see
// https://docs.sui.io/concepts/sui-move-concepts/conventions
module game::grid_hunt {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::clock::{Self, Clock};
    use sui::transfer;
    use sui::coin::{Self, Coin, TreasuryCap};
    use std::vector;
    use std::option;
    use std::string;
    use std::hash;
    use sui::dynamic_field;

    const BOARD_W: u8 = 10;
    const BOARD_H: u8 = 10;
    const CELLS: u16 = 100;
    const CELLS_WITH_COINS: u8 = 10;
    const TURN_MS: u64 = 3000; // 3초

    struct Player has store, drop {
        addr: address,
        pos: u16,        // 0..99
        last_dir: u8,    // 0:Up,1:Right,2:Down,3:Left
        joined: bool,
    }

    // 셀 커밋(해시) → 미획득/획득 여부
    struct CellCommit has store, drop {
        // H(x||y||salt) 의 32바이트 등
        h: vector<u8>,
        claimed: bool,
    }

    // Game이 들고 있는 전체 금고. 분할 코인은 내부에서 필요시 split.
    struct Vault has key {
        id: UID,
        pot: Coin<SUI>,
        per_cell_amount: u64, // 코인 1칸당 수량
    }

    // Dynamic Field key로 쓰기 위한 래퍼
    struct CellKey has copy, drop, store { idx: u16 }

    // Game(공유객체): 한 판 전 상태
    struct Game has key {
        id: UID,
        vault: Vault,                 // object-owned
        p1: Player,
        p2: Player,
        next_turn: u8,               // 1 or 2
        deadline_ms: u64,            // Clock 기준
        started: bool,
        finished: bool,

        // 커밋 맵: idx(0..99) → CellCommit
        // Dynamic Field: owner=Game.id, key=CellKey, value=CellCommit
    }

    // ── 핵심 entry ─────────────────────────────────────────────
    public entry fun create_game(ctx: &mut TxContext) { /* share_object */ }
    public entry fun join_game(game: &mut Game, pay: Coin<SUI>, ctx: &mut TxContext) { /* merge to vault */ }
    public entry fun start(game: &mut Game, commits: vector<(u16, vector<u8>)>, per_cell_amount: u64, clock: &Clock, ctx: &mut TxContext) { /* set p positions, write cell commits, set deadline */ }
    public entry fun move_dir(game: &mut Game, dir: u8, clock: &Clock, ctx: &mut TxContext) { /* turn check + 3s check + step + claim_if_any */ }
    public entry fun tick_after_deadline(game: &mut Game, clock: &Clock, ctx: &mut TxContext) { /* auto-advance or skip */ }
    public entry fun reveal_cell(game: &mut Game, x: u8, y: u8, salt: vector<u8>, clock: &Clock, ctx: &mut TxContext) { /* verify commit + pay out */ }
    public entry fun end_or_claim_rest(game: &mut Game, ctx: &mut TxContext) { /* finalize */ }

    // ── 내부 유틸 ──────────────────────────────────────────────
    fun index(x: u8, y: u8): u16 { /* y*10 + x */ }
    fun step(pos: u16, dir: u8): (u16, bool /*valid*/) { /* 벽 체크 */ }
    fun is_player_turn(game: &Game, signer: &signer): bool { /* addr == p1/p2 + next_turn */ }
    fun now_ms(clock: &Clock): u64 { /* clock.timestamp_ms */ }
    fun pay_out(game: &mut Game, to: address, ctx: &mut TxContext) { /* split from vault.pot by per_cell_amount then transfer */ }
}
