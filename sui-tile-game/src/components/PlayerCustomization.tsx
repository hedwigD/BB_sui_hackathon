import { useState } from "react";

const avatarOptions = [
  { emoji: "🦸‍♂️", name: "Hero" },
  { emoji: "🦹‍♀️", name: "Villain" },
  { emoji: "🧙‍♂️", name: "Wizard" },
  { emoji: "🧙‍♀️", name: "Witch" },
  { emoji: "👑", name: "King" },
  { emoji: "👸", name: "Queen" },
  { emoji: "🥷", name: "Ninja" },
  { emoji: "🤖", name: "Robot" },
  { emoji: "👽", name: "Alien" },
  { emoji: "🐉", name: "Dragon" },
];

const colorThemes = [
  { name: "Blue Hero", bgGradient: "from-blue-400 to-blue-600", borderColor: "border-blue-500" },
  { name: "Red Villain", bgGradient: "from-red-400 to-red-600", borderColor: "border-red-500" },
  { name: "Green Nature", bgGradient: "from-green-400 to-green-600", borderColor: "border-green-500" },
  { name: "Purple Magic", bgGradient: "from-purple-400 to-purple-600", borderColor: "border-purple-500" },
  { name: "Orange Fire", bgGradient: "from-orange-400 to-orange-600", borderColor: "border-orange-500" },
  { name: "Pink Power", bgGradient: "from-pink-400 to-pink-600", borderColor: "border-pink-500" },
];

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCustomize: (player1: any, player2: any) => void;
};

export default function PlayerCustomization({ isOpen, onClose, onCustomize }: Props) {
  const [player1Avatar, setPlayer1Avatar] = useState(0);
  const [player1Theme, setPlayer1Theme] = useState(0);
  const [player2Avatar, setPlayer2Avatar] = useState(1);
  const [player2Theme, setPlayer2Theme] = useState(1);

  if (!isOpen) return null;

  const handleSave = () => {
    onCustomize(
      {
        avatar: avatarOptions[player1Avatar].emoji,
        name: avatarOptions[player1Avatar].name,
        theme: colorThemes[player1Theme]
      },
      {
        avatar: avatarOptions[player2Avatar].emoji,
        name: avatarOptions[player2Avatar].name,
        theme: colorThemes[player2Theme]
      }
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-white/20">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-white">🎨 Customize Players</h2>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white text-2xl"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Player 1 Customization */}
          <div className="bg-white/10 rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4 text-center">Player 1</h3>
            
            {/* Preview */}
            <div className="mb-6 flex justify-center">
              <div className={`p-4 rounded-xl border-4 ${colorThemes[player1Theme].borderColor} bg-gradient-to-br ${colorThemes[player1Theme].bgGradient}`}>
                <div className="text-4xl text-center mb-2">{avatarOptions[player1Avatar].emoji}</div>
                <div className="text-white font-bold text-center">{avatarOptions[player1Avatar].name}</div>
              </div>
            </div>

            {/* Avatar Selection */}
            <div className="mb-4">
              <h4 className="text-white font-semibold mb-2">Choose Avatar:</h4>
              <div className="grid grid-cols-5 gap-2">
                {avatarOptions.map((avatar, index) => (
                  <button
                    key={index}
                    onClick={() => setPlayer1Avatar(index)}
                    className={`p-3 text-2xl rounded-lg transition-all ${
                      player1Avatar === index 
                        ? 'bg-blue-500 scale-110' 
                        : 'bg-white/20 hover:bg-white/30'
                    }`}
                  >
                    {avatar.emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme Selection */}
            <div>
              <h4 className="text-white font-semibold mb-2">Choose Theme:</h4>
              <div className="grid grid-cols-2 gap-2">
                {colorThemes.map((theme, index) => (
                  <button
                    key={index}
                    onClick={() => setPlayer1Theme(index)}
                    className={`p-3 rounded-lg text-white font-semibold transition-all ${
                      player1Theme === index 
                        ? 'ring-2 ring-white scale-105' 
                        : ''
                    } bg-gradient-to-r ${theme.bgGradient}`}
                  >
                    {theme.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Player 2 Customization */}
          <div className="bg-white/10 rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4 text-center">Player 2</h3>
            
            {/* Preview */}
            <div className="mb-6 flex justify-center">
              <div className={`p-4 rounded-xl border-4 ${colorThemes[player2Theme].borderColor} bg-gradient-to-br ${colorThemes[player2Theme].bgGradient}`}>
                <div className="text-4xl text-center mb-2">{avatarOptions[player2Avatar].emoji}</div>
                <div className="text-white font-bold text-center">{avatarOptions[player2Avatar].name}</div>
              </div>
            </div>

            {/* Avatar Selection */}
            <div className="mb-4">
              <h4 className="text-white font-semibold mb-2">Choose Avatar:</h4>
              <div className="grid grid-cols-5 gap-2">
                {avatarOptions.map((avatar, index) => (
                  <button
                    key={index}
                    onClick={() => setPlayer2Avatar(index)}
                    className={`p-3 text-2xl rounded-lg transition-all ${
                      player2Avatar === index 
                        ? 'bg-red-500 scale-110' 
                        : 'bg-white/20 hover:bg-white/30'
                    }`}
                  >
                    {avatar.emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme Selection */}
            <div>
              <h4 className="text-white font-semibold mb-2">Choose Theme:</h4>
              <div className="grid grid-cols-2 gap-2">
                {colorThemes.map((theme, index) => (
                  <button
                    key={index}
                    onClick={() => setPlayer2Theme(index)}
                    className={`p-3 rounded-lg text-white font-semibold transition-all ${
                      player2Theme === index 
                        ? 'ring-2 ring-white scale-105' 
                        : ''
                    } bg-gradient-to-r ${theme.bgGradient}`}
                  >
                    {theme.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center space-x-4 mt-8">
          <button
            onClick={handleSave}
            className="px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold shadow-xl transform transition-all duration-200 hover:scale-105"
          >
            ✅ Apply Changes
          </button>
          <button
            onClick={onClose}
            className="px-8 py-3 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-xl font-bold shadow-xl transform transition-all duration-200 hover:scale-105"
          >
            ❌ Cancel
          </button>
        </div>
      </div>
    </div>
  );
}