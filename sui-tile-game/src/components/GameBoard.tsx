import { Player, SuiTile } from "../types/game";

type Props = {
  boardSize: number;
  players: Player[];
  suiTiles: SuiTile[];
  onMove: (playerId: string, dir: "up" | "down" | "left" | "right") => void;
  currentTurn: string;
  phase: string;
};

const dirs = [
  { key: "up", label: "↑", color: "bg-blue-500 hover:bg-blue-600" },
  { key: "down", label: "↓", color: "bg-green-500 hover:bg-green-600" },
  { key: "left", label: "←", color: "bg-purple-500 hover:bg-purple-600" },
  { key: "right", label: "→", color: "bg-orange-500 hover:bg-orange-600" },
];

// Player avatars and colors
const playerConfig = {
  p1: { 
    avatar: "🦸‍♂️", 
    name: "Hero", 
    bgColor: "bg-blue-200", 
    borderColor: "border-blue-500",
    glowColor: "shadow-blue-500/50"
  },
  p2: { 
    avatar: "🦹‍♀️", 
    name: "Villain", 
    bgColor: "bg-red-200", 
    borderColor: "border-red-500",
    glowColor: "shadow-red-500/50"
  }
};

export default function GameBoard({
  boardSize,
  players,
  suiTiles,
  onMove,
  currentTurn,
  phase,
}: Props) {
  // Enhanced 2D board rendering
  const board = [];
  for (let y = 0; y < boardSize; y++) {
    let row = [];
    for (let x = 0; x < boardSize; x++) {
      const player = players.find((p) => p.pos.x === x && p.pos.y === y);
      const sui = suiTiles.find((t) => t.pos.x === x && t.pos.y === y && !t.owner);
      const isCurrentPlayerPosition = player?.id === currentTurn;
      
      // Determine cell styling
      let cellClasses = "w-12 h-12 text-center border-2 border-gray-300 relative transition-all duration-300 ";
      
      if (sui) {
        cellClasses += "bg-gradient-to-br from-yellow-200 to-yellow-400 border-yellow-500 animate-pulse ";
      } else if (player) {
        const config = playerConfig[player.id as keyof typeof playerConfig];
        cellClasses += `${config.bgColor} ${config.borderColor} `;
        if (isCurrentPlayerPosition) {
          cellClasses += `shadow-lg ${config.glowColor} animate-bounce `;
        }
      } else {
        // Empty cells with checkerboard pattern
        cellClasses += (x + y) % 2 === 0 ? "bg-gray-50 " : "bg-gray-100 ";
      }
      
      row.push(
        <td key={x} className={cellClasses}>
          <div className="w-full h-full flex items-center justify-center text-2xl font-bold">
            {player ? (
              <div className="relative">
                {playerConfig[player.id as keyof typeof playerConfig]?.avatar}
                {isCurrentPlayerPosition && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-ping"></div>
                )}
              </div>
            ) : sui ? (
              <div className="relative">
                💎
                <div className="absolute inset-0 bg-yellow-400 rounded-full opacity-30 animate-ping"></div>
              </div>
            ) : (
              <div className="text-xs text-gray-400 font-mono">
                {x},{y}
              </div>
            )}
          </div>
        </td>
      );
    }
    board.push(<tr key={y}>{row}</tr>);
  }

  return (
    <div className="flex flex-col items-center space-y-6">
      {/* Game Board */}
      <div className="relative p-4 bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl shadow-2xl border-4 border-slate-300">
        <div className="absolute -top-2 -left-2 w-4 h-4 bg-blue-500 rounded-full"></div>
        <div className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 rounded-full"></div>
        <div className="absolute -bottom-2 -left-2 w-4 h-4 bg-green-500 rounded-full"></div>
        <div className="absolute -bottom-2 -right-2 w-4 h-4 bg-yellow-500 rounded-full"></div>
        
        <table className="border-collapse">
          <tbody>{board}</tbody>
        </table>
      </div>
      
      {/* Movement Controls */}
      {phase === "playing" && (
        <div className="flex flex-col items-center space-y-4">
          <div className="text-lg font-semibold text-gray-700">
            {playerConfig[currentTurn as keyof typeof playerConfig]?.name}'s Turn
          </div>
          
          {/* Directional Controls */}
          <div className="grid grid-cols-3 gap-2">
            <div></div>
            <button
              className={`w-16 h-16 ${dirs[0].color} text-white text-2xl font-bold rounded-lg shadow-lg transform transition-all duration-150 hover:scale-110 active:scale-95`}
              onClick={() => onMove(currentTurn, "up")}
            >
              {dirs[0].label}
            </button>
            <div></div>
            
            <button
              className={`w-16 h-16 ${dirs[2].color} text-white text-2xl font-bold rounded-lg shadow-lg transform transition-all duration-150 hover:scale-110 active:scale-95`}
              onClick={() => onMove(currentTurn, "left")}
            >
              {dirs[2].label}
            </button>
            <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center text-3xl">
              {playerConfig[currentTurn as keyof typeof playerConfig]?.avatar}
            </div>
            <button
              className={`w-16 h-16 ${dirs[3].color} text-white text-2xl font-bold rounded-lg shadow-lg transform transition-all duration-150 hover:scale-110 active:scale-95`}
              onClick={() => onMove(currentTurn, "right")}
            >
              {dirs[3].label}
            </button>
            
            <div></div>
            <button
              className={`w-16 h-16 ${dirs[1].color} text-white text-2xl font-bold rounded-lg shadow-lg transform transition-all duration-150 hover:scale-110 active:scale-95`}
              onClick={() => onMove(currentTurn, "down")}
            >
              {dirs[1].label}
            </button>
            <div></div>
          </div>
        </div>
      )}
    </div>
  );
}
