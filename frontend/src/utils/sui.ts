import { SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';


// Configuration
export const NETWORK = 'testnet';
export const SUI_CLIENT = new SuiClient({ url: `https://fullnode.${NETWORK}.sui.io:443` });

// Contract configuration - Updated with deployed contract details
export const PACKAGE_ID = '0x2e5b7573c70d371547138f89e09983369a4e2fec29ec60c0ace0c6f6f83aabca'; // Deployed package
export const REGISTRY_ID = '0x035ceb3c222813a6c25b851e61733b5ff0e9fff8525fe64bad1d02f03f0adb71'; // Shared GameRegistry
export const CLOCK_ID = '0x6'; // Sui system clock
export const BOARD_SIZE = 11; // Game board size

export async function createGame(registryId: string) {
  const tx = new TransactionBlock();
  
  tx.moveCall({
    target: `${PACKAGE_ID}::tile_game_core::create_game`,
    arguments: [
      tx.object(registryId),
    ],
  });
  
  return tx;
}

export async function joinGame(gameId: string) {
  const tx = new TransactionBlock();
  
  tx.moveCall({
    target: `${PACKAGE_ID}::tile_game_core::join_game`,
    arguments: [
      tx.object(gameId),
    ],
  });
  
  return tx;
}

export async function startGame(gameId: string, fundingCoinId: string) {
  const tx = new TransactionBlock();
  
  tx.moveCall({
    target: `${PACKAGE_ID}::tile_game_core::start_game`,
    arguments: [
      tx.object(gameId),
      tx.object(fundingCoinId), // funding coin
      tx.object(CLOCK_ID), // clock
    ],
  });
  
  return tx;
}

export async function moveWithCap(
  gameId: string,
  moveCapId: string,
  direction: number
) {
  const tx = new TransactionBlock();
  
  tx.moveCall({
    target: `${PACKAGE_ID}::tile_game_core::move_with_cap`,
    arguments: [
      tx.object(gameId),
      tx.object(moveCapId), // move cap
      tx.pure.u8(direction), // direction
      tx.object(CLOCK_ID), // clock
    ],
  });
  
  return tx;
}

export async function forceTimeoutMove(gameId: string) {
  const tx = new TransactionBlock();
  
  tx.moveCall({
    target: `${PACKAGE_ID}::tile_game_core::force_timeout_move`,
    arguments: [
      tx.object(gameId),
      tx.object(CLOCK_ID), // clock
    ],
  });
  
  return tx;
}

// This function is not needed when using Suiet wallet kit
// The wallet kit handles transaction signing automatically
export async function signAndExecuteTransactionBlock(tx: TransactionBlock, signerAddress: string, walletType?: string) {
  throw new Error('Use Suiet wallet kit signAndExecuteTransactionBlock instead');
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