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

    // coin이 들어있는 dynamic field를 관리하기 위해 key값을 저장하는 struct인듯??
    struct CoinKey has copy, drop, store { idx: u16 }

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
    public entry fun start(
        game: &mut Game,
        positions: vector<u16>,            // 코인 놓을 셀 인덱스 목록
        per_cell_amount: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        // … (권한/상태 체크 생략) <<이거 채워야하는듯???
        game.started = true;
        game.deadline_ms = now_ms(clock) + TURN_MS;

        let n = vector::length(&positions);
        let mut i = 0;
        while (i < n) {
            let idx = *vector::borrow(&positions, i);
            // 금고에서 코인 하나 분할
            let piece = coins::split(&mut game.vault.pot, per_cell_amount, ctx);
            // 셀에 코인 저장 (부모=Game.id, key=CoinKey{idx})
            dynamic_field::add<CoinKey, Coin<SUI>>(&mut game.id, CoinKey{ idx }, piece);
            i = i + 1;
        };

        // (선택) 커밋-리빌을 쓸 거면 여기서 CellKey/CellCommit도 같이 add
        // dynamic_field::add<CellKey, CellCommit>(&mut game.id, CellKey{ idx }, CellCommit{ h, claimed:false });

        // 초기 위치 등 나머지 설정…
    }
    
    public entry fun move_dir(game: &mut Game, dir: u8, clk: &Clock, ctx: &mut TxContext) {
        // … (상태/턴/데드라인 체크) <<<이거 일단생략했는데 나중에 코드 채우기!!!

        if (game.next_turn == 1) {
            let (np, ok) = step(game.p1.pos, dir);
            assert!(ok, E_HIT_WALL);
            game.p1.pos = np;
            game.p1.last_dir = dir;

            // 변경: ctx 없이 즉시 코인 전송
            try_claim(game, np, game.p1.addr);

            game.next_turn = 2;
        } else {
            let (np, ok) = step(game.p2.pos, dir);
            assert!(ok, E_HIT_WALL);
            game.p2.pos = np;
            game.p2.last_dir = dir;

            try_claim(game, np, game.p2.addr);

            game.next_turn = 1;
        };

        game.deadline_ms = now_ms(clk) + TURN_MS;
    }
    
    public entry fun tick_after_deadline(game: &mut Game, clock: &Clock, ctx: &mut TxContext) { /* auto-advance or skip */ }
    public entry fun reveal_cell(game: &mut Game, x: u8, y: u8, salt: vector<u8>, clock: &Clock, ctx: &mut TxContext) { /* verify commit + pay out */ }
    public entry fun end_or_claim_rest(game: &mut Game, ctx: &mut TxContext) { /* finalize */ }

    // ── 내부 유틸 ──────────────────────────────────────────────
    fun index(x: u8, y: u8): u16 { /* y*10 + x */ 
        (y as u16) * (BOARD_W as u16) + (x as u16)
    }
    
    /// pos(u16)와 dir(u8)을 받아 한 칸 이동.
    /// dir: 0=Up, 1=Right, 2=Down, 3=Left
    /// - 보드 밖으로 나가면 이동하지 않고 (pos, false)
    /// - 정상 이동이면 (new_pos, true)
    fun step(pos: u16, dir: u8): (u16, bool) {
        let x = (pos % (BOARD_W as u16)) as u8;
        let y = (pos / (BOARD_W as u16)) as u8;

        let (nx, ny) = if (dir == 0) {
            (x, if (y == 0) { y } else { y - 1 })
        } else if (dir == 1) {
            (if (x + 1 >= BOARD_W) { x } else { x + 1 }, y)
        } else if (dir == 2) {
            (x, if (y + 1 >= BOARD_H) { y } else { y + 1 })
        } else if (dir == 3) {
            (if (x == 0) { x } else { x - 1 }, y)
        } else {
            // 잘못된 방향
            return (pos, false)
        };

        // 벽에 막혀 제자리면 false
        if (nx == x && ny == y) {
            return (pos, false)
        };

        let new_pos = index(nx, ny);
        (new_pos, true)
    }

    fun is_player_turn(game: &Game, signer: &signer): bool { /* addr == p1/p2 + next_turn */ }
    
    fun now_ms(clock: &Clock): u64 { /* clock.timestamp_ms */ 
        clock::timestamp_ms(clock)
    }

    //셀에 코인 꺼내서 즉시 전송함수수
    fun try_claim(game: &mut Game, cell_idx: u16, to: address) {
        let key = CoinKey { idx: cell_idx };
        if (dynamic_field::exists_with_type<CoinKey, Coin<SUI>>(&game.id, key)) {
            // 꺼내기(remove) → 더 이상 재클레임 불가
            let coin = dynamic_field::remove<CoinKey, Coin<SUI>>(&mut game.id, key);
            transfer::public_transfer(coin, to);
        }
    }
}
