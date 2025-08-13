type Props = {
  isVisible: boolean;
};

export default function KeyboardIndicator({ isVisible }: Props) {
  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-slate-800/95 backdrop-blur rounded-xl p-4 border border-white/20 shadow-2xl z-50">
      <div className="text-white text-sm font-semibold mb-3 text-center">
        ⌨️ Keyboard Controls
      </div>
      
      <div className="grid grid-cols-3 gap-1 mb-3">
        <div></div>
        <div className="bg-slate-700 rounded px-2 py-1 text-center text-xs text-white font-mono">
          W
        </div>
        <div></div>
        
        <div className="bg-slate-700 rounded px-2 py-1 text-center text-xs text-white font-mono">
          A
        </div>
        <div className="bg-slate-700 rounded px-2 py-1 text-center text-xs text-white font-mono">
          S
        </div>
        <div className="bg-slate-700 rounded px-2 py-1 text-center text-xs text-white font-mono">
          D
        </div>
      </div>
      
      <div className="text-center text-xs text-white/70 mb-2">OR</div>
      
      <div className="grid grid-cols-3 gap-1">
        <div></div>
        <div className="bg-slate-700 rounded px-1 py-1 text-center text-xs text-white">
          ↑
        </div>
        <div></div>
        
        <div className="bg-slate-700 rounded px-1 py-1 text-center text-xs text-white">
          ←
        </div>
        <div className="bg-slate-700 rounded px-1 py-1 text-center text-xs text-white">
          ↓
        </div>
        <div className="bg-slate-700 rounded px-1 py-1 text-center text-xs text-white">
          →
        </div>
      </div>
    </div>
  );
}