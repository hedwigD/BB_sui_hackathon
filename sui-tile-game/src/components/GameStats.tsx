import { Player, SuiTile } from "../types/game";

type Props = {
  players: Player[];
  suiTiles: SuiTile[];
  phase: string;
  totalMoves?: number;
};

export default function GameStats({ players, suiTiles, phase, totalMoves = 0 }: Props) {
  const totalTiles = suiTiles.length;
  const capturedTiles = suiTiles.filter(tile => tile.owner).length;
  const remainingTiles = totalTiles - capturedTiles;
  const gameProgress = totalTiles > 0 ? (capturedTiles / totalTiles) * 100 : 0;
  
  const leadingPlayer = players.reduce((leader, current) => 
    current.score > leader.score ? current : leader
  );
  
  const isLeader = players.filter(p => p.score === leadingPlayer.score).length === 1;

  return (
    <div className="w-full max-w-4xl mx-auto mb-6">
      <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl p-6 text-white shadow-2xl">
        <h2 className="text-2xl font-bold text-center mb-6">Game Statistics</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Game Progress */}
          <div className="bg-white/20 backdrop-blur rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">Game Progress</span>
              <span className="text-lg font-bold">{Math.round(gameProgress)}%</span>
            </div>
            <div className="w-full bg-white/30 rounded-full h-3 mb-2">
              <div 
                className="h-full bg-gradient-to-r from-green-400 to-blue-400 rounded-full transition-all duration-500"
                style={{ width: `${gameProgress}%` }}
              ></div>
            </div>
            <div className="text-xs opacity-80">
              {capturedTiles} / {totalTiles} tiles captured
            </div>
          </div>

          {/* Tiles Remaining */}
          <div className="bg-white/20 backdrop-blur rounded-lg p-4 text-center">
            <div className="text-3xl font-bold mb-1">{remainingTiles}</div>
            <div className="text-sm opacity-80 mb-2">Tiles Remaining</div>
            <div className="flex justify-center space-x-1">
              {Array.from({ length: Math.min(remainingTiles, 10) }).map((_, i) => (
                <div key={i} className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
              ))}
            </div>
          </div>

          {/* Current Leader */}
          <div className="bg-white/20 backdrop-blur rounded-lg p-4 text-center">
            <div className="text-sm opacity-80 mb-1">Current Leader</div>
            {isLeader ? (
              <div>
                <div className="text-2xl mb-1">
                  {leadingPlayer.id === "p1" ? "🦸‍♂️" : "🦹‍♀️"}
                </div>
                <div className="text-lg font-bold">
                  {leadingPlayer.id === "p1" ? "Hero" : "Villain"}
                </div>
                <div className="text-sm opacity-80">
                  {leadingPlayer.score} points
                </div>
              </div>
            ) : (
              <div>
                <div className="text-2xl mb-1">🤝</div>
                <div className="text-lg font-bold">Tied Game</div>
                <div className="text-sm opacity-80">
                  {leadingPlayer.score} points each
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Game Phase Indicator */}
        <div className="mt-6 text-center">
          <div className="inline-flex items-center space-x-2 bg-white/20 backdrop-blur rounded-full px-6 py-2">
            <div className={`w-3 h-3 rounded-full ${
              phase === "lobby" ? "bg-gray-400" :
              phase === "playing" ? "bg-green-400 animate-pulse" :
              "bg-blue-400"
            }`}></div>
            <span className="text-sm font-semibold capitalize">
              {phase === "lobby" ? "Waiting to Start" :
               phase === "playing" ? "Game in Progress" :
               "Game Finished"}
            </span>
          </div>
        </div>

        {/* Additional Stats */}
        {phase === "playing" && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="bg-white/10 rounded-lg p-3">
              <div className="text-lg font-bold">{totalMoves}</div>
              <div className="text-xs opacity-80">Total Moves</div>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <div className="text-lg font-bold">{Math.abs(players[0].score - players[1].score)}</div>
              <div className="text-xs opacity-80">Score Gap</div>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <div className="text-lg font-bold">
                {players.reduce((sum, p) => sum + Math.abs(p.pos.x - 5) + Math.abs(p.pos.y - 5), 0)}
              </div>
              <div className="text-xs opacity-80">Center Distance</div>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <div className="text-lg font-bold">
                {Math.abs(players[0].pos.x - players[1].pos.x) + Math.abs(players[0].pos.y - players[1].pos.y)}
              </div>
              <div className="text-xs opacity-80">Player Distance</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}