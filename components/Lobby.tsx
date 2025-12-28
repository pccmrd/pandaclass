import React, { useState, useEffect } from 'react';

interface LobbyProps {
  userName: string;
  onNameChange: (name: string) => void;
  onStart: (roomId?: string) => void;
}

const Lobby: React.FC<LobbyProps> = ({ userName, onNameChange, onStart }) => {
  const [lobbyTab, setLobbyTab] = useState<'create' | 'join'>('create');
  const [manualRoomId, setManualRoomId] = useState('');

  // Check if URL has room, if so, default to join tab
  useEffect(() => {
      if (new URLSearchParams(window.location.search).has('room')) {
          setLobbyTab('join');
      }
  }, []);

  const handleStartClick = () => {
      if (lobbyTab === 'join' && manualRoomId) {
          onStart(manualRoomId);
      } else {
          onStart();
      }
  };

  return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 relative overflow-hidden">
           {/* Background Blobs */}
           <div className="absolute inset-0 z-0">
               <div className="absolute top-0 left-0 w-64 h-64 bg-yellow-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
               <div className="absolute top-0 right-0 w-64 h-64 bg-red-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
               <div className="absolute -bottom-8 left-20 w-64 h-64 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>
           </div>

          <div className="z-10 bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full text-center border border-slate-100">
              <div className="mb-6 flex justify-center">
                <span className="text-6xl">🐼</span>
              </div>
              <h1 className="text-4xl font-bold text-slate-800 mb-2 font-serif">PandaClass AI</h1>
              <p className="text-slate-500 mb-6">Learn Chinese with friends & AI.</p>
              
              {/* Tab Switcher */}
              <div className="flex bg-slate-100 p-1 rounded-lg mb-6">
                  <button 
                    onClick={() => setLobbyTab('create')}
                    className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${lobbyTab === 'create' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                      Create Class
                  </button>
                  <button 
                    onClick={() => setLobbyTab('join')}
                    className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${lobbyTab === 'join' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                      Join Class
                  </button>
              </div>

              <div className="space-y-4">
                  <div className="text-left">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Your Name</label>
                      <input 
                        type="text" 
                        value={userName}
                        onChange={(e) => onNameChange(e.target.value)}
                        className="w-full px-4 py-2 rounded-md border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="Enter your name"
                      />
                  </div>

                  {lobbyTab === 'join' && (
                      <div className="text-left animate-fade-in">
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Room ID</label>
                          <input 
                            type="text" 
                            value={manualRoomId}
                            onChange={(e) => setManualRoomId(e.target.value)}
                            className="w-full px-4 py-2 rounded-md border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Paste Room ID here"
                          />
                          <p className="text-[10px] text-slate-400 mt-1">Ask your friend for their Room ID found in the sidebar.</p>
                      </div>
                  )}

                  <button 
                    onClick={handleStartClick}
                    disabled={!userName}
                    className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-indigo-700 hover:scale-[1.02] transition transform disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                      {lobbyTab === 'create' ? "Start New Class" : "Join Class"}
                  </button>
              </div>
          </div>
      </div>
  );
};

export default Lobby;