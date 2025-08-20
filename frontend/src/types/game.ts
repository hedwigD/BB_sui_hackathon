export interface Coord {
  x: number;
  y: number;
}

export interface GameState {
  id: string;
  creator: string;
  boardSize: number;
  players: string[];
  currentTurn: number;
  status: number; // 0=Lobby, 1=Playing, 2=Finished
  tilesRemaining: number;
  turnStartTime: number;
  winner: string | null;
  playersPositions: Coord[];
  playersScores: number[];
  lastDirections: number[];
  pot?: string; // Coin object ID
  tileIds: string[];
  moveCapCreated: boolean;
}

export interface MoveCap {
  id: string;
  gameId: string;
  playerAddress: string;
  movesRemaining: number;
}

export interface GameEvent {
  type: string;
  parsedJson: any;
  timestampMs: string;
}

export const DIRECTIONS = {
  UP: 0,
  RIGHT: 1,
  DOWN: 2,
  LEFT: 3
} as const;

export const DIRECTION_NAMES = ['Up', 'Right', 'Down', 'Left'];

export const ERROR_CODES = {
  E_INVALID_PLAYER: 2,
  E_NOT_PLAYER_TURN: 3,
  E_GAME_NOT_ACTIVE: 6,
  E_CAP_EMPTY: 11,
  E_NOT_CREATOR: 13,
  E_WRONG_FUNDING_AMOUNT: 14,
  E_TURN_TIMEOUT_NOT_REACHED: 20,
  E_GAME_FULL: 21,
  E_ALREADY_JOINED: 22,
  E_NOT_FOUND: 23
} as const;

export const ERROR_MESSAGES = {
  [ERROR_CODES.E_INVALID_PLAYER]: "You are not a valid player for this action.",
  [ERROR_CODES.E_NOT_PLAYER_TURN]: "It is not your turn.",
  [ERROR_CODES.E_GAME_NOT_ACTIVE]: "Action not allowed: game not active.",
  [ERROR_CODES.E_CAP_EMPTY]: "Your MoveCap has no remaining moves.",
  [ERROR_CODES.E_NOT_CREATOR]: "Only the game creator can perform this action.",
  [ERROR_CODES.E_WRONG_FUNDING_AMOUNT]: "You must fund exactly 10 SUI to start the game.",
  [ERROR_CODES.E_TURN_TIMEOUT_NOT_REACHED]: "You must wait before forcing timeout.",
  [ERROR_CODES.E_GAME_FULL]: "Game already has two players.",
  [ERROR_CODES.E_ALREADY_JOINED]: "You have already joined this game.",
  [ERROR_CODES.E_NOT_FOUND]: "Game or object not found."
} as const;

export const TURN_TIMEOUT_MS = 3000;
export const MAX_TILES = 10;
export const BOARD_SIZE = 11;