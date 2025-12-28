import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  stream: MediaStream | null;
  isActive: boolean;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ stream, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const requestRef = useRef<number>(0);

  useEffect(() => {
    if (!stream || !isActive || !canvasRef.current) return;

    try {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') ctx.resume();

        // Create Analyser
        if (!analyserRef.current) {
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64; // Low resolution for simple bars
            analyser.smoothingTimeConstant = 0.8;
            analyserRef.current = analyser;
        }

        // Connect Source
        if (sourceRef.current) {
            sourceRef.current.disconnect();
        }
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        sourceRef.current = source;

        const canvas = canvasRef.current;
        const canvasCtx = canvas.getContext('2d');
        const analyser = analyserRef.current;
        
        const draw = () => {
            if (!canvasCtx || !analyser) return;
            
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyser.getByteFrequencyData(dataArray);

            canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
            
            const barWidth = (canvas.width / bufferLength) * 2;
            let x = 0;

            for(let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * canvas.height;
                
                // Color gradient based on height/loudness
                const r = barHeight + 25 * (i/bufferLength);
                const g = 250 * (i/bufferLength);
                const b = 50;
                
                canvasCtx.fillStyle = `rgba(99, 102, 241, ${Math.max(0.3, barHeight/canvas.height)})`; 
                canvasCtx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
                
                x += barWidth;
            }

            requestRef.current = requestAnimationFrame(draw);
        };

        draw();
    } catch (e) {
        console.error("Visualizer Error", e);
    }

    return () => {
        cancelAnimationFrame(requestRef.current);
    };
  }, [stream, isActive]);

  return (
    <div className="w-full flex flex-col items-center">
        <canvas 
            ref={canvasRef} 
            width={300} 
            height={40} 
            className="w-full max-w-xs h-10 rounded bg-slate-800/50 border border-slate-700/50" 
        />
        <span className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Mic Input</span>
    </div>
  );
};

export default AudioVisualizer;