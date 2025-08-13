export type Coord = { x: number; y: number };

export type Player = {
  id: string;
  name: string;
  pos: Coord;
  score: number;
};

export type SuiTile = {
  id: string;         // 온체인 Object ID
  pos: Coord;
  owner?: string;     // 획득자 Player ID
};

export type GameState = {
  boardSize: number;            // 10
  players: Player[];
  suiTiles: SuiTile[];          // 10개만 온체인
  currentTurn: string;          // player id
  phase: 'lobby' | 'playing' | 'finished';
};
