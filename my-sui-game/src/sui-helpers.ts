import { SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';

// 네트워크 / 클라이언트 설정
export const NETWORK = 'testnet';
export const SUI_CLIENT = new SuiClient({ url: `https://fullnode.${NETWORK}.sui.io:443` });

// 패키지/오브젝트 상수
export const PACKAGE_ID = '0x37729a842095a49b0ade665263db7c8f66b32de45bc3fd9876f38431996b689a';
export const REGISTRY_ID = '0x425b190e7e86319238b374dd0310dff0b8f3ffc819c4682f2acb0102384904b0';
export const CLOCK_ID = '0x6';
export const BOARD_SIZE = 11;

// --------------------------------------------------
// 트랜잭션 빌더
// --------------------------------------------------
export function createGame(registryId: string) {
  const tx = new TransactionBlock();
  tx.moveCall({
    target: `${PACKAGE_ID}::tile_game_core::create_game`,
    arguments: [tx.object(registryId)],
  });
  return tx;
}

export function joinGame(gameId: string) {
  const tx = new TransactionBlock();
  tx.moveCall({
    target: `${PACKAGE_ID}::tile_game_core::join_game`,
    arguments: [tx.object(gameId)],
  });
  return tx;
}

export function startGame(gameId: string, coinId: string) {
  const tx = new TransactionBlock();
  
  // Split exactly 0.5 SUI (500_000_000 MIST) from the specified coin
  const [splitCoin] = tx.splitCoins(tx.object(coinId), [tx.pure.u64(500_000_000)]);
  
  tx.moveCall({
    target: `${PACKAGE_ID}::tile_game_core::start_game`,
    arguments: [
      tx.object(gameId),
      splitCoin,
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
  if (!effects) return null;
  if (Array.isArray(effects.created)) {
    for (const c of effects.created) {
      const id =
        c.reference?.objectId ||
        c.reference?.object_id ||
        c.objectId;
      if (id) return id;
    }
  }
  if (Array.isArray(effects.mutated)) {
    for (const m of effects.mutated) {
      const id =
        m.reference?.objectId ||
        m.reference?.object_id ||
        m.objectId;
      if (id) return id;
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
