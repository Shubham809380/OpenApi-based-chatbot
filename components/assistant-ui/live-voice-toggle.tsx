"use client";

import { MicIcon, MicOffIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  speechRecognitionSupported,
  useLiveVoiceStore,
} from "@/lib/live-voice-store";

export const LiveVoiceToggle = () => {
  const live = useLiveVoiceStore((s) => s.live);
  const error = useLiveVoiceStore((s) => s.error);
  const setLive = useLiveVoiceStore((s) => s.setLive);
  const setError = useLiveVoiceStore((s) => s.setError);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={live ? "destructive" : "ghost"}
            size="icon"
            className="size-8 shrink-0 rounded-full"
            aria-label={
              live
                ? "End live voice conversation"
                : "Start live voice conversation"
            }
            onClick={() => {
              if (live) {
                setLive(false);
                return;
              }
              if (!speechRecognitionSupported()) {
                setError(
                  "Voice conversation needs a browser with SpeechRecognition (Chrome or Edge).",
                );
                return;
              }
              setLive(true);
            }}
          >
            {live ? (
              <MicIcon className="size-4 animate-pulse" />
            ) : (
              <MicOffIcon className="size-4 opacity-60" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {live ? "End live voice" : "Live voice"}
        </TooltipContent>
      </Tooltip>
      {error && (
        <div className="pointer-events-auto fixed inset-x-0 top-3 z-30 flex justify-center px-4">
          <div className="max-w-full rounded-full border border-destructive/40 bg-destructive/10 px-4 py-2 text-destructive text-sm shadow-lg backdrop-blur">
            {error}
          </div>
        </div>
      )}
    </>
  );
};
