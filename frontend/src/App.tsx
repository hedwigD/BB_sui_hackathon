import React, { useState } from 'react';
import { SuiProvider } from './providers/SuiProvider';
import { GameLobby, GameWaitingRoom } from './components/GameLobby';
import { GameBoard } from './components/GameBoard';
import { GameControls } from './components/GameControls';
import { useGameState } from './hooks/useGameState';
import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit';

function GameApp() {
  const currentAccount = useCurrentAccount();
  const account = currentAccount ? { address: currentAccount.address } : null;
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    gameState,
    moveCap,
    myIndex,
    timeRemaining,
    isMyTurn,
    canForceTimeout,
  } = useGameState(currentGameId);

  const handleGameCreated = (gameId: string) => {
    setCurrentGameId(gameId);
    setError(null);
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    setTimeout(() => setError(null), 5000); // Clear error after 5 seconds
  };

  const handleLeaveGame = () => {
    setCurrentGameId(null);
    setError(null);
  };

  // Effect to fetch move cap when game starts
  React.useEffect(() => {
    if (gameState && gameState.status === 1 && account?.address && !moveCap) {
      // Try to find the move cap for this player
      // In a real app, you'd get the move cap ID from transaction effects or events
      // For now, this is a placeholder
    }
  }, [gameState, account, moveCap]);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Sui Tile Game</h1>
          <ConnectButton />
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4">
        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {!currentGameId ? (
          <GameLobby onGameCreated={handleGameCreated} onError={handleError} />
        ) : !gameState ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading game...</p>
          </div>
        ) : gameState.status === 0 ? (
          <GameWaitingRoom 
            gameState={gameState} 
            myIndex={myIndex} 
            onError={handleError} 
          />
        ) : gameState.status === 1 ? (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Game in Progress</h2>
              <button
                onClick={handleLeaveGame}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Leave Game
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <GameBoard gameState={gameState} />
              </div>
              
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-lg shadow-md">
                  <h3 className="font-semibold mb-2">Game Status</h3>
                  <div className="space-y-1 text-sm">
                    <div>Turn: Player {gameState.currentTurn + 1}</div>
                    <div>Tiles Remaining: {gameState.tilesRemaining}</div>
                    <div>Your Index: {myIndex !== null ? myIndex + 1 : 'Observer'}</div>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg shadow-md">
                  <h3 className="font-semibold mb-2">Scores</h3>
                  {gameState.playersScores.map((score, index) => (
                    <div key={index} className="flex justify-between">
                      <span className={index === 0 ? "text-blue-600" : "text-red-600"}>
                        Player {index + 1}:
                      </span>
                      <span>{score}</span>
                    </div>
                  ))}
                </div>

                <GameControls
                  gameState={gameState}
                  moveCap={moveCap}
                  isMyTurn={isMyTurn || false}
                  canForceTimeout={canForceTimeout || false}
                  timeRemaining={timeRemaining}
                  onError={handleError}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <h2 className="text-2xl font-bold mb-4">Game Finished!</h2>
            {gameState.winner ? (
              <p className="text-lg">
                Winner: Player {gameState.players.findIndex(p => p === gameState.winner) + 1}
                {gameState.winner === account?.address && " (You!)"}
              </p>
            ) : (
              <p className="text-lg">It's a draw!</p>
            )}
            <div className="mt-4 bg-white p-4 rounded-lg shadow-md inline-block">
              <h3 className="font-semibold mb-2">Final Scores</h3>
              {gameState.playersScores.map((score, index) => (
                <div key={index} className="flex justify-between">
                  <span className={index === 0 ? "text-blue-600" : "text-red-600"}>
                    Player {index + 1}:
                  </span>
                  <span>{score}</span>
                </div>
              ))}
            </div>
            <button
              onClick={handleLeaveGame}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Back to Lobby
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function App() {
  return (
    <SuiProvider>
      <GameApp />
    </SuiProvider>
  );
}

export default App;
