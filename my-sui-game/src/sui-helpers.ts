import { SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';

// 네트워크 / 클라이언트 설정
export const NETWORK = 'testnet';
export const SUI_CLIENT = new SuiClient({ url: `https://fullnode.${NETWORK}.sui.io:443` });

// 패키지/오브젝트 상수 - 새로 배포된 패키지 ID
export const PACKAGE_ID = '0x5ef053bccf5ceb726968b36738295bd55b2e41eec9b5cf91a81c680e3adae16a';
export const REGISTRY_ID = '0xe8192d5e26092007e59b0d513d8bbd715d0a2cafdb64636b7cbed6118b2c14c2';

// Debug function to check if objects exist and inspect package modules
export async function checkDeployedObjects() {
  console.log('[DEBUG] Checking package:', PACKAGE_ID);
  try {
    const pkg = await SUI_CLIENT.getObject({
      id: PACKAGE_ID,
      options: { showContent: true, showType: true }
    });
    console.log('[DEBUG] Package result:', pkg);
    
    // Try to get normalized modules to inspect function signatures
    try {
      const normalizedModules = await SUI_CLIENT.getNormalizedMoveModulesByPackage({
        package: PACKAGE_ID
      });
      console.log('[DEBUG] Package modules:', normalizedModules);
      
      // Look for the tile_game_core module and join_game function
      const tileGameModule = normalizedModules.tile_game_core;
      if (tileGameModule && tileGameModule.exposedFunctions) {
        const joinGameFunc = tileGameModule.exposedFunctions.join_game;
        console.log('[DEBUG] join_game function signature:', joinGameFunc);
        console.log('[DEBUG] join_game parameters:', joinGameFunc?.parameters);
        
        // Also check create_game for comparison
        const createGameFunc = tileGameModule.exposedFunctions.create_game;
        console.log('[DEBUG] create_game function signature:', createGameFunc);
        console.log('[DEBUG] create_game parameters:', createGameFunc?.parameters);
      }
    } catch (e) {
      console.warn('[DEBUG] Could not fetch normalized modules:', e);
    }
  } catch (e) {
    console.error('[DEBUG] Package check failed:', e);
  }

  console.log('[DEBUG] Checking registry:', REGISTRY_ID);
  try {
    const registry = await SUI_CLIENT.getObject({
      id: REGISTRY_ID,
      options: { showContent: true, showType: true }
    });
    console.log('[DEBUG] Registry result:', registry);
  } catch (e) {
    console.error('[DEBUG] Registry check failed:', e);
  }
}
export const CLOCK_ID = '0x6';
export const BOARD_SIZE = 11;

// --------------------------------------------------
// 트랜잭션 빌더
// --------------------------------------------------
export function createGame(registryId: string) {
  console.log('[DEBUG] Creating game with:');
  console.log('[DEBUG] - PACKAGE_ID:', PACKAGE_ID);
  console.log('[DEBUG] - REGISTRY_ID:', registryId);
  
  const tx = new TransactionBlock();
  tx.moveCall({
    target: `${PACKAGE_ID}::tile_game_core::create_game`,
    arguments: [tx.object(registryId)],
  });
  return tx;
}

export function joinGame(gameId: string, coinId: string) {
  console.log('[DEBUG] Joining game with:');
  console.log('[DEBUG] - PACKAGE_ID:', PACKAGE_ID);
  console.log('[DEBUG] - gameId:', gameId);
  console.log('[DEBUG] - coinId:', coinId);
  
  const tx = new TransactionBlock();
  
  try {
    // Create the game object input first
    const gameObj = tx.object(gameId);
    
    // Split exactly 0.05 SUI (50_000_000 MIST) for joining fee
    const [feeAmount] = tx.splitCoins(tx.object(coinId), [tx.pure.u64(50_000_000)]);
    console.log('[DEBUG] Split coin created successfully');
    
    tx.moveCall({
      target: `${PACKAGE_ID}::tile_game_core::join_game`,
      arguments: [
        gameObj,     // game: &mut Game
        feeAmount,   // fee: Coin<SUI>
      ],
    });
    console.log('[DEBUG] Move call added successfully');
  } catch (e) {
    console.error('[DEBUG] Error building join transaction:', e);
    throw e;
  }
  
  return tx;
}

export function startGame(gameId: string) {
  const tx = new TransactionBlock();
  
  console.log('[DEBUG] Creating startGame transaction for gameId:', gameId);
  console.log('[DEBUG] Using CLOCK_ID:', CLOCK_ID);
  
  tx.moveCall({
    target: `${PACKAGE_ID}::tile_game_core::start_game`,
    arguments: [
      tx.object(gameId),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

export function moveWithCap(
  gameId: string,
  moveCapId: string,
  direction: number
) {
  const tx = new TransactionBlock();
  tx.moveCall({
    target: `${PACKAGE_ID}::tile_game_core::move_with_cap`,
    arguments: [
      tx.object(gameId),
      tx.object(moveCapId),
      tx.pure.u8(direction),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

export function forceTimeoutMove(gameId: string) {
  const tx = new TransactionBlock();
  tx.moveCall({
    target: `${PACKAGE_ID}::tile_game_core::force_timeout_move`,
    arguments: [
      tx.object(gameId),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

// --------------------------------------------------
// 코인 검색
// --------------------------------------------------
export async function findSuiCoin(address: string, amount: bigint) {
  const coins = await SUI_CLIENT.getCoins({
    owner: address,
    coinType: '0x2::sui::SUI',
  });

  const suitable = coins.data.filter(c => BigInt(c.balance) >= amount);
  if (suitable.length > 0) return suitable[0].coinObjectId;
  return coins.data[0]?.coinObjectId || null;
}

// --------------------------------------------------
// 오브젝트 fetch
// --------------------------------------------------
export async function fetchGame(gameId: string) {
  return SUI_CLIENT.getObject({
    id: gameId,
    options: { showContent: true },
  });
}

export async function fetchMoveCap(moveCapId: string) {
  return SUI_CLIENT.getObject({
    id: moveCapId,
    options: { showContent: true },
  });
}

// --------------------------------------------------
// 파싱 유틸
// --------------------------------------------------
// 방어적 BigInt/number 변환
function safeBigInt(v: any): string | null {
  try {
    if (v === null || v === undefined) return null;
    return BigInt(v).toString();
  } catch {
    return null;
  }
}

function safeVec<T>(v: any): T[] {
  if (Array.isArray(v)) return v;
  if (v && Array.isArray(v.fields)) return v.fields; // Sui 내부 vec 포맷 방어
  return [];
}

export interface ParsedPlayerPosition {
  x: number;
  y: number;
}

export interface ParsedGame {
  id: string;
  creator: string;
  boardSize: number;
  players: string[];
  currentTurn: number;
  status: number;
  tilesRemaining: number;
  turnStartTime?: string | null;
  winner: string | null;
  playersPositions: ParsedPlayerPosition[];
  playersScores: number[];
  lastDirections: number[];
  tileIds: string[];
  moveCapCreated: boolean;
}

export function parseGameContent(content: any): ParsedGame | null {
  if (!content || content.dataType !== 'moveObject' || !content.fields) return null;
  const f = content.fields;
  // status 구조체가 enum(Option-like) 형태일 때 value 추출
  const statusVal =
    f.status?.fields?.value ??
    f.status?.value ??
    f.status ??
    0;

  // winner 가 Option 구조: { fields: { vec: [] }} 또는 vec[0]
  let winner: string | null = null;
  if (f.winner) {
    const vec = f.winner?.fields?.vec;
    if (Array.isArray(vec) && vec.length > 0) winner = vec[0];
  }

  const playersArr: string[] = safeVec<string>(f.players);
  const lastDirs: number[] = safeVec<number>(f.last_directions);
  const scores: number[] = safeVec<number>(f.players_scores);
  const tileIds: string[] = safeVec<string>(f.tile_ids);

  const posRaw = safeVec<any>(f.players_positions);
  const playersPositions: ParsedPlayerPosition[] = posRaw.map((p: any) => ({
    x: Number(p.fields?.x ?? 0),
    y: Number(p.fields?.y ?? 0),
  }));

  return {
    id: f.id?.id || f.id,
    creator: f.creator,
    boardSize: Number(f.board_size ?? f.boardSize ?? 0),
    players: playersArr,
    currentTurn: Number(f.current_turn ?? 0),
    status: Number(statusVal),
    tilesRemaining: Number(f.tiles_remaining ?? 0),
    turnStartTime: safeBigInt(f.turn_start_time),
    winner,
    playersPositions,
    playersScores: scores.map(Number),
    lastDirections: lastDirs.map(Number),
    tileIds,
    moveCapCreated: Boolean(f.move_caps_created),
  };
}

export function parseMoveCapContent(content: any): any {
  if (!content || !content.fields) return null;
  const f = content.fields;
  return {
    id: f.id?.id,
    gameId: f.game_id,
    playerAddress: f.player_address,
    movesRemaining: f.moves_remaining,
  };
}

// GameState-like 객체로 단순화 (필요하면 실제 GameState 타입과 매칭해서 사용)
export function toGameStateLike(parsed: ParsedGame) {
  return {
    id: parsed.id,
    creator: parsed.creator,
    players: parsed.players,
    status: parsed.status,
    boardSize: parsed.boardSize,
    currentTurn: parsed.currentTurn,
    tilesRemaining: parsed.tilesRemaining,
    winner: parsed.winner,
    playersPositions: parsed.playersPositions,
    playersScores: parsed.playersScores,
    lastDirections: parsed.lastDirections,
    tileIds: parsed.tileIds,
    moveCapCreated: parsed.moveCapCreated,
  };
}

// --------------------------------------------------
// Game ID 추출 유틸
// --------------------------------------------------
export function extractGameIdFromEvents(events: any[] | null | undefined): string | null {
  if (!Array.isArray(events)) return null;
  for (const ev of events) {
    const t = ev.type as string | undefined;
    if (!t) continue;
    // 가능한 이벤트 네이밍 패턴들
    if (
      t.includes('GameCreatedEvent') ||
      t.includes('GameCreated') ||
      t.endsWith('::GameCreated') ||
      t.endsWith('::GameCreatedEvent')
    ) {
      const pj = ev.parsedJson;
      if (pj?.game_id) return pj.game_id;
      if (pj?.gameId) return pj.gameId;
      if (pj?.id) return pj.id;
    }
    if (ev.parsedJson?.game_id) return ev.parsedJson.game_id;
  }
  return null;
}

export function extractGameIdFromObjectChanges(objectChanges: any[] | undefined): string | null {
  if (!Array.isArray(objectChanges)) return null;
  for (const ch of objectChanges) {
    if (
      ch.type === 'created' &&
      typeof ch.objectType === 'string' &&
      ch.objectType.includes('::tile_game_core::Game')
    ) {
      return ch.objectId;
    }
  }
  return null;
}


export function extractGameIdFromEffects(effects: any): string | null {
  console.log('Effects:', effects);
  
  // created objects에서 Game 타입 찾기
  const created = effects.created || [];
  for (const obj of created) {
    if (obj.owner && obj.owner.Shared) {
      console.log('Found shared object:', obj);
      return obj.reference.objectId;
    }
  }
  
  // objectChanges에서도 찾아보기
  const objectChanges = effects.objectChanges || [];
  for (const change of objectChanges) {
    if (change.type === 'created' && change.objectType?.includes('Game')) {
      console.log('Found game in objectChanges:', change);
      return change.objectId;
    }
  }
  
  return null;
}


// --------------------------------------------------
// MoveCap ID 추출 유틸 (startGame 후 effects에서 추출)
// --------------------------------------------------
export function extractMoveCapIdFromEffects(effects: any): string | null {
  if (!effects) return null;
  if (Array.isArray(effects.created)) {
    for (const c of effects.created) {
      const objectType = c.reference?.objectType || c.objectType;
      if (objectType && objectType.includes('::tile_game_core::MoveCap')) {
        return c.reference?.objectId || c.objectId;
      }
    }
  }
  return null;
}

// --------------------------------------------------
// 트랜잭션 전체 조회 (digest 재조회)
// --------------------------------------------------
export async function fetchFullTransaction(digest: string) {
  return SUI_CLIENT.waitForTransactionBlock({
    digest,
    options: {
      showEvents: true,
      showEffects: true,
      showObjectChanges: true,
      showBalanceChanges: false,
      showInput: false,
    },
  });
}

// --------------------------------------------------
// 편의 함수: 게임 한 번에 가져와 파싱
// --------------------------------------------------
export async function getParsedGame(gameId: string): Promise<ParsedGame | null> {
  const obj = await fetchGame(gameId);
  const content = obj?.data?.content;
  return parseGameContent(content);
}

// --------------------------------------------------
// 폴링 유틸: 2초 단위 새로고침 (start 버튼 자동 노출용)
// --------------------------------------------------
export function pollGame(
  gameId: string,
  onUpdate: (parsed: ParsedGame) => void,
  intervalMs = 2000,
  options?: { immediate?: boolean }
): () => void {
  let stopped = false;

  const run = async () => {
    try {
      const parsed = await getParsedGame(gameId);
      if (parsed && !stopped) {
        onUpdate(parsed);
      }
    } catch (e) {
      // 콘솔 정도만 (UI 에러는 컴포넌트에서 처리)
      console.warn('[pollGame] fetch failed', e);
    }
  };

  if (options?.immediate !== false) {
    // 기본: 즉시 1회 실행
    void run();
  }

  const handle = setInterval(run, intervalMs);

  return () => {
    stopped = true;
    clearInterval(handle);
  };
}
