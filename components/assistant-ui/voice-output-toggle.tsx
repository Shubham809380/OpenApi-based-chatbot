"use client";

import { useAui, useAuiEvent, useAuiState } from "@assistant-ui/react";
import { Volume2Icon, VolumeXIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLiveVoiceStore } from "@/lib/live-voice-store";

export const VoiceOutputToggle = () => {
  const aui = useAui();
  const speaking = useAuiState(({ thread }) => thread.speech !== undefined);
  const liveVoice = useLiveVoiceStore((s) => s.live);
  const [enabled, setEnabled] = useState(false);

  useAuiEvent(
    "thread.runEnd",
    useCallback(() => {
      if (!enabled || liveVoice) return;
      const { messages } = aui.thread().getState();
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i];
        if (message.role !== "assistant") continue;
        const hasText = message.content.some(
          (part) => part.type === "text" && part.text.trim().length > 0,
        );
        if (!hasText) continue;
        aui.thread().message({ id: message.id }).speak();
        break;
      }
    }, [aui, enabled, liveVoice]),
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={enabled ? "default" : "ghost"}
          size="icon"
          className="size-8 shrink-0 rounded-full"
          aria-label={
            enabled ? "Turn off voice replies" : "Turn on voice replies"
          }
          onClick={() => {
            if (enabled) {
              const state = aui.thread().getState();
              if (state.speech) {
                try {
                  aui.thread().stopSpeaking();
                } catch {
                  // Nothing is being spoken.
                }
              }
              setEnabled(false);
            } else {
              setEnabled(true);
            }
          }}
        >
          {speaking ? (
            <Volume2Icon className="size-4 animate-pulse" />
          ) : enabled ? (
            <Volume2Icon className="size-4" />
          ) : (
            <VolumeXIcon className="size-4 opacity-60" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {enabled ? "Voice replies on (click to mute)" : "Voice replies"}
      </TooltipContent>
    </Tooltip>
  );
};
