/*
/// Module: sui_lottery
module sui_lottery::sui_lottery;
*/

// For Move coding conventions, see
// https://docs.sui.io/concepts/sui-move-concepts/conventions
module game::grid_hunt {
    use sui::sui::SUI;
    use sui::object::{Self as object, UID, ID};
    use sui::event;
    use sui::tx_context::{Self, TxContext};
    use sui::clock::{Self, Clock};
    use sui::transfer;
    use sui::coin::{Self, Coin};
    use std::vector;
    use std::option;
    // use std::hash;
    use sui::dynamic_field;

    // const E_HIT_WALL: u64 = 1;
    const E_NOT_YOUR_TURN: u64 = 2;
    const E_DEADLINE_PASSED: u64 = 3;
    const E_NOT_STARTED: u64 = 4;
    const E_ALREADY_FINISHED: u64 = 5;
    // const E_INVALID_POSITIONS: u64 = 6;
    // const E_INSUFFICIENT_POT: u64 = 7;


    const BOARD_W: u16 = 10;
    const BOARD_H: u16 = 10;
    const CELLS: u16 = 100;
    // const CELLS_WITH_COINS: u8 = 10;
    const TURN_MS: u64 = 3000; // 3초

    struct Player has store, drop {
        addr: address,
        pos: u16,        // 0..99
        last_dir: u8,    // 0:Up,1:Right,2:Down,3:Left
        joined: bool,
    }

    // 셀 커밋(해시) → 미획득/획득 여부
    #[allow(unused_field)]
    struct CellCommit has store, drop {
        // H(x||y||salt) 의 32바이트 등
        h: vector<u8>,

        // 권정헌:제가짠 코드에 claimed사용하는 부분이없어서 지워도될것같은데
        // 상현님 코드다짜고 확인해주세요 쓸데잇는지 없으면지워도댈듯
        claimed: bool,
    }

    // Game이 들고 있는 전체 금고. 분할 코인은 내부에서 필요시 split.
    struct Vault has key, store {
        id: UID,
        pot: Coin<SUI>,
        per_cell_amount: u64, // 코인 1칸당 수량
    }

    // Dynamic Field key로 쓰기 위한 래퍼
    #[allow(unused_field)]
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

    // 게임종료 이벤트
    struct GameEndedEvent has copy, drop {
        game_id: ID,
        winner: option::Option<address>,
        timestamp_ms: u64,
    }


    // ── 핵심 entry ─────────────────────────────────────────────
    public entry fun create_game(ctx: &mut TxContext) {
        let game_id = object::new(ctx);
        let vault_id = object::new(ctx);

        // 0 SUI로 시작(지원 버전에서는 coin::zero 사용)
        let zero = coin::zero<SUI>(ctx);

        let vault = Vault {
            id: vault_id,
            pot: zero,
            per_cell_amount: 0,
        };

        let game = Game {
            id: game_id,
            vault,
            p1: Player { addr: @0x0, pos: 0, last_dir: 1, joined: false },
            p2: Player { addr: @0x0, pos: 0, last_dir: 1, joined: false },
            next_turn: 1,
            deadline_ms: 0,
            started: false,
            finished: false,
        };

        transfer::share_object(game);
    }

    public entry fun join_game(game: &mut Game, pay: Coin<SUI>, ctx: &mut TxContext) {
        assert!(!game.started, E_NOT_STARTED);
        assert!(!game.finished, E_ALREADY_FINISHED);

        let sender = tx_context::sender(ctx);

        if (!game.p1.joined) {
            game.p1 = Player { addr: sender, pos: 0, last_dir: 1, joined: true };
        } else {
            assert!(!game.p2.joined, E_ALREADY_FINISHED); // 자리 없음 에러코드 따로 두고 싶으면 추가
            game.p2 = Player { addr: sender, pos: 0, last_dir: 1, joined: true };
        };

        coin::join(&mut game.vault.pot, pay);
    }

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
        let i = 0;
        while (i < n) {
            let idx = *vector::borrow(&positions, i);
            // 금고에서 코인 하나 분할
            let piece = coin::split(&mut game.vault.pot, per_cell_amount, ctx);
            // 셀에 코인 저장 (부모=Game.id, key=CoinKey{idx})
            dynamic_field::add<CoinKey, Coin<SUI>>(&mut game.id, CoinKey{ idx }, piece);
            i = i + 1;
        };

        // (선택) 커밋-리빌을 쓸 거면 여기서 CellKey/CellCommit도 같이 add
        // dynamic_field::add<CellKey, CellCommit>(&mut game.id, CellKey{ idx }, CellCommit{ h, claimed:false });

        // 초기 위치 등 나머지 설정…
    }
    
    public entry fun move_dir(
        game: &mut Game,
        dir: u8,
        clk: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(game.started, E_NOT_STARTED);
        assert!(!game.finished, E_ALREADY_FINISHED);
        assert!(clock::timestamp_ms(clk) <= game.deadline_ms, E_DEADLINE_PASSED);

        let sender = tx_context::sender(ctx);
        let is_p1 = sender == game.p1.addr;
        let is_p2 = sender == game.p2.addr;
        assert!(
            (game.next_turn == 1 && is_p1) || (game.next_turn == 2 && is_p2),
            E_NOT_YOUR_TURN
        );

        if (game.next_turn == 1) {
            let (np, ok) = step(game.p1.pos, dir);
            if (ok) {
                let to = game.p1.addr;           // ⬅️ 먼저 주소를 로컬로 빼둔다
                game.p1.pos = np;
                game.p1.last_dir = dir;
                try_claim(game, np, to);         // ⬅️ 이제 &mut game 넘겨도 충돌 없음
            };
            game.next_turn = 2;
        } else {
            let (np, ok) = step(game.p2.pos, dir);
            if (ok) {
                let to = game.p2.addr;           // ⬅️ 동일 패턴
                game.p2.pos = np;
                game.p2.last_dir = dir;
                try_claim(game, np, to);
            };
            game.next_turn = 1;
        };

        game.deadline_ms = clock::timestamp_ms(clk) + TURN_MS;
        try_end_game(game, clk);
    }


    
    // 이 함수를 프론트에서 now>deadline이 되면 호출해야할듯 하네요
    public entry fun tick_after_deadline(game: &mut Game, clock: &Clock) {
        assert!(game.started, E_NOT_STARTED);
        assert!(!game.finished, E_ALREADY_FINISHED);
        let now = clock::timestamp_ms(clock);
        assert!(now > game.deadline_ms, E_DEADLINE_PASSED);

        if (game.next_turn == 1) {
            let (np, ok) = step(game.p1.pos, game.p1.last_dir);
            if (ok) {
                let to = game.p1.addr;           // ⬅️ 먼저 로컬 변수로
                game.p1.pos = np;
                try_claim(game, np, to);
            };
            game.next_turn = 2;
        } else {
            let (np, ok) = step(game.p2.pos, game.p2.last_dir);
            if (ok) {
                let to = game.p2.addr;           // ⬅️ 동일
                game.p2.pos = np;
                try_claim(game, np, to);
            };
            game.next_turn = 1;
        };

        game.deadline_ms = now + TURN_MS;
        try_end_game(game, clock);
    }



    // ── 내부 유틸 ──────────────────────────────────────────────
    fun index(x: u16, y: u16): u16 {
        y * BOARD_W + x
    }
    
    /// pos(u16)와 dir(u8)을 받아 한 칸 이동.
    /// dir: 0=Up, 1=Right, 2=Down, 3=Left
    /// - 보드 밖으로 나가면 이동하지 않고 (pos, false)
    /// - 정상 이동이면 (new_pos, true)
    fun step(pos: u16, dir: u8): (u16, bool) {
        let x = pos % BOARD_W;
        let y = pos / BOARD_W;

        let (nx, ny) = if (dir == 0) {
            // Up
            (x, if (y == 0) { y } else { y - 1 })
        } else if (dir == 1) {
            // Right
            (if (x + 1 >= BOARD_W) { x } else { x + 1 }, y)
        } else if (dir == 2) {
            // Down
            (x, if (y + 1 >= BOARD_H) { y } else { y + 1 })
        } else if (dir == 3) {
            // Left
            (if (x == 0) { x } else { x - 1 }, y)
        } else {
            return (pos, false)
        };

        if (nx == x && ny == y) {
            return (pos, false)
        };

        let new_pos = index(nx, ny);
        (new_pos, true)
    }

//    fun is_player_turn(game: &Game, signer: &signer): bool { /* addr == p1/p2 + next_turn */ }
   
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


/*
    // movedir 내부에서만 호출되도록 내부 함수로 바꿈
    fun reveal_cell_internal(
        game: &Game,
        idx: u16,
        x: u8,
        y: u8,
        salt: vector<u8>
    ): bool {
        if (!dynamic_field::exists_with_type<CellKey, CellCommit>(&game.id, CellKey { idx })) {
            return false;
        };

        let commit = dynamic_field::borrow<CellKey, CellCommit>(&game.id, CellKey { idx });

        let mut bytes = vector::empty<u8>();
        vector::push_back(&mut bytes, x);
        vector::push_back(&mut bytes, y);
        vector::append(&mut bytes, salt);

        let h = hash::sha3_256(bytes);

        // 해시가 일치하면 성공
        //h == commit.h
        true
    }
*/
    /// 내부 유틸: 모든 셀의 코인이 소진되었는지 확인하고 게임을 종료함.
    /// 외부 호출 금지. move_dir 등에서 자동 호출됨.
    fun try_end_game(game: &mut Game, clock: &Clock) {
        if (game.finished) {
            return
        };

        let i = 0;
        while (i < CELLS) {
            if (dynamic_field::exists_with_type<CoinKey, Coin<SUI>>(&game.id, CoinKey{ idx: i })) {
                return // 아직 남은 보상 있음
            };
            i = i + 1;
        };

        // 모든 보상 전송 완료 → 게임 종료
        game.finished = true;
        //이벤트 발생
        event::emit(GameEndedEvent {
            game_id: object::id(game),
            winner: option::none<address>(),
            timestamp_ms: clock::timestamp_ms(clock), // _clock: 미사용 경고 피하려고 언더스코어
        });
    }



}
