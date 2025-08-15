/**
 * Sui Service Constants
 */

export const SUI_NETWORKS = {
  DEVNET: 'devnet',
  TESTNET: 'testnet',
  MAINNET: 'mainnet',
} as const;

export const DEFAULT_NETWORK = SUI_NETWORKS.DEVNET;

export const TRANSACTION_TIMEOUTS = {
  DEFAULT: 30000, // 30 seconds
  LONG: 60000,    // 1 minute
  SHORT: 10000,   // 10 seconds
};

export const CONTRACT_MODULES = {
  GAME: 'tile_game',
  TILE: 'sui_tile',
  PLAYER: 'player',
} as const;

export const EVENT_TYPES = {
  GAME_CREATED: 'GameCreated',
  PLAYER_JOINED: 'PlayerJoined',
  PLAYER_MOVED: 'PlayerMoved',
  TILE_CAPTURED: 'TileCaptured',
  GAME_ENDED: 'GameEnded',
} as const;

export const GAME_CONFIG = {
  DEFAULT_BOARD_SIZE: 10,
  DEFAULT_TILE_COUNT: 10,
  MAX_PLAYERS: 2,
  TURN_TIMEOUT: 30000, // 30 seconds
} as const;