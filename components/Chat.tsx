import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, User } from '../types';

interface ChatProps {
  messages: ChatMessage[];
  currentUser: User;
  onSendMessage: (text: string) => void;
}

const Chat: React.FC<ChatProps> = ({ messages, currentUser, onSendMessage }) => {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;
    onSendMessage(input);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full bg-slate-800 rounded-xl overflow-hidden border border-slate-700 shadow-xl">
      <div className="bg-slate-900/50 p-3 border-b border-slate-700 font-bold text-sm text-slate-300 flex justify-between items-center">
        <span>Class Chat</span>
        <span className="text-xs bg-slate-700 px-2 py-0.5 rounded-full">{messages.length}</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {messages.map((msg) => {
           const isMe = msg.senderId === currentUser.id;
           const isSystem = msg.isSystem;
           const isTeacher = msg.senderId === 'teacher';
           
           if (isSystem) {
             return (
               <div key={msg.id} className="flex justify-center my-2">
                 <span className="text-xs text-slate-500 bg-slate-900/30 px-2 py-1 rounded">{msg.text}</span>
               </div>
             );
           }

           return (
             <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
               <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                 isTeacher 
                  ? 'bg-indigo-900/50 border border-indigo-500/30 text-indigo-100 rounded-tl-none'
                  : isMe 
                    ? 'bg-indigo-600 text-white rounded-br-none' 
                    : 'bg-slate-700 text-slate-200 rounded-bl-none'
               }`}>
                 {!isMe && !isTeacher && <div className="text-[10px] text-slate-400 font-bold mb-0.5 opacity-75">{msg.senderId}</div>}
                 {isTeacher && <div className="text-[10px] text-indigo-400 font-bold mb-0.5 flex items-center gap-1">🐼 Teacher Wei</div>}
                 <div>{msg.text}</div>
                 <div className="text-[9px] opacity-50 text-right mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                 </div>
               </div>
             </div>
           );
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSend} className="p-3 bg-slate-900/50 border-t border-slate-700 flex gap-2">
        <input 
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-slate-800 border border-slate-600 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
        />
        <button 
          type="submit"
          disabled={!input.trim()}
          className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  );
};

export default Chat;