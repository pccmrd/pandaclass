import React, { useState, useRef } from 'react';
import { generateSpeech, decodeAudioData } from '../services/geminiService';

interface KaraokeTextProps {
  text: string;
  translation: string;
  audioContext: AudioContext | null;
}

const KaraokeText: React.FC<KaraokeTextProps> = ({ text, translation, audioContext }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0 to 1
  const [isLoading, setIsLoading] = useState(false);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);

  const handlePlay = async () => {
    if (!audioContext) return;
    
    // Ensure context is running (fixes "doesn't pronounce" on some browsers)
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    
    // If already playing, stop
    if (isPlaying) {
        if (sourceRef.current) sourceRef.current.stop();
        cancelAnimationFrame(animationFrameRef.current);
        setIsPlaying(false);
        setProgress(0);
        return;
    }

    setIsLoading(true);

    try {
        // Fetch audio if not cached
        if (!audioBufferRef.current) {
            const pcmData = await generateSpeech(text);
            if (pcmData) {
                // Decode raw PCM using our helper, NOT audioContext.decodeAudioData
                // Gemini TTS returns 24kHz raw PCM mono
                audioBufferRef.current = await decodeAudioData(pcmData, audioContext, 24000);
            }
        }

        if (audioBufferRef.current) {
            const source = audioContext.createBufferSource();
            source.buffer = audioBufferRef.current;
            source.connect(audioContext.destination);
            
            source.onended = () => {
                setIsPlaying(false);
                setProgress(1);
                setTimeout(() => setProgress(0), 1000);
            };

            startTimeRef.current = audioContext.currentTime;
            source.start();
            sourceRef.current = source;
            setIsPlaying(true);
            
            // Animation Loop
            const duration = audioBufferRef.current.duration;
            const animate = () => {
                const elapsed = audioContext.currentTime - startTimeRef.current;
                const p = Math.min(1, elapsed / duration);
                setProgress(p);
                
                if (p < 1) {
                    animationFrameRef.current = requestAnimationFrame(animate);
                }
            };
            animate();
        }
    } catch (e) {
        console.error("Playback failed", e);
    } finally {
        setIsLoading(false);
    }
  };

  // Simple character index calculation based on progress
  const activeIndex = Math.floor(progress * text.length);

  return (
    <div className="flex flex-col items-center gap-4 p-6 bg-slate-800/50 rounded-xl border border-slate-700/50 backdrop-blur-sm w-full max-w-lg transition-all hover:bg-slate-800/70">
      <div className="flex items-center gap-4 w-full">
         <button 
            onClick={handlePlay}
            disabled={isLoading}
            className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-all ${isPlaying ? 'bg-red-500 text-white animate-pulse' : 'bg-indigo-600 text-white hover:bg-indigo-500 hover:scale-110 shadow-lg'}`}
         >
             {isLoading ? (
                 <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
             ) : isPlaying ? (
                 <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>
             ) : (
                 <svg className="w-6 h-6 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
             )}
         </button>
         
         <div className="text-center flex-1">
             <div className="text-3xl font-bold mb-1 flex flex-wrap justify-center gap-[2px]">
                 {text.split('').map((char, i) => (
                     <span 
                        key={i} 
                        className={`transition-colors duration-100 ${i <= activeIndex && isPlaying ? 'text-yellow-400 scale-110' : 'text-white'}`}
                     >
                         {char}
                     </span>
                 ))}
             </div>
             <p className="text-slate-400 text-sm">{translation}</p>
         </div>
      </div>
    </div>
  );
};

export default KaraokeText;