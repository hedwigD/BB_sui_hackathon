import React, { useState } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { GameState, MAX_TILES } from '../types/game';
import { createGame, joinGame, startGame, findSuiCoin } from '../utils/sui';
import { REGISTRY_ID } from '../utils/sui';

interface GameLobbyProps {
  onGameCreated: (gameId: string) => void;
  onError: (error: string) => void;
}

export function GameLobby({ onGameCreated, onError }: GameLobbyProps) {
  const currentAccount = useCurrentAccount();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const account = currentAccount ? { address: currentAccount.address } : null;
  const [joinGameId, setJoinGameId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const handleCreateGame = async () => {
    if (!account) {
      onError('Please connect your wallet first');
      return;
    }

    try {
      setIsCreating(true);
      const tx = await createGame(REGISTRY_ID);
      
      const result = await signAndExecuteTransaction({
        transaction: tx,
      });
      
      // Extract game ID from transaction effects
      const gameId = extractGameIdFromEffects(result.effects);
      if (gameId) {
        onGameCreated(gameId);
      } else {
        onError('Failed to extract game ID from transaction');
      }
    } catch (error) {
      onError(`Failed to create game: ${error}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinGame = async () => {
    if (!account || !joinGameId.trim()) {
      onError('Please connect wallet and enter game ID');
      return;
    }

    try {
      setIsJoining(true);
      const tx = await joinGame(joinGameId.trim());
      
      await signAndExecuteTransaction({
        transaction: tx,
      });
      onGameCreated(joinGameId.trim());
    } catch (error) {
      onError(`Failed to join game: ${error}`);
    } finally {
      setIsJoining(false);
    }
  };

  // Helper function to extract game ID from transaction effects
  const extractGameIdFromEffects = (effects: any): string | null => {
    try {
      // Look for created objects in the transaction effects
      if (effects?.created) {
        for (const created of effects.created) {
          if (created.reference?.objectId) {
            return created.reference.objectId;
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  };

  if (!account) {
    return (
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold mb-4">Welcome to Tile Game</h2>
        <p className="text-gray-600 mb-4">Please connect your wallet to start playing</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md space-y-6">
      <h2 className="text-2xl font-bold text-center">Game Lobby</h2>
      
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">Create New Game</h3>
          <button
            onClick={handleCreateGame}
            disabled={isCreating}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 transition-colors"
          >
            {isCreating ? 'Creating...' : 'Create Game'}
          </button>
        </div>

        <div className="border-t pt-4">
          <h3 className="text-lg font-semibold mb-2">Join Existing Game</h3>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Enter Game ID"
              value={joinGameId}
              onChange={(e) => setJoinGameId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleJoinGame}
              disabled={isJoining || !joinGameId.trim()}
              className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 transition-colors"
            >
              {isJoining ? 'Joining...' : 'Join Game'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface GameWaitingRoomProps {
  gameState: GameState;
  myIndex: number | null;
  onError: (error: string) => void;
}

export function GameWaitingRoom({ gameState, myIndex, onError }: GameWaitingRoomProps) {
  const currentAccount = useCurrentAccount();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const account = currentAccount ? { address: currentAccount.address } : null;
  const [isStarting, setIsStarting] = useState(false);

  const isCreator = account?.address === gameState.creator;
  const canStart = isCreator && gameState.players.length === 2 && gameState.status === 0;

  const handleStartGame = async () => {
    if (!account || !canStart) return;

    try {
      setIsStarting(true);
      
      // Find a coin with 10 SUI
      const coinId = await findSuiCoin(account.address, BigInt(MAX_TILES * 1_000_000_000)); // 10 SUI in MIST
      if (!coinId) {
        onError('You need at least 10 SUI to start the game');
        return;
      }

      const tx = await startGame(gameState.id, coinId);
      
      await signAndExecuteTransaction({
        transaction: tx,
      });
      console.log('Game started successfully');
    } catch (error) {
      onError(`Failed to start game: ${error}`);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold text-center mb-4">Game Lobby</h2>
      
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold">Game ID:</h3>
          <p className="text-sm font-mono bg-gray-100 p-2 rounded break-all">{gameState.id}</p>
        </div>

        <div>
          <h3 className="font-semibold">Players ({gameState.players.length}/2):</h3>
          <div className="space-y-1">
            {gameState.players.map((player, index) => (
              <div key={player} className="text-sm">
                <span className={index === 0 ? "text-blue-600" : "text-red-600"}>
                  Player {index + 1}:
                </span>
                <span className="ml-2 font-mono text-xs">
                  {player === account?.address ? 'You' : `${player.slice(0, 8)}...`}
                </span>
                {player === gameState.creator && (
                  <span className="ml-2 text-xs bg-yellow-200 px-1 rounded">Creator</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {gameState.players.length < 2 && (
          <div className="text-center text-gray-600">
            Waiting for second player to join...
          </div>
        )}

        {canStart && (
          <button
            onClick={handleStartGame}
            disabled={isStarting}
            className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 transition-colors"
          >
            {isStarting ? 'Starting...' : `Start Game (${MAX_TILES} SUI required)`}
          </button>
        )}

        {!isCreator && gameState.players.length === 2 && (
          <div className="text-center text-gray-600">
            Waiting for creator to start the game...
          </div>
        )}
      </div>
    </div>
  );
}