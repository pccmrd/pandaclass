export enum ClassMode {
  LOBBY = 'LOBBY',
  SPEAKING = 'SPEAKING',
  WRITING = 'WRITING',
  READING = 'READING',
}

export interface User {
  id: string;
  name: string;
  isSelf: boolean;
  avatarUrl?: string;
  level: number;
  xp: number;
  stream?: MediaStream; // For video feed
  peerId?: string;      // WebRTC Peer ID
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface Achievement {
  id: string;
  title: string;
  icon: string;
  unlocked: boolean;
  description: string;
}

export type AudioConfig = {
  sampleRate: number;
};

export interface WritingFeedback {
  score: number;
  feedback: string;
  corrected: boolean;
}