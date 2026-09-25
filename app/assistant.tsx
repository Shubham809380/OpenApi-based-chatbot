"use client";

import {
  AssistantRuntimeProvider,
  WebSpeechDictationAdapter,
  WebSpeechSynthesisAdapter,
} from "@assistant-ui/react";
import { AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { LiveVoiceToggle } from "@/components/assistant-ui/live-voice-toggle";
import { VoiceOutputToggle } from "@/components/assistant-ui/voice-output-toggle";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ThreadListSidebar } from "@/components/assistant-ui/threadlist-sidebar";
import { Separator } from "@/components/ui/separator";
import { usePersistentChatRuntime } from "@/lib/persistent-chat-runtime";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

const dictationAdapter = new WebSpeechDictationAdapter();
const speechAdapter = new WebSpeechSynthesisAdapter();

export const Assistant = () => {
  const runtime = usePersistentChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
    }),
    adapters: {
      dictation: dictationAdapter,
      speech: speechAdapter,
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <SidebarProvider>
        <div className="flex h-dvh w-full pr-0.5">
          <ThreadListSidebar />
          <SidebarInset>
            <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbPage>Starter Template</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <div className="ml-auto flex items-center gap-2">
                <LiveVoiceToggle />
                <VoiceOutputToggle />
              </div>
            </header>
            <div className="flex-1 overflow-hidden">
              <Thread />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </AssistantRuntimeProvider>
  );
};
