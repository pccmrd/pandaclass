import React, { useRef, useEffect, useState } from 'react';

interface WritingCanvasProps {
  targetCharacter: string;
  onCheck: (base64: string) => void;
  isChecking: boolean;
}

const WritingCanvas: React.FC<WritingCanvasProps> = ({ targetCharacter, onCheck, isChecking }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Set resolution
    canvas.width = 400;
    canvas.height = 400;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1e293b'; // Slate-800
      ctx.lineWidth = 12;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawGrid(ctx, canvas.width, canvas.height);
    }
  }, [targetCharacter]);

  const drawGrid = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.save();
    ctx.strokeStyle = '#e2e8f0'; // Light grid
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    
    // Cross
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Diagonals
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, h);
    ctx.moveTo(w, 0);
    ctx.lineTo(0, h);
    ctx.stroke();
    ctx.restore();
  };

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    
    // Scale for canvas resolution vs display size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const pos = getPos(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault(); // Prevent scrolling on touch
    const ctx = canvasRef.current?.getContext('2d');
    const pos = getPos(e);
    if (ctx) {
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) ctx.closePath();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            drawGrid(ctx, canvas.width, canvas.height);
        }
    }
  };

  const handleCheck = () => {
    if (canvasRef.current) {
        onCheck(canvasRef.current.toDataURL('image/png'));
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative bg-white p-2 rounded-xl shadow-inner border border-slate-200" ref={containerRef}>
        {/* Ghost character for reference (optional, currently just showing character above) */}
        <canvas
          ref={canvasRef}
          className="w-[300px] h-[300px] sm:w-[400px] sm:h-[400px] cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        <div className="absolute top-2 left-2 text-6xl opacity-10 pointer-events-none font-serif select-none">
            {targetCharacter}
        </div>
      </div>

      <div className="flex gap-4">
        <button 
            onClick={clearCanvas}
            className="px-6 py-2 rounded-full bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 transition"
        >
            Clear
        </button>
        <button 
            onClick={handleCheck}
            disabled={isChecking}
            className={`px-8 py-2 rounded-full font-bold text-white shadow-lg transition flex items-center gap-2
                ${isChecking ? 'bg-indigo-400 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-105'}
            `}
        >
            {isChecking ? (
                <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Checking...
                </>
            ) : (
                'Submit'
            )}
        </button>
      </div>
    </div>
  );
};

export default WritingCanvas;
