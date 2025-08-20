
# Tile Rush

**Tile Rush: The Real-Time Competitive Game on Sui**

*Sui 블록체인의 고유한 특성을 활용한*  
*실시간 멀티플레이어 온체인 게임*

---

## 게임 소개
**Tile Rush - 실시간 타일 수집 배틀**

### 게임 개요
- **장르**: 실시간 전략 보드 게임
- **플레이어**: 2인 대전
- **목표**: 10x10 보드에서 SUI 토큰이 담긴 타일을 더 많이 수집

### 게임 특징
- **실제 가치**: 각 타일에는 0.01 SUI (실제 토큰) 포함
- **빠른 진행**: 3초 턴 타임아웃으로 긴장감 있는 플레이
- **전략적 요소**: 상대방 동선 예측 및 최적 경로 선택
- **즉각적 보상**: 타일 획득 시 즉시 SUI 토큰 지급

### 게임 방식
```
1. 두 플레이어가 각각 0.05 SUI 참가비 지불
2. 10x10 보드에서 시작 위치 선택
3. 턴제로 이동하며 타일 수집 경쟁
4. 모든 타일 수집 완료 시 게임 종료
```

---

# 기술

**Sui 블록체인의 고유 기능 100% 활용**

### 1. Object-Centric Design
```move
// Dynamic Object Field로 타일을 게임에 동적 연결
dof::add(&mut game.id, position, tile);

// 타일 캡처 시 소유권 즉시 이전
transfer::public_transfer(reward, player_address);
```

### 2. 병렬 처리 최적화
```move
// MoveCap으로 각 플레이어 독립적 트랜잭션 처리
public struct MoveCap has key, store {
    id: UID,
    game_id: ID,
    player_address: address,
    moves_remaining: u64,
}
```

### 3. 초고속 게임 진행
- **Sui의 빠른 finality**: 평균 400ms
- **실시간 턴제**: 3초 타임아웃
- **즉각적 상태 업데이트**: 이벤트 기반 추적

---

# 게임 플로우 상세

**4단계 게임 진행 프로세스**

### Phase 1: Lobby (대기실)
- 게임 생성 및 참가
- 참가비: 0.05 SUI per player
- 총 상금 풀: 0.1 SUI

### Phase 2: Placement (배치)
- 각 플레이어 시작 위치 선택
- 전략적 포지셔닝
- 마지막 선택자가 선공 (밸런스)

### Phase 3: Playing (게임 진행)
```
while (tiles_remaining > 0) {
    1. 현재 플레이어 이동 (상/하/좌/우)
    2. 타일 도달 시 자동 획득
    3. 3초 내 미이동 시 자동 진행
    4. 턴 교체
}
```

### Phase 4: Finished (종료)
- 최종 점수 집계
- 승자 결정 및 보상

---

# 핵심 메커니즘 - Ownerless Object System
**Sui의 Object 모델을 활용한 혁신적 게임 설계**

### 타일 생성 및 배치
```move
// 게임 시작 시 10개 타일 동적 생성
fun create_tiles(game: &mut Game, clock: &Clock, ctx: &mut TxContext) {
    while (i < MAX_TILES) {
        // pot에서 보상 분리
        let reward_coin = coin::split(&mut game.pot, TILE_REWARD, ctx);
        
        // 타일 객체 생성
        let tile = SuiTile {
            id: object::new(ctx),
            position: pos,
            reward: option::some(reward_coin),
            claimed: false,
            owner: option::none<address>(),
        };
        
        // Dynamic Field로 게임에 연결
        dof::add(&mut game.id, pos, tile);
    }
}
```

### 타일 획득 메커니즘
1. **위치 확인**: 플레이어가 타일 위치 도달
2. **소유권 이전**: 타일의 reward 코인을 플레이어에게 전송
3. **점수 업데이트**: 실시간 스코어 반영
4. **이벤트 발생**: 프론트엔드 즉시 업데이트

---

# 코드 하이라이트
**핵심 기능 구현 세부사항**

### 1. 실시간 타일 캡처
```move
fun capture_if_tile(game: &mut Game, player_uindex: u64, _ctx: &mut TxContext) {
    let pos = *vector::borrow(&game.players_positions, player_uindex);
    
    // Dynamic Field에서 타일 확인
    if (!dof::exists_<Coord>(&game.id, pos)) return;
    
    // 타일 획득 및 보상 처리
    let tile = dof::borrow_mut<Coord, SuiTile>(&mut game.id, pos);
    let reward = option::extract(&mut tile.reward);
    
    // 즉시 플레이어에게 전송
    transfer::public_transfer(reward, player_address);
    
    // 이벤트 발생
    event::emit(TileCaptured { ... });
}
```

### 2. 타임아웃 처리
```move
public entry fun force_timeout_move(game: &mut Game, clock: &Clock, ctx: &mut TxContext) {
    assert!(elapsed > TURN_TIMEOUT_MS, E_TURN_TIMEOUT_NOT_REACHED);
    
    // 이전 방향으로 자동 이동
    let dir = *vector::borrow(&game.last_directions, cur_idx);
    let new_pos = apply_direction(old_pos, dir, game.board_size);
    
    // 턴 자동 종료
    rotate_turn(game, now);
}
```

### 3. 실시간 상태 조회
```move
// 모든 타일 위치 조회
public fun get_tile_positions(game: &Game): vector<Coord>

// 특정 타일 정보 조회
public fun get_tile_info(game: &Game, pos: Coord): (Coord, u64, bool, Option<address>)
```

---

**"Tile Rush - Where Speed Meets Strategy on Sui"**
