import { Player } from "../types/game";

type Props = {
  players: Player[];
  currentTurn: string;
  turnTimeLeft?: number;
};

const playerConfig = {
  p1: { 
    avatar: "🦸‍♂️", 
    name: "Hero", 
    bgGradient: "from-blue-400 to-blue-600",
    borderColor: "border-blue-500",
    glowColor: "shadow-blue-500/50"
  },
  p2: { 
    avatar: "🦹‍♀️", 
    name: "Villain", 
    bgGradient: "from-red-400 to-red-600",
    borderColor: "border-red-500",
    glowColor: "shadow-red-500/50"
  }
};

export default function PlayerPanel({ players, currentTurn, turnTimeLeft = 3 }: Props) {
  return (
    <div className="flex justify-center space-x-8 mb-6">
      {players.map((player) => {
        const isCurrentTurn = currentTurn === player.id;
        const config = playerConfig[player.id as keyof typeof playerConfig];
        
        return (
          <div
            key={player.id}
            className={`relative transform transition-all duration-300 ${
              isCurrentTurn ? "scale-110" : "scale-100 opacity-75"
            }`}
          >
            {/* Player Card */}
            <div
              className={`
                relative p-6 rounded-2xl border-4 ${config.borderColor} 
                bg-gradient-to-br ${config.bgGradient} text-white
                shadow-2xl ${isCurrentTurn ? `${config.glowColor} shadow-2xl animate-pulse` : ""}
                transition-all duration-300
              `}
            >
              {/* Avatar */}
              <div className="text-center mb-4">
                <div className="text-6xl mb-2 relative">
                  {config.avatar}
                  {isCurrentTurn && (
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-400 rounded-full animate-ping"></div>
                  )}
                </div>
                <h3 className="text-xl font-bold">{config.name}</h3>
              </div>

              {/* Stats */}
              <div className="space-y-3">
                {/* Score */}
                <div className="flex justify-between items-center">
                  <span className="text-sm opacity-80">Score:</span>
                  <div className="flex items-center space-x-1">
                    <span className="text-2xl font-bold">{player.score}</span>
                    <span className="text-lg">💎</span>
                  </div>
                </div>

                {/* Position */}
                <div className="flex justify-between items-center">
                  <span className="text-sm opacity-80">Position:</span>
                  <span className="text-sm font-mono bg-black/20 px-2 py-1 rounded">
                    ({player.pos.x}, {player.pos.y})
                  </span>
                </div>

                {/* Turn Timer (only for current player) */}
                {isCurrentTurn && (
                  <div className="mt-4 pt-3 border-t border-white/30">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm opacity-80">Time Left:</span>
                      <span className={`text-lg font-bold ${turnTimeLeft <= 1 ? "text-red-200 animate-bounce" : ""}`}>
                        {turnTimeLeft}s
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
                      <div 
                        className="h-full bg-white transition-all duration-1000 ease-linear"
                        style={{ width: `${(turnTimeLeft / 3) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Active indicator */}
              {isCurrentTurn && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <div className="bg-green-400 text-green-900 px-3 py-1 rounded-full text-xs font-bold animate-bounce">
                    YOUR TURN
                  </div>
                </div>
              )}
            </div>

            {/* Decoration elements */}
            <div className={`absolute -inset-1 bg-gradient-to-r ${config.bgGradient} rounded-2xl blur opacity-20 ${isCurrentTurn ? "animate-pulse" : ""}`}></div>
          </div>
        );
      })}
    </div>
  );
}
