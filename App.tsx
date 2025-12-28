import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import { User, ClassMode, ChatMessage, Achievement } from './types';
import VideoFeed from './components/VideoFeed';
import WritingCanvas from './components/WritingCanvas';
import AIOverlay from './components/AIOverlay';
import KaraokeText from './components/KaraokeText';
import Lobby from './components/Lobby';
import Chat from './components/Chat';
import AudioVisualizer from './components/AudioVisualizer';
import { getLiveStreamConfig, createBlob, evaluateHandwriting, decode, decodeAudioData, downsampleTo16k } from './services/geminiService';

// Constants
const SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

const INITIAL_ACHIEVEMENTS: Achievement[] = [
  { id: 'a1', title: 'First Words', icon: '🗣️', unlocked: false, description: 'Speak your first phrase correctly.' },
  { id: 'a2', title: 'Calligrapher', icon: '✍️', unlocked: false, description: 'Score 80+ on a writing task.' },
  { id: 'a3', title: 'Good Listener', icon: '👂', unlocked: false, description: 'Complete a listening exercise.' },
];

const App: React.FC = () => {
  // State
  const [mode, setMode] = useState<ClassMode>(ClassMode.LOBBY);
  const [localUser, setLocalUser] = useState<User>({ id: 'me', name: 'Student', isSelf: true, level: 1, xp: 0 });
  const [remoteUsers, setRemoteUsers] = useState<User[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false); // To AI
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [aiVolume, setAiVolume] = useState(0);
  const [transcript, setTranscript] = useState<string>('');
  const [achievements, setAchievements] = useState<Achievement[]>(INITIAL_ACHIEVEMENTS);
  const [targetChar, setTargetChar] = useState('永');
  const [feedback, setFeedback] = useState<{score: number, feedback: string} | null>(null);
  const [isCheckingWriting, setIsCheckingWriting] = useState(false);
  const [micActive, setMicActive] = useState(true);
  const [roomID, setRoomID] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  
  // Topic State (AI Controlled)
  const [currentTopic, setCurrentTopic] = useState({
    chinese: "你好！我叫...",
    english: "Hello! My name is...",
    pinyin: "Nǐ hǎo! Wǒ jiào..."
  });
  
  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<any>(null);
  const dataConnectionsRef = useRef<any[]>([]); 
  const isConnectedRef = useRef(false); // Ref to track connection status in closures

  // Initialize Audio Contexts
  const initAudio = useCallback(() => {
    try {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });
        }
        if (!inputContextRef.current) {
            inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE });
        }
        // Resume if suspended (common in browsers)
        if (audioContextRef.current?.state === 'suspended') {
            audioContextRef.current.resume();
        }
        if (inputContextRef.current?.state === 'suspended') {
            inputContextRef.current.resume();
        }
    } catch (e) {
        console.error("Audio Context Init Failed", e);
    }
  }, []);

  // Sync ref with state
  useEffect(() => {
      isConnectedRef.current = isConnected;
  }, [isConnected]);

  // --- Chat Helper ---
  const addMessage = (text: string, senderId: string, isSystem = false) => {
    const newMsg: ChatMessage = {
      id: Math.random().toString(36).substr(2, 9),
      senderId,
      text,
      timestamp: Date.now(),
      isSystem
    };
    setMessages(prev => [...prev, newMsg]);
    return newMsg;
  };

  const broadcastMessage = (text: string) => {
    const msg = addMessage(text, localUser.id);
    // Send to all connected peers
    dataConnectionsRef.current.forEach(conn => {
      if(conn.open) {
        conn.send({ type: 'CHAT', payload: msg });
      }
    });
  };

  // --- Multiplayer Logic (PeerJS) ---
  const initPeer = async (stream: MediaStream, userRoomId?: string) => {
    if (peerRef.current) return;

    const Peer = (window as any).Peer;
    if (!Peer) {
        console.error("PeerJS not loaded");
        return;
    }

    try {
        const peer = new Peer();
        peerRef.current = peer;

        peer.on('open', (id: string) => {
            console.log('My Peer ID is: ' + id);
            setRoomID(id); 
            setLocalUser(prev => ({...prev, peerId: id}));
            
            if (userRoomId) {
                // Call host (Media)
                const call = peer.call(userRoomId, stream, {
                    metadata: { name: localUser.name, level: localUser.level }
                });
                setupCallEventHandlers(call);

                // Connect host (Data)
                const conn = peer.connect(userRoomId, {
                  metadata: { name: localUser.name }
                });
                setupDataConnection(conn);
            } else {
                // Host Mode
                const url = new URL(window.location.href);
                url.searchParams.set('room', id);
                window.history.pushState({}, '', url.toString());
            }
        });

        // Handle incoming Media calls
        peer.on('call', (call: any) => {
            console.log("Receiving call from", call.peer);
            call.answer(stream); 
            setupCallEventHandlers(call);
        });

        // Handle incoming Data connections
        peer.on('connection', (conn: any) => {
            console.log("Receiving connection from", conn.peer);
            setupDataConnection(conn);
        });

    } catch (e) {
        console.error("PeerJS init error", e);
    }
  };

  const setupCallEventHandlers = (call: any) => {
      call.on('stream', (remoteStream: MediaStream) => {
          console.log("Received remote stream from", call.peer);
          setRemoteUsers(prev => {
              // Avoid duplicates
              if (prev.find(u => u.peerId === call.peer)) return prev;
              
              const newUser: User = {
                  id: call.peer,
                  name: call.metadata?.name || 'Classmate',
                  isSelf: false,
                  level: call.metadata?.level || 1,
                  xp: 0,
                  avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${call.peer}`,
                  stream: remoteStream,
                  peerId: call.peer
              };
              
              addMessage(`${newUser.name} joined the class.`, 'system', true);
              return [...prev, newUser];
          });
      });
      
      call.on('close', () => {
          console.log("Call closed", call.peer);
          setRemoteUsers(prev => prev.filter(u => u.peerId !== call.peer));
      });
      
      call.on('error', (err: any) => console.error("Call error", err));
  };

  const setupDataConnection = (conn: any) => {
    conn.on('open', () => {
      dataConnectionsRef.current.push(conn);
    });

    conn.on('data', (data: any) => {
      if (data.type === 'CHAT') {
        setMessages(prev => [...prev, data.payload]);
      }
    });

    conn.on('close', () => {
      dataConnectionsRef.current = dataConnectionsRef.current.filter(c => c !== conn);
    });
  };

  // --- AI Logic ---
  const disconnectAI = async () => {
      if (sessionPromiseRef.current) {
          const session = await sessionPromiseRef.current;
          try { (session as any).close?.(); } catch(e) {}
      }
      if (processorRef.current) {
          processorRef.current.disconnect();
          processorRef.current = null;
      }
      setIsConnected(false);
      setTranscript("Teacher disconnected.");
  };

  const connectAI = async () => {
    try {
        initAudio();
        
        let apiKey;
        try { apiKey = process.env.API_KEY || (window as any).process?.env?.API_KEY; } catch (e) {}
        if (!apiKey) return alert("API Key missing! Cannot start class.");

        // Clean up previous if any
        await disconnectAI();

        const ai = new GoogleGenAI({ apiKey });
        const config = getLiveStreamConfig(`You are Teacher Wei, a friendly Chinese teacher. The user is ${localUser.name}. Engage with them simply.`);

        let stream = streamRef.current;
        if (!stream) {
            // Fallback if stream lost
             stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
             streamRef.current = stream;
        }

        setTranscript("Connecting to Teacher...");
        
        sessionPromiseRef.current = ai.live.connect({
            model: config.model,
            config: config.config,
            callbacks: {
                onopen: () => {
                    setIsConnected(true);
                    setTranscript("Teacher joined.");
                    addMessage("Teacher joined the class.", 'system', true);
                    
                    if (inputContextRef.current && stream) {
                        // Ensure context is running for input processing
                        if (inputContextRef.current.state === 'suspended') {
                            inputContextRef.current.resume();
                        }
                        
                        const source = inputContextRef.current.createMediaStreamSource(stream);
                        const processor = inputContextRef.current.createScriptProcessor(4096, 1, 1);
                        processorRef.current = processor;
                        
                        processor.onaudioprocess = (e) => {
                            // Fix: Use Ref instead of state variable in closure to ensure fresh value
                            if (!isConnectedRef.current) return; 
                            
                            const track = stream!.getAudioTracks()[0];
                            if (track && !track.enabled) return;
                            
                            let inputData = e.inputBuffer.getChannelData(0);
                            
                            // Downsample if necessary (e.g. 48k -> 16k)
                            if (inputContextRef.current && inputContextRef.current.sampleRate !== SAMPLE_RATE) {
                                inputData = downsampleTo16k(inputData, inputContextRef.current.sampleRate);
                            }

                            sessionPromiseRef.current?.then((session) => session.sendRealtimeInput({ media: createBlob(inputData) }));
                        };
                        
                        source.connect(processor);
                        processor.connect(inputContextRef.current.destination);
                    }
                },
                onmessage: async (msg: any) => {
                     // 1. Handle Tools (Function Calling)
                     if (msg.toolCall) {
                         const responses = [];
                         for (const fc of msg.toolCall.functionCalls) {
                             if (fc.name === 'grantXP') {
                                 const amount = Number(fc.args.amount);
                                 if (!isNaN(amount)) {
                                    setLocalUser(prev => {
                                        const newXp = prev.xp + amount;
                                        addMessage(`Teacher granted you ${amount} XP! Total: ${newXp}`, 'teacher');
                                        return {...prev, xp: newXp};
                                    });
                                    // Also unlock achievement if relevant?
                                    if (amount >= 50) unlockAchievement('a1');
                                 }
                                 responses.push({
                                     id: fc.id,
                                     name: fc.name,
                                     response: { result: "XP granted" }
                                 });
                             } else if (fc.name === 'setTopic') {
                                 setCurrentTopic({
                                     chinese: fc.args.chinese,
                                     english: fc.args.english,
                                     pinyin: fc.args.pinyin
                                 });
                                 responses.push({
                                     id: fc.id,
                                     name: fc.name,
                                     response: { result: "Topic updated on screen" }
                                 });
                             }
                         }
                         // Send tool response back to model
                         sessionPromiseRef.current?.then(session => session.sendToolResponse({ functionResponses: responses }));
                     }

                     // 2. Handle Audio Output
                     const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                     if (audioData && audioContextRef.current) {
                         setAiSpeaking(true);
                         setAiVolume(Math.random()); 
                         const ctx = audioContextRef.current;
                         const buffer = await decodeAudioData(decode(audioData), ctx, OUTPUT_SAMPLE_RATE);
                         const source = ctx.createBufferSource();
                         source.buffer = buffer;
                         source.connect(ctx.destination);
                         const now = ctx.currentTime;
                         nextStartTimeRef.current = Math.max(nextStartTimeRef.current, now);
                         source.start(nextStartTimeRef.current);
                         nextStartTimeRef.current += buffer.duration;
                         sourcesRef.current.add(source);
                         source.onended = () => {
                             sourcesRef.current.delete(source);
                             if (sourcesRef.current.size === 0) {
                                 setAiSpeaking(false);
                                 setAiVolume(0);
                             }
                         };
                     }
                     
                     // 3. Handle Transcripts
                     if (msg.serverContent?.outputTranscription?.text) {
                         const text = msg.serverContent.outputTranscription.text;
                         setTranscript(text);
                     }
                },
                onclose: () => {
                    setIsConnected(false);
                    setTranscript("Teacher left.");
                },
                onerror: (e) => console.error(e)
            }
        });

    } catch (err) {
        console.error("Setup failed", err);
        alert("Failed to connect AI.");
        setIsConnected(false);
    }
  };


  const handleMicToggle = () => {
      if (streamRef.current) {
          const track = streamRef.current.getAudioTracks()[0];
          if (track) {
              track.enabled = !track.enabled;
              setMicActive(track.enabled);
          }
      }
  };

  const handleStartClass = async (targetRoomId?: string) => {
      // 1. Get Local Stream First
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
          setLocalStream(stream);
          streamRef.current = stream;
          
          // 2. Init Peer
          await initPeer(stream, targetRoomId);
          
          // 3. Connect AI
          connectAI();

          setMode(ClassMode.SPEAKING);
      } catch (e) {
          alert("Camera/Microphone access denied. Please allow access to start class.");
      }
  };

  const handleWritingCheck = async (base64: string) => {
      setIsCheckingWriting(true);
      const res = await evaluateHandwriting(base64, targetChar);
      setFeedback(res);
      setIsCheckingWriting(false);
      if (res.score > 80) {
          unlockAchievement('a2');
          setLocalUser(u => ({ ...u, xp: u.xp + 50 }));
      }
  };

  const unlockAchievement = (id: string) => {
      setAchievements(prev => prev.map(a => a.id === id && !a.unlocked ? { ...a, unlocked: true } : a));
  };

  // Render Lobby
  if (mode === ClassMode.LOBBY) {
      return (
          <Lobby 
            userName={localUser.name}
            onNameChange={(name) => setLocalUser({...localUser, name})}
            onStart={handleStartClass}
          />
      );
  }

  // Render Classroom
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col lg:flex-row overflow-hidden">
        
        {/* Sidebar */}
        <aside className="w-full lg:w-80 bg-slate-800 border-r border-slate-700 flex flex-col h-[30vh] lg:h-screen z-20 shadow-xl">
            <div className="p-6 border-b border-slate-700">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-indigo-500 flex items-center justify-center text-xl font-bold">
                        {localUser.name[0]}
                    </div>
                    <div>
                        <h2 className="font-bold text-lg">{localUser.name}</h2>
                        <div className="text-xs text-indigo-300 flex items-center gap-1">
                            <span>Level {localUser.level}</span>
                            <span className="w-1 h-1 bg-white rounded-full"></span>
                            <span className="font-bold text-yellow-400 animate-pulse">{localUser.xp} XP</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Achievements */}
            <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Achievements</h3>
                <div className="space-y-3">
                    {achievements.map(ach => (
                        <div key={ach.id} className={`p-3 rounded-lg border ${ach.unlocked ? 'bg-indigo-900/30 border-indigo-500/50' : 'bg-slate-800 border-slate-700 opacity-50'} flex items-center gap-3 transition-all`}>
                            <div className="text-2xl">{ach.icon}</div>
                            <div>
                                <h4 className={`font-bold text-sm ${ach.unlocked ? 'text-indigo-200' : 'text-slate-400'}`}>{ach.title}</h4>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            
            {/* Classmates Grid (WebRTC) */}
            <div className="p-4 bg-slate-900 border-t border-slate-700">
                 <div className="mb-3">
                     <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex justify-between items-center">
                        Classmates
                     </h3>
                     {/* Room ID Display */}
                     {roomID && (
                         <div className="bg-indigo-900/50 p-2 rounded border border-indigo-500/30 mb-2">
                             <div className="text-[10px] text-indigo-300 mb-1">ROOM ID (Share this):</div>
                             <div className="flex justify-between items-center gap-2">
                                 <code className="text-xs font-mono text-white truncate w-24">{roomID}</code>
                                 <button 
                                     onClick={() => navigator.clipboard.writeText(roomID)}
                                     className="text-xs bg-indigo-600 hover:bg-indigo-500 px-2 py-1 rounded text-white"
                                 >
                                     Copy
                                 </button>
                             </div>
                         </div>
                     )}
                 </div>

                 <div className="grid grid-cols-2 gap-2">
                     <div className="aspect-square">
                        <VideoFeed user={localUser} stream={localStream} isMuted={true} />
                     </div>
                     {remoteUsers.map(u => (
                         <div key={u.id} className="aspect-square">
                             <VideoFeed user={u} stream={u.stream} />
                         </div>
                     ))}
                     {remoteUsers.length === 0 && (
                         <div className="aspect-square bg-slate-800 rounded-lg border border-slate-700 border-dashed flex items-center justify-center text-slate-600 text-xs text-center p-2">
                             Waiting for classmates...
                         </div>
                     )}
                 </div>
            </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col h-[70vh] lg:h-screen relative">
            
            {/* Top Bar */}
            <header className="h-16 border-b border-slate-700 flex items-center justify-between px-6 bg-slate-800/50 backdrop-blur-md z-10">
                <div className="flex bg-slate-700 rounded-lg p-1">
                    {[ClassMode.SPEAKING, ClassMode.WRITING, ClassMode.READING].map(m => (
                        <button 
                            key={m}
                            onClick={() => { setMode(m); setFeedback(null); }}
                            className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${mode === m ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                        >
                            {m}
                        </button>
                    ))}
                </div>
                
                <div className="flex items-center gap-4">
                     {/* AI Controls */}
                     <div className="flex items-center gap-2 mr-4 bg-slate-700/50 rounded-full p-1 px-3 border border-slate-600">
                         <span className="text-xs font-bold text-slate-400 uppercase mr-1">Teacher</span>
                         <button 
                            onClick={isConnected ? disconnectAI : connectAI}
                            className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-red-500'}`}
                            title={isConnected ? "Disconnect Teacher" : "Connect Teacher"}
                         />
                     </div>

                     <button 
                        onClick={handleMicToggle}
                        className={`p-2 rounded-full transition-colors ${micActive ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-red-500 text-white animate-pulse'}`}
                        title="Toggle Mic"
                     >
                         {micActive ? (
                             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                         ) : (
                             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                         )}
                     </button>
                     <button 
                        onClick={() => setIsChatOpen(!isChatOpen)}
                        className={`p-2 rounded-full transition-colors ${isChatOpen ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-white hover:bg-slate-600'}`}
                        title="Toggle Chat"
                     >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                     </button>
                </div>
            </header>

            {/* Dynamic Stage */}
            <div className="flex-1 overflow-y-auto p-4 lg:p-8 flex flex-col items-center gap-8 relative">
                
                {/* Teacher Area */}
                <div className="w-full max-w-4xl">
                    <AIOverlay 
                        isActive={isConnected} 
                        isSpeaking={aiSpeaking} 
                        volume={aiVolume}
                        transcript={transcript}
                    />
                </div>

                {/* Task Area */}
                <div className="w-full max-w-4xl flex-1 flex flex-col items-center justify-center min-h-[300px] bg-slate-800/50 rounded-2xl border border-slate-700/50 backdrop-blur-sm p-8">
                    
                    {mode === ClassMode.SPEAKING && (
                        <div className="text-center space-y-6 w-full flex flex-col items-center">
                            <h2 className="text-3xl font-bold text-white">Conversation Practice</h2>
                            <p className="text-slate-400 mb-4">Teacher Wei is listening. Practice this phrase:</p>
                            
                            <KaraokeText 
                                text={currentTopic.chinese} 
                                translation={currentTopic.english} 
                                audioContext={audioContextRef.current}
                            />
                            
                            {/* Pinyin Display */}
                            <div className="text-xl text-indigo-300 font-medium">
                                {currentTopic.pinyin}
                            </div>

                            {/* Visualizer for user input */}
                            <div className="w-full flex justify-center mt-2">
                                <AudioVisualizer stream={localStream} isActive={micActive} />
                            </div>
                        </div>
                    )}

                    {mode === ClassMode.WRITING && (
                        <div className="w-full flex flex-col items-center">
                            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                                Write: <span className="text-4xl font-serif text-yellow-400">{targetChar}</span>
                            </h2>
                            <div className="flex gap-8 flex-wrap justify-center">
                                <WritingCanvas 
                                    targetCharacter={targetChar} 
                                    onCheck={handleWritingCheck} 
                                    isChecking={isCheckingWriting}
                                />
                                {feedback && (
                                    <div className="w-full sm:w-64 bg-slate-800 p-4 rounded-xl border border-slate-600 animate-fade-in">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-slate-400 text-sm">Score</span>
                                            <span className={`text-2xl font-bold ${feedback.score > 80 ? 'text-green-400' : 'text-yellow-400'}`}>{feedback.score}</span>
                                        </div>
                                        <p className="text-sm text-slate-300">{feedback.feedback}</p>
                                        <button 
                                            onClick={() => {setFeedback(null); setTargetChar(prev => prev === '永' ? '人' : '永')}}
                                            className="mt-4 w-full py-2 bg-indigo-600 rounded-lg text-sm font-bold hover:bg-indigo-500"
                                        >
                                            Next Character
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {mode === ClassMode.READING && (
                        <div className="text-center max-w-2xl space-y-8 w-full flex flex-col items-center">
                             <h2 className="text-2xl font-bold">Read Aloud</h2>
                             
                             <KaraokeText 
                                text="人之初，性本善" 
                                translation="People at birth, are naturally good." 
                                audioContext={audioContextRef.current}
                             />

                            {/* Visualizer for user input */}
                             <div className="w-full flex justify-center mt-2">
                                <AudioVisualizer stream={localStream} isActive={micActive} />
                            </div>

                             <div className="text-xl text-slate-400">
                                 Rén zhī chū, xìng běn shàn
                             </div>
                             <button 
                                className="px-6 py-2 bg-slate-700 rounded-full hover:bg-slate-600 transition"
                                onClick={() => setTranscript("Excellent reading! The tones were very clear.")}
                             >
                                 Done Reading
                             </button>
                        </div>
                    )}

                </div>

                {/* Chat Float Panel */}
                {isChatOpen && (
                  <div className="absolute right-4 bottom-4 w-80 h-96 z-50 animate-fade-in-up">
                    <Chat 
                      messages={messages} 
                      currentUser={localUser} 
                      onSendMessage={broadcastMessage}
                    />
                  </div>
                )}
            </div>
        </main>
    </div>
  );
};

export default App;