"use client";

import { useAui, useAuiEvent, useAuiState } from "@assistant-ui/react";
import { Loader2Icon, MicIcon, SquareIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  speechRecognitionSupported,
  useLiveVoiceStore,
} from "@/lib/live-voice-store";

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    [index: number]: SpeechRecognitionResult;
  };
}

interface SpeechRecognitionHandle {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

const createRecognition = (): SpeechRecognitionHandle | null => {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionHandle;
    webkitSpeechRecognition?: new () => SpeechRecognitionHandle;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.lang = navigator.language || "en-US";
  return rec;
};

export const LiveVoiceOverlay = () => {
  const aui = useAui();
  const live = useLiveVoiceStore((s) => s.live);
  const status = useLiveVoiceStore((s) => s.status);
  const transcript = useLiveVoiceStore((s) => s.transcript);
  const error = useLiveVoiceStore((s) => s.error);
  const setLive = useLiveVoiceStore((s) => s.setLive);
  const setStatus = useLiveVoiceStore((s) => s.setStatus);
  const setTranscript = useLiveVoiceStore((s) => s.setTranscript);
  const setError = useLiveVoiceStore((s) => s.setError);

  const isRunning = useAuiState(({ thread }) => thread.isRunning);
  const speechMessageId = useAuiState(({ thread }) => thread.speech?.messageId);

  const liveRef = useRef(live);
  const busyRef = useRef(false);
  const recRef = useRef<SpeechRecognitionHandle | null>(null);
  const transcriptRef = useRef("");

  liveRef.current = live;

  useEffect(() => {
    busyRef.current =
      isRunning ||
      speechMessageId !== undefined ||
      aui.thread().getState().speech !== undefined;
  }, [isRunning, speechMessageId, aui]);

  const stopRec = () => {
    const rec = recRef.current;
    recRef.current = null;
    if (!rec) return;
    try {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.stop();
    } catch {
      /* ignore */
    }
  };

  const startRec = () => {
    if (recRef.current) return;
    if (!speechRecognitionSupported()) {
      setError(
        "Voice conversation is not supported in this browser. Use Chrome or Edge.",
      );
      setLive(false);
      return;
    }
    if (busyRef.current || !liveRef.current) return;
    const rec = createRecognition();
    if (!rec) return;

    const handleResult = (event: SpeechRecognitionEventLike) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          transcriptRef.current +=
            (transcriptRef.current ? " " : "") + text.trim();
        } else {
          interim += text;
        }
      }
      const draft =
        `${transcriptRef.current}${interim ? ` ${interim}` : ""}`.trim();
      if (draft) setTranscript(draft);
    };

    const handleEnd = () => {
      recRef.current = null;
      const text = transcriptRef.current.trim();
      transcriptRef.current = "";
      setTranscript("");
      if (!text) return;
      if (!liveRef.current || busyRef.current) return;
      setStatus("thinking");
      try {
        aui.composer().setText(text);
        aui.composer().send();
      } catch {
        /* ignore */
      }
    };

    rec.onresult = handleResult;
    rec.onerror = (event) => {
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        setError("Microphone access was denied.");
        setLive(false);
      }
    };
    rec.onend = handleEnd;

    try {
      rec.start();
      recRef.current = rec;
      setStatus("listening");
    } catch {
      recRef.current = null;
    }
  };

  useEffect(() => {
    if (!live) return;
    setStatus("listening");
    const iv = setInterval(() => {
      if (!liveRef.current) return;
      if (busyRef.current) {
        stopRec();
        return;
      }
      if (!recRef.current) startRec();
    }, 400);
    return () => {
      clearInterval(iv);
      stopRec();
    };
  }, [live, setStatus]);

  useAuiEvent("thread.runEnd", () => {
    if (!liveRef.current) return;
    const { messages } = aui.thread().getState();
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role !== "assistant") continue;
      const hasText = message.content.some(
        (part) => part.type === "text" && part.text.trim().length > 0,
      );
      if (!hasText) continue;
      setStatus("speaking");
      try {
        aui.thread().message({ id: message.id }).speak();
      } catch {
        /* ignore */
      }
      return;
    }
  });

  useEffect(() => {
    if (!live) {
      const state = aui.thread().getState();
      if (state.speech) {
        try {
          aui.thread().stopSpeaking();
        } catch {
          /* ignore */
        }
      }
    }
  }, [live, aui]);

  useEffect(() => {
    if (!live) {
      setStatus("idle");
      setTranscript("");
    }
  }, [live, setStatus, setTranscript]);

  if (!live) return null;

  const statusLabel =
    status === "listening"
      ? "Listening…"
      : status === "thinking"
        ? "Thinking…"
        : status === "speaking"
          ? "Speaking…"
          : "…";

  const statusIcon =
    status === "thinking" ? (
      <Loader2Icon className="size-4 animate-spin text-amber-500" />
    ) : status === "speaking" ? (
      <MicIcon className="size-4 text-sky-500" />
    ) : (
      <span className="relative flex size-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
      </span>
    );

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-full items-center gap-3 rounded-full border bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur">
        {statusIcon}
        <span className="font-medium text-sm">{statusLabel}</span>
        {transcript && (
          <span className="max-w-[16rem] truncate text-muted-foreground text-sm italic">
            {transcript}
          </span>
        )}
        {error && (
          <span className="max-w-[14rem] truncate text-destructive text-sm">
            {error}
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 rounded-full"
          aria-label="End voice conversation"
          onClick={() => setLive(false)}
        >
          <SquareIcon className="size-3 fill-current" />
        </Button>
      </div>
    </div>
  );
};
