import React from 'react';

interface AIOverlayProps {
  isActive: boolean;
  isSpeaking: boolean;
  volume: number; // 0 to 1
  transcript?: string;
}

const AIOverlay: React.FC<AIOverlayProps> = ({ isActive, isSpeaking, volume, transcript }) => {
  return (
    <div className="flex flex-col items-center justify-center p-6 bg-gradient-to-br from-indigo-900 to-slate-900 rounded-2xl shadow-xl border border-indigo-500/30 w-full min-h-[300px] relative overflow-hidden">
      
      {/* Background Decor */}
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/chinese-pattern.png')] opacity-10"></div>
      
      {/* Avatar Circle */}
      <div className={`relative w-32 h-32 rounded-full flex items-center justify-center mb-6 transition-all duration-300 ${isSpeaking ? 'scale-110 shadow-[0_0_40px_rgba(99,102,241,0.6)]' : 'shadow-lg'}`}>
        <div className="absolute inset-0 bg-indigo-600 rounded-full opacity-20 animate-pulse"></div>
        <div 
            className="absolute inset-0 bg-indigo-500 rounded-full opacity-30 transition-transform duration-75"
            style={{ transform: `scale(${1 + volume * 0.5})` }}
        ></div>
        <img 
            src="https://api.dicebear.com/7.x/bottts/svg?seed=PandaTeacher&backgroundColor=transparent" 
            alt="AI Teacher" 
            className="w-28 h-28 z-10 drop-shadow-lg"
        />
        
        {/* Status Badge */}
        <div className={`absolute -bottom-2 px-3 py-1 rounded-full text-xs font-bold border-2 border-slate-900 z-20 ${isActive ? 'bg-green-500 text-white' : 'bg-slate-500 text-slate-200'}`}>
            {isActive ? (isSpeaking ? 'Talking...' : 'Listening...') : 'Offline'}
        </div>
      </div>

      {/* Transcript / Instructions */}
      <div className="z-10 text-center max-w-lg">
          <h2 className="text-indigo-100 font-bold text-xl mb-2">Teacher Wei</h2>
          <p className={`text-lg font-medium transition-all duration-500 ${transcript ? 'text-white' : 'text-slate-400 italic'}`}>
            {transcript || "Waiting for teacher..."}
          </p>
      </div>

      {/* Audio Visualizer Bars */}
      <div className="absolute bottom-0 left-0 right-0 h-16 flex items-end justify-center gap-1 pb-4 opacity-50">
        {[...Array(20)].map((_, i) => (
             <div 
                key={i}
                className="w-1 bg-indigo-400 rounded-t-sm transition-all duration-75"
                style={{ 
                    height: isSpeaking ? `${Math.max(10, Math.random() * 100 * volume)}%` : '10%' 
                }}
             />
        ))}
      </div>
    </div>
  );
};

export default AIOverlay;
