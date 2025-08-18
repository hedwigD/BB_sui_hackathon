import { SuiClient } from '@mysten/sui/client';


// Configuration
export const NETWORK = 'testnet';
export const SUI_CLIENT = new SuiClient({ url: `https://fullnode.${NETWORK}.sui.io:443` });

// Contract configuration - Updated with deployed contract details
export const PACKAGE_ID = '0x0b786cc1ea1eb7a4621da7e8526f9d8a62a43db7199641c41ce53f52de0ebfd7'; // Deployed package
export const REGISTRY_ID = '0xd2bf5307f595161a43d5975c6dff8aa814633f68305ca4cefcf388d433a003a8'; // Shared GameRegistry
export const CLOCK_ID = '0x6'; // Sui system clock

export async function createGame(registryId: string) {
  // Placeholder - needs proper transaction implementation
  throw new Error('Transaction implementation needed');
}

export async function joinGame(gameId: string) {
  // Placeholder - needs proper transaction implementation
  throw new Error('Transaction implementation needed');
}

export async function startGame(gameId: string, fundingCoinId: string) {
  // Placeholder - needs proper transaction implementation
  throw new Error('Transaction implementation needed');
}

export async function moveWithCap(
  gameId: string,
  moveCapId: string,
  direction: number
) {
  // Placeholder - needs proper transaction implementation
  throw new Error('Transaction implementation needed');
}

export async function forceTimeoutMove(gameId: string) {
  // Placeholder - needs proper transaction implementation
  throw new Error('Transaction implementation needed');
}

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

export async function findSuiCoin(address: string, amount: bigint) {
  const coins = await SUI_CLIENT.getCoins({
    owner: address,
    coinType: '0x2::sui::SUI',
  });
  
  // Find a coin with sufficient balance or create one by merging
  const suitableCoins = coins.data.filter(coin => 
    BigInt(coin.balance) >= amount
  );
  
  if (suitableCoins.length > 0) {
    return suitableCoins[0].coinObjectId;
  }
  
  // If no single coin has enough, we'd need to merge coins
  // For simplicity, return the first coin and let the user handle merging
  return coins.data[0]?.coinObjectId || null;
}

export function parseGameContent(content: any): any {
  if (!content || !content.fields) return null;
  
  return {
    id: content.fields.id?.id,
    creator: content.fields.creator,
    boardSize: content.fields.board_size,
    players: content.fields.players || [],
    currentTurn: content.fields.current_turn,
    status: content.fields.status?.fields?.value,
    tilesRemaining: content.fields.tiles_remaining,
    turnStartTime: content.fields.turn_start_time,
    winner: content.fields.winner?.fields?.vec?.[0] || null,
    playersPositions: content.fields.players_positions?.map((pos: any) => ({
      x: pos.fields.x,
      y: pos.fields.y
    })) || [],
    playersScores: content.fields.players_scores || [],
    lastDirections: content.fields.last_directions || [],
    tileIds: content.fields.tile_ids || [],
    moveCapCreated: content.fields.move_caps_created || false,
  };
}

export function parseMoveCapContent(content: any): any {
  if (!content || !content.fields) return null;
  
  return {
    id: content.fields.id?.id,
    gameId: content.fields.game_id,
    playerAddress: content.fields.player_address,
    movesRemaining: content.fields.moves_remaining,
  };
}