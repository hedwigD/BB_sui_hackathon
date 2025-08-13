import { useSuiGame } from "./hooks/useSuiGame";
import GameBoard from "./components/GameBoard";
import PlayerPanel from "./components/PlayerPanel";
import GameStats from "./components/GameStats";
import PlayerCustomization from "./components/PlayerCustomization";
import { useSoundEffects } from "./hooks/useSoundEffects";
import { useState } from "react";

function App() {
  const { state, movePlayer, startGame, resetGame, customizePlayers, playerConfig, turnTimeLeft, totalMoves } = useSuiGame();
  const soundEffects = useSoundEffects();
  const [showCustomization, setShowCustomization] = useState(false);

  // Determine winner
  function getGameResult() {
    if (state.phase !== "finished") return null;
    const [p1, p2] = state.players;
    if (p1.score > p2.score) return { winner: playerConfig.p1.name, isDraw: false };
    if (p2.score > p1.score) return { winner: playerConfig.p2.name, isDraw: false };
    return { winner: null, isDraw: true };
  }

  const gameResult = getGameResult();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="flex flex-col items-center">
        <h1 className="text-5xl font-bold mb-8 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent drop-shadow-lg">
          ⚡ Sui Tile Capture Arena ⚡
        </h1>
      
        {/* Game Controls */}
        <div className="mb-8 flex space-x-6">
          {state.phase === "lobby" && (
            <button 
              onClick={() => { soundEffects.buttonClick(); startGame(); }}
              className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-2xl font-bold text-lg shadow-2xl transform transition-all duration-200 hover:scale-105 hover:shadow-green-500/25 active:scale-95"
            >
              🚀 Start Epic Battle
            </button>
          )}
          
          {state.phase === "finished" && (
            <button 
              onClick={() => { soundEffects.buttonClick(); resetGame(); }}
              className="px-8 py-4 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-2xl font-bold text-lg shadow-2xl transform transition-all duration-200 hover:scale-105 hover:shadow-blue-500/25 active:scale-95"
            >
              🔄 Play Again
            </button>
          )}
          
          <button 
            onClick={() => { soundEffects.buttonClick(); resetGame(); }}
            className="px-6 py-3 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-xl font-semibold shadow-xl transform transition-all duration-200 hover:scale-105 hover:shadow-gray-500/25 active:scale-95"
          >
            🔄 Reset
          </button>
          
          {state.phase === "lobby" && (
            <button 
              onClick={() => { soundEffects.buttonClick(); setShowCustomization(true); }}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl font-semibold shadow-xl transform transition-all duration-200 hover:scale-105 hover:shadow-purple-500/25 active:scale-95"
            >
              🎨 Customize
            </button>
          )}
        </div>

        {/* Game Statistics */}
        <GameStats 
          players={state.players} 
          suiTiles={state.suiTiles} 
          phase={state.phase}
          totalMoves={totalMoves}
        />

        {/* Player Panel */}
        <PlayerPanel 
          players={state.players} 
          currentTurn={state.currentTurn} 
          turnTimeLeft={turnTimeLeft}
        />
        
        {/* Game Board */}
        <GameBoard
          boardSize={state.boardSize}
          players={state.players}
          suiTiles={state.suiTiles}
          onMove={movePlayer}
          currentTurn={state.currentTurn}
          phase={state.phase}
        />
        
        {/* Game Status */}
        {state.phase === "lobby" && (
          <div className="mt-8 p-8 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 backdrop-blur rounded-2xl border border-white/20 text-center max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-4 text-white">🎮 How to Play:</h2>
            <div className="text-white/90 space-y-2">
              <p>🦸‍♂️ Control your hero to capture precious Sui gems 💎</p>
              <p>⏱️ Each turn lasts 3 seconds - think fast!</p>
              <p>🏆 Capture more gems than your opponent to win!</p>
              <p>🔄 Use arrow buttons to move around the battlefield</p>
            </div>
          </div>
        )}
        
        {state.phase === "finished" && gameResult && (
          <div className="mt-8 p-8 bg-gradient-to-r from-yellow-400/20 to-orange-500/20 backdrop-blur rounded-2xl border border-yellow-400/30 text-center max-w-2xl mx-auto">
            <div className="text-6xl mb-4">
              {gameResult.isDraw ? "🤝" : "🎉"}
            </div>
            <h2 className="text-3xl font-bold mb-4 text-white">
              {gameResult.isDraw ? "Epic Draw!" : `${gameResult.winner} Conquers!`}
            </h2>
            <div className="text-xl text-white/90 mb-4">
              Final Battle Results:
            </div>
            <div className="flex justify-center space-x-8 text-white">
              {state.players.map(p => (
                <div key={p.id} className="text-center">
                  <div className="text-2xl mb-1">{playerConfig[p.id as keyof typeof playerConfig]?.avatar}</div>
                  <div className="font-bold">{playerConfig[p.id as keyof typeof playerConfig]?.name}</div>
                  <div className="text-2xl font-bold">{p.score} 💎</div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-sm text-white/70">
              Total moves: {totalMoves} • Battle duration: Epic!
            </div>
          </div>
        )}
        
        {/* Player Customization Modal */}
        <PlayerCustomization
          isOpen={showCustomization}
          onClose={() => setShowCustomization(false)}
          onCustomize={(p1, p2) => {
            customizePlayers(p1, p2);
            soundEffects.buttonClick();
          }}
        />
      </div>
    </div>
  );
}

export default App;