import { useState, useEffect } from "react";
import { Player, SuiTile } from "../types/game";

type Props = {
  boardSize: number;
  players: Player[];
  suiTiles: SuiTile[];
  onMove: (playerId: string, dir: "up" | "down" | "left" | "right") => void;
  currentTurn: string;
  phase: string;
  playerConfig: any;
};

const dirs = [
  { key: "up", label: "↑", color: "bg-blue-500 hover:bg-blue-600" },
  { key: "down", label: "↓", color: "bg-green-500 hover:bg-green-600" },
  { key: "left", label: "←", color: "bg-purple-500 hover:bg-purple-600" },
  { key: "right", label: "→", color: "bg-orange-500 hover:bg-orange-600" },
];

export default function EnhancedGameBoard({
  boardSize,
  players,
  suiTiles,
  onMove,
  currentTurn,
  phase,
  playerConfig,
}: Props) {
  const [hoveredSquare, setHoveredSquare] = useState<{x: number, y: number} | null>(null);
  const [lastMove, setLastMove] = useState<{from: {x: number, y: number}, to: {x: number, y: number}} | null>(null);

  // Track moves for animation
  useEffect(() => {
    const currentPlayer = players.find(p => p.id === currentTurn);
    if (currentPlayer) {
      // This would be enhanced to track actual moves
      setLastMove(null);
    }
  }, [players, currentTurn]);

  // Generate board coordinates (A-J, 1-10)
  const getSquareLabel = (x: number, y: number) => {
    const file = String.fromCharCode(65 + x); // A-J
    const rank = (boardSize - y).toString(); // 10-1
    return `${file}${rank}`;
  };

  // Determine square color (chess.com style)
  const getSquareColor = (x: number, y: number) => {
    const isLight = (x + y) % 2 === 0;
    const baseColor = isLight ? 'bg-amber-50' : 'bg-amber-800';
    
    // Add hover effect
    if (hoveredSquare && hoveredSquare.x === x && hoveredSquare.y === y) {
      return isLight ? 'bg-yellow-200' : 'bg-amber-600';
    }
    
    // Highlight last move
    if (lastMove && 
        ((lastMove.from.x === x && lastMove.from.y === y) || 
         (lastMove.to.x === x && lastMove.to.y === y))) {
      return isLight ? 'bg-yellow-300' : 'bg-yellow-600';
    }
    
    return baseColor;
  };

  // Enhanced 2D board rendering
  const board = [];
  
  // Add file labels (A-J) at top
  const topLabels = (
    <div className="flex">
      <div className="w-8 h-8 flex items-center justify-center"></div> {/* Corner space */}
      {Array.from({ length: boardSize }, (_, i) => (
        <div key={i} className="w-16 h-8 flex items-center justify-center text-amber-700 font-bold text-lg">
          {String.fromCharCode(65 + i)}
        </div>
      ))}
      <div className="w-8 h-8 flex items-center justify-center"></div> {/* Corner space */}
    </div>
  );

  for (let y = 0; y < boardSize; y++) {
    let row = [];
    
    // Rank label (left side)
    row.push(
      <div key="rank-left" className="w-8 h-16 flex items-center justify-center text-amber-700 font-bold text-lg">
        {boardSize - y}
      </div>
    );
    
    for (let x = 0; x < boardSize; x++) {
      const player = players.find((p) => p.pos.x === x && p.pos.y === y);
      const sui = suiTiles.find((t) => t.pos.x === x && t.pos.y === y && !t.owner);
      const isCurrentPlayerPosition = player?.id === currentTurn;
      
      // Determine square styling
      const squareColor = getSquareColor(x, y);
      
      row.push(
        <div
          key={x}
          className={`
            w-16 h-16 relative cursor-pointer transition-all duration-200 ease-in-out
            ${squareColor}
            border border-amber-900/20
            hover:ring-2 hover:ring-yellow-400/50
            ${isCurrentPlayerPosition ? 'ring-2 ring-blue-400 shadow-lg shadow-blue-400/30' : ''}
          `}
          onMouseEnter={() => setHoveredSquare({x, y})}
          onMouseLeave={() => setHoveredSquare(null)}
        >
          {/* Square coordinate (chess.com style) */}
          <div className="absolute bottom-0 right-0 text-[10px] text-amber-700/50 font-mono leading-none p-0.5">
            {getSquareLabel(x, y)}
          </div>
          
          {/* Game pieces */}
          <div className="absolute inset-0 flex items-center justify-center">
            {player && (
              <div className={`
                relative transform transition-all duration-300 
                ${isCurrentPlayerPosition ? 'scale-110 animate-pulse' : 'scale-100'}
              `}>
                {/* Player piece with shadow */}
                <div className="relative">
                  <div className="text-4xl filter drop-shadow-lg">
                    {playerConfig[player.id]?.avatar}
                  </div>
                  {/* Active indicator */}
                  {isCurrentPlayerPosition && (
                    <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2">
                      <div className="w-3 h-1 bg-blue-400 rounded-full animate-ping"></div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {sui && (
              <div className="relative transform transition-all duration-200 hover:scale-110">
                {/* Sui tile with glowing effect */}
                <div className="relative">
                  <div className="text-3xl animate-pulse">💎</div>
                  <div className="absolute inset-0 bg-yellow-400/30 rounded-full blur-md animate-pulse"></div>
                  <div className="absolute -inset-1 bg-gradient-to-r from-yellow-400 to-amber-400 rounded-full opacity-20 animate-ping"></div>
                </div>
              </div>
            )}
          </div>
          
          {/* Possible move indicator */}
          {phase === "playing" && !player && !sui && hoveredSquare?.x === x && hoveredSquare?.y === y && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-4 h-4 bg-green-400/60 rounded-full animate-pulse"></div>
            </div>
          )}
        </div>
      );
    }
    
    // Rank label (right side)
    row.push(
      <div key="rank-right" className="w-8 h-16 flex items-center justify-center text-amber-700 font-bold text-lg">
        {boardSize - y}
      </div>
    );
    
    board.push(
      <div key={y} className="flex">
        {row}
      </div>
    );
  }

  // Bottom file labels
  const bottomLabels = (
    <div className="flex">
      <div className="w-8 h-8 flex items-center justify-center"></div> {/* Corner space */}
      {Array.from({ length: boardSize }, (_, i) => (
        <div key={i} className="w-16 h-8 flex items-center justify-center text-amber-700 font-bold text-lg">
          {String.fromCharCode(65 + i)}
        </div>
      ))}
      <div className="w-8 h-8 flex items-center justify-center"></div> {/* Corner space */}
    </div>
  );

  return (
    <div className="flex flex-col items-center space-y-6">
      {/* Chess.com style board with coordinates */}
      <div className="relative">
        {/* Board container with professional styling */}
        <div className="p-4 bg-gradient-to-br from-amber-100 to-amber-200 rounded-2xl shadow-2xl border-4 border-amber-900/20">
          <div className="flex flex-col">
            {topLabels}
            <div className="border-2 border-amber-900/30 rounded-lg overflow-hidden">
              {board}
            </div>
            {bottomLabels}
          </div>
        </div>
        
        {/* Turn indicator overlay */}
        {phase === "playing" && (
          <div className="absolute -top-12 left-1/2 transform -translate-x-1/2">
            <div className={`
              px-4 py-2 rounded-full text-white font-bold shadow-lg
              ${currentTurn === 'p1' ? 'bg-blue-500' : 'bg-red-500'}
              animate-pulse
            `}>
              {playerConfig[currentTurn]?.name}'s Turn
            </div>
          </div>
        )}
      </div>
      
      {/* Enhanced Movement Controls */}
      {phase === "playing" && (
        <div className="flex flex-col items-center space-y-4 bg-slate-800/90 backdrop-blur rounded-2xl p-6 border border-white/20">
          <div className="text-white font-semibold mb-2">
            Move with WASD or Arrow Keys
          </div>
          
          {/* Visual keyboard layout */}
          <div className="grid grid-cols-3 gap-2">
            <div></div>
            <div className="flex flex-col items-center">
              <div className="text-xs text-white/70 mb-1">↑ W</div>
              <button
                className={`w-12 h-12 ${dirs[0].color} text-white text-xl font-bold rounded-lg shadow-lg transform transition-all duration-150 hover:scale-110 active:scale-95`}
                onClick={() => onMove(currentTurn, "up")}
              >
                ↑
              </button>
            </div>
            <div></div>
            
            <div className="flex flex-col items-center">
              <div className="text-xs text-white/70 mb-1">← A</div>
              <button
                className={`w-12 h-12 ${dirs[2].color} text-white text-xl font-bold rounded-lg shadow-lg transform transition-all duration-150 hover:scale-110 active:scale-95`}
                onClick={() => onMove(currentTurn, "left")}
              >
                ←
              </button>
            </div>
            <div className="w-12 h-12 bg-gray-700 rounded-lg flex items-center justify-center text-2xl">
              {playerConfig[currentTurn]?.avatar}
            </div>
            <div className="flex flex-col items-center">
              <div className="text-xs text-white/70 mb-1">→ D</div>
              <button
                className={`w-12 h-12 ${dirs[3].color} text-white text-xl font-bold rounded-lg shadow-lg transform transition-all duration-150 hover:scale-110 active:scale-95`}
                onClick={() => onMove(currentTurn, "right")}
              >
                →
              </button>
            </div>
            
            <div></div>
            <div className="flex flex-col items-center">
              <div className="text-xs text-white/70 mb-1">↓ S</div>
              <button
                className={`w-12 h-12 ${dirs[1].color} text-white text-xl font-bold rounded-lg shadow-lg transform transition-all duration-150 hover:scale-110 active:scale-95`}
                onClick={() => onMove(currentTurn, "down")}
              >
                ↓
              </button>
            </div>
            <div></div>
          </div>
          
          <div className="text-xs text-white/50 text-center">
            Click buttons or use keyboard controls
          </div>
        </div>
      )}
    </div>
  );
}