import React, { useEffect, useRef } from 'react';
import { User } from '../types';

interface VideoFeedProps {
  user: User;
  stream?: MediaStream | null;
  isMuted?: boolean;
}

const VideoFeed: React.FC<VideoFeedProps> = ({ user, stream, isMuted }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative aspect-video bg-slate-800 rounded-lg overflow-hidden shadow-lg border-2 border-slate-700 transition-transform hover:scale-[1.02]">
      {/* Video Element - Render if stream exists, regardless of isSelf */}
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          muted={user.isSelf || isMuted} // Always mute self to prevent echo
          playsInline
          className={`w-full h-full object-cover ${user.isSelf ? 'transform scale-x-[-1]' : ''}`} 
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-700">
           <img 
            src={user.avatarUrl} 
            alt={user.name} 
            className="w-16 h-16 rounded-full mb-2 border-2 border-white/20"
           />
           {!user.isSelf && (
             <div className="flex space-x-1 items-center">
               <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
               <span className="text-slate-300 text-xs font-medium">Connecting...</span>
             </div>
           )}
        </div>
      )}

      {/* Overlay Info */}
      <div className="absolute bottom-2 left-2 right-2 flex justify-between items-end pointer-events-none">
        <div className="bg-black/60 backdrop-blur-sm px-2 py-1 rounded-md text-white text-xs font-medium flex items-center gap-2">
          <span>{user.name}</span>
          <span className="text-yellow-400 text-[10px]">Lv.{user.level}</span>
        </div>
        {isMuted && !user.isSelf && (
          <div className="bg-red-500/80 p-1 rounded-full">
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          </div>
        )}
      </div>

      {/* Live Indicator for Remote Users with Stream */}
      {stream && !user.isSelf && (
        <div className="absolute top-2 right-2 pointer-events-none">
           <div className="bg-red-500 px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-sm flex items-center gap-1">
             <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
             LIVE
           </div>
        </div>
      )}
    </div>
  );
};

export default VideoFeed;