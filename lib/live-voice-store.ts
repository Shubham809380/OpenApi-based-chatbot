import { create } from "zustand";

export type LiveVoiceStatus =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export type LiveVoiceState = {
  live: boolean;
  status: LiveVoiceStatus;
  transcript: string;
  error: string | null;
  setLive: (live: boolean) => void;
  setStatus: (status: LiveVoiceStatus) => void;
  setTranscript: (transcript: string) => void;
  setError: (error: string | null) => void;
};

export const useLiveVoiceStore = create<LiveVoiceState>((set) => ({
  live: false,
  status: "idle",
  transcript: "",
  error: null,
  setLive: (live) => set({ live, error: null }),
  setStatus: (status) => set({ status }),
  setTranscript: (transcript) => set({ transcript }),
  setError: (error) => set({ error }),
}));

export const speechRecognitionSupported = (): boolean => {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
};
