import React from 'react';
import { GameState, Coord, BOARD_SIZE } from '../types/game';

interface GameBoardProps {
  gameState: GameState;
  onCellClick?: (coord: Coord) => void;
}

export function GameBoard({ gameState, onCellClick }: GameBoardProps) {
  const renderCell = (x: number, y: number) => {
    const coord = { x, y };
    
    // Check if any player is at this position
    const playerAtPosition = gameState.playersPositions.findIndex(
      pos => pos.x === x && pos.y === y
    );
    
    // Check if there's a tile at this position (simplified)
    const hasTile = gameState.tileIds.length > 0; // Simplified tile logic
    
    let cellContent = '';
    let cellClass = 'w-8 h-8 border border-gray-300 flex items-center justify-center text-xs cursor-pointer ';
    
    if (playerAtPosition >= 0) {
      cellContent = `P${playerAtPosition + 1}`;
      cellClass += playerAtPosition === 0 ? 'bg-blue-200 text-blue-800' : 'bg-red-200 text-red-800';
    } else if (hasTile && Math.random() > 0.8) { // Random tile placement for demo
      cellContent = '💎';
      cellClass += 'bg-yellow-100';
    } else {
      cellClass += 'bg-gray-50 hover:bg-gray-100';
    }
    
    return (
      <div
        key={`${x}-${y}`}
        className={cellClass}
        onClick={() => onCellClick?.(coord)}
        title={`(${x}, ${y})`}
      >
        {cellContent}
      </div>
    );
  };

  return (
    <div className="inline-block p-4 bg-white rounded-lg shadow-md">
      <div className="grid gap-0" style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)` }}>
        {Array.from({ length: BOARD_SIZE }, (_, y) =>
          Array.from({ length: BOARD_SIZE }, (_, x) => renderCell(x, y))
        )}
      </div>
    </div>
  );
}