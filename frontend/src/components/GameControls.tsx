import React from 'react';
import { useWallet } from '@suiet/wallet-kit';
import { DIRECTIONS, DIRECTION_NAMES, GameState, MoveCap } from '../types/game';
import { moveWithCap, forceTimeoutMove } from '../utils/sui';

interface GameControlsProps {
  gameState: GameState;
  moveCap: MoveCap | null;
  isMyTurn: boolean;
  canForceTimeout: boolean;
  timeRemaining: number;
  onError: (error: string) => void;
}

export function GameControls({ 
  gameState, 
  moveCap, 
  isMyTurn, 
  canForceTimeout, 
  timeRemaining,
  onError 
}: GameControlsProps) {
  const { account, signAndExecuteTransactionBlock } = useWallet();

  const handleMove = async (direction: number) => {
    if (!moveCap || !isMyTurn || !account) return;
    
    try {
      const tx = await moveWithCap(gameState.id, moveCap.id, direction);
      
      const result = await signAndExecuteTransactionBlock({
        transactionBlock: tx as any,
        options: {
          showEffects: true,
        }
      });
      console.log('Move successful', result);
    } catch (error) {
      onError(`Move failed: ${error}`);
    }
  };

  const handleForceTimeout = async () => {
    if (!canForceTimeout || !account) return;
    
    try {
      const tx = await forceTimeoutMove(gameState.id);
      
      const result = await signAndExecuteTransactionBlock({
        transactionBlock: tx as any,
        options: {
          showEffects: true,
        }
      });
      console.log('Force timeout successful', result);
    } catch (error) {
      onError(`Force timeout failed: ${error}`);
    }
  };

  const formatTime = (ms: number) => {
    const seconds = Math.ceil(ms / 1000);
    return `${seconds}s`;
  };

  if (gameState.status !== 1) {
    return (
      <div className="p-4 bg-gray-100 rounded-lg">
        <p className="text-gray-600">Game not active</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white rounded-lg shadow-md space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Game Controls</h3>
        <p className="text-sm text-gray-600">
          Time remaining: <span className="font-mono">{formatTime(timeRemaining)}</span>
        </p>
        {moveCap && (
          <p className="text-sm text-gray-600">
            Moves remaining: <span className="font-mono">{moveCap.movesRemaining}</span>
          </p>
        )}
      </div>

      {isMyTurn && moveCap && moveCap.movesRemaining > 0 ? (
        <div>
          <p className="text-sm text-green-600 mb-3 text-center">Your turn!</p>
          <div className="grid grid-cols-3 gap-2 max-w-48 mx-auto">
            <div></div>
            <button
              onClick={() => handleMove(DIRECTIONS.UP)}
              className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              title={DIRECTION_NAMES[DIRECTIONS.UP]}
            >
              ⬆️
            </button>
            <div></div>
            
            <button
              onClick={() => handleMove(DIRECTIONS.LEFT)}
              className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              title={DIRECTION_NAMES[DIRECTIONS.LEFT]}
            >
              ⬅️
            </button>
            <div></div>
            <button
              onClick={() => handleMove(DIRECTIONS.RIGHT)}
              className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              title={DIRECTION_NAMES[DIRECTIONS.RIGHT]}
            >
              ➡️
            </button>
            
            <div></div>
            <button
              onClick={() => handleMove(DIRECTIONS.DOWN)}
              className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              title={DIRECTION_NAMES[DIRECTIONS.DOWN]}
            >
              ⬇️
            </button>
            <div></div>
          </div>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-3">
            {isMyTurn ? "No moves remaining" : "Waiting for opponent..."}
          </p>
          
          {canForceTimeout && (
            <button
              onClick={handleForceTimeout}
              className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors"
            >
              Force Timeout Move
            </button>
          )}
        </div>
      )}
    </div>
  );
}