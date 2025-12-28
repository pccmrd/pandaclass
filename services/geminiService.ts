import { GoogleGenAI, LiveServerMessage, Modality, Type, Blob } from "@google/genai";

// Helper to safely get API Key without crashing if process is missing
const getApiKey = () => {
  try {
    return process.env.API_KEY || (window as any).process?.env?.API_KEY;
  } catch (e) {
    return undefined;
  }
};

// Standard GenAI instance for non-streaming tasks (Vision/Writing check)
export const createGenAIClient = () => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API_KEY is missing");
  return new GoogleGenAI({ apiKey });
};

// --- TTS Utility ---
export const generateSpeech = async (text: string): Promise<Uint8Array | null> => {
    try {
        const ai = createGenAIClient();
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: { parts: [{ text }] },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
                },
            },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) return null;

        // Decode base64 to Uint8Array (Raw PCM)
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    } catch (e) {
        console.error("TTS Error", e);
        return null;
    }
};

// --- Live API Utilities ---

// Tool Definitions
const toolsDef = [
  {
    functionDeclarations: [
      {
        name: 'grantXP',
        description: 'Award XP to the student. Use this when they pronounce correctly, answer a question right, or complete a task.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            amount: { type: Type.NUMBER, description: 'Amount of XP (e.g. 10 for simple, 50 for hard)' },
          },
          required: ['amount']
        }
      },
      {
        name: 'setTopic',
        description: 'Change the current practice phrase on the screen. Use this to move to the next exercise.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            chinese: { type: Type.STRING, description: 'The Chinese characters to display' },
            english: { type: Type.STRING, description: 'English translation' },
            pinyin: { type: Type.STRING, description: 'Pinyin pronunciation guide' },
          },
          required: ['chinese', 'english', 'pinyin']
        }
      }
    ]
  }
];

export const getLiveStreamConfig = (systemInstruction: string) => ({
  model: 'gemini-2.5-flash-native-audio-preview-09-2025',
  config: {
    responseModalities: [Modality.AUDIO],
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
    },
    systemInstruction: systemInstruction + " You have control over the app. If the student does well, call `grantXP`. When you want to teach a new phrase, call `setTopic` to update their screen.",
    inputAudioTranscription: {}, 
    outputAudioTranscription: {},
    tools: toolsDef
  },
});

// Audio Encoding/Decoding Utilities for Live API

export function float32ToPCM16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16;
}

export function downsampleTo16k(buffer: Float32Array, sampleRate: number): Float32Array {
  if (sampleRate === 16000) return buffer;
  const ratio = sampleRate / 16000;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    result[i] = buffer[Math.round(i * ratio)];
  }
  return result;
}

export function createBlob(data: Float32Array): Blob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    const uint8 = new Uint8Array(int16.buffer);
    let binary = '';
    const len = uint8.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const b64 = btoa(binary);

    return {
      data: b64,
      mimeType: 'audio/pcm;rate=16000',
    };
}

export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}


// --- Static Content Generation (Writing Feedback) ---

export const evaluateHandwriting = async (base64Image: string, character: string): Promise<{score: number, feedback: string}> => {
    try {
        const ai = createGenAIClient();
        
        // Clean base64 string if it has prefix
        const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");

        const prompt = `I am a beginner learning Chinese. I tried to write the character "${character}". 
        Please evaluate my handwriting.
        1. Give a score from 0 to 100 based on accuracy and balance.
        2. Provide short, encouraging feedback on what stroke I might have missed or proportion issues.
        3. Return ONLY a JSON object: { "score": number, "feedback": "string" }`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: {
                parts: [
                    { inlineData: { mimeType: "image/png", data: cleanBase64 } },
                    { text: prompt }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    score: { type: Type.NUMBER },
                    feedback: { type: Type.STRING }
                  }
                }
            }
        });

        const text = response.text;
        if (!text) return { score: 0, feedback: "Could not analyze." };
        return JSON.parse(text);
    } catch (e) {
        console.error("Evaluation error", e);
        return { score: 0, feedback: "Error connecting to AI teacher." };
    }
}