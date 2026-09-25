"use client";

import { useChat, type UIMessage } from "@ai-sdk/react";
import {
  RuntimeAdapterProvider,
  unstable_useRemoteThreadListRuntime,
  useAui,
  useAuiState,
  type AssistantClient,
  type AssistantRuntime,
  type ExportedMessageRepositoryItem,
  type GenericThreadHistoryAdapter,
  type MessageFormatAdapter,
  type MessageFormatItem,
  type MessageFormatRepository,
  type MessageStorageEntry,
  type ThreadHistoryAdapter,
  type ThreadMessage,
  type unstable_RemoteThreadListAdapter,
} from "@assistant-ui/react";
import {
  AssistantChatTransport,
  useAISDKRuntime,
  type UseChatRuntimeOptions,
} from "@assistant-ui/react-ai-sdk";
import {
  type AssistantStream,
  type AssistantStreamChunk,
} from "assistant-stream";
import { type ChatTransport } from "ai";
import {
  type FC,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const THREADS_STORAGE_KEY = "own-chatgpt:threads:v1";
const HISTORY_STORAGE_PREFIX = "own-chatgpt:history:v1:";

type StoredThreadRecord = {
  remoteId: string;
  externalId: string | undefined;
  title: string | undefined;
  status: "regular" | "archived";
  updatedAt: number;
};

type StoredHistoryEntry = MessageStorageEntry<unknown>;

const readStorage = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as T;
    return parsed;
  } catch {
    return fallback;
  }
};

const writeStorage = (key: string, value: unknown): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

const readThreads = (): Record<string, StoredThreadRecord> => {
  return readStorage<Record<string, StoredThreadRecord>>(
    THREADS_STORAGE_KEY,
    {},
  );
};

const writeThreads = (threads: Record<string, StoredThreadRecord>): void => {
  writeStorage(THREADS_STORAGE_KEY, threads);
};

const historyKey = (remoteId: string): string => {
  return `${HISTORY_STORAGE_PREFIX}${encodeURIComponent(remoteId)}`;
};

const readHistory = (remoteId: string): StoredHistoryEntry[] => {
  return readStorage<StoredHistoryEntry[]>(historyKey(remoteId), []);
};

const writeHistory = (
  remoteId: string,
  messages: StoredHistoryEntry[],
): void => {
  writeStorage(historyKey(remoteId), messages);
};

const touchThread = (
  remoteId: string,
  patch?: Partial<Omit<StoredThreadRecord, "remoteId">>,
): StoredThreadRecord => {
  const threads = readThreads();
  const previous = threads[remoteId];

  const next: StoredThreadRecord = {
    remoteId,
    externalId: previous?.externalId,
    title: previous?.title,
    status: previous?.status ?? "regular",
    updatedAt: Date.now(),
    ...patch,
  };

  threads[remoteId] = next;
  writeThreads(threads);
  return next;
};

const getFirstUserText = (
  messages: readonly ThreadMessage[],
): string | undefined => {
  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const part of message.content) {
      if (part.type !== "text") continue;
      const text = part.text.trim();
      if (text.length === 0) continue;
      return text.slice(0, 80);
    }
  }
  return undefined;
};

class LocalStorageThreadListAdapter
  implements unstable_RemoteThreadListAdapter
{
  public unstable_Provider?: FC<PropsWithChildren>;

  async list() {
    const threads = Object.values(readThreads())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((thread) => ({
        status: thread.status,
        remoteId: thread.remoteId,
        title: thread.title,
        externalId: thread.externalId,
      }));

    return { threads };
  }

  async initialize(threadId: string) {
    const thread = touchThread(threadId, { status: "regular" });
    return { remoteId: thread.remoteId, externalId: thread.externalId };
  }

  async rename(remoteId: string, newTitle: string): Promise<void> {
    touchThread(remoteId, { title: newTitle });
  }

  async archive(remoteId: string): Promise<void> {
    touchThread(remoteId, { status: "archived" });
  }

  async unarchive(remoteId: string): Promise<void> {
    touchThread(remoteId, { status: "regular" });
  }

  async delete(remoteId: string): Promise<void> {
    const threads = readThreads();
    delete threads[remoteId];
    writeThreads(threads);

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(historyKey(remoteId));
    }
  }

  async generateTitle(
    remoteId: string,
    unstable_messages: readonly ThreadMessage[],
  ): Promise<AssistantStream> {
    const generated = getFirstUserText(unstable_messages);
    if (generated) {
      touchThread(remoteId, { title: generated });
    }
    return new ReadableStream<AssistantStreamChunk>();
  }

  async fetch(threadId: string) {
    const thread = readThreads()[threadId];
    if (!thread) {
      throw new Error("Thread not found");
    }

    return {
      status: thread.status,
      remoteId: thread.remoteId,
      title: thread.title,
      externalId: thread.externalId,
    };
  }
}

class LocalStorageFormattedThreadHistoryAdapter<TMessage, TStorageFormat>
  implements GenericThreadHistoryAdapter<TMessage>
{
  public constructor(
    private readonly parent: LocalStorageThreadHistoryAdapter,
    private readonly formatAdapter: MessageFormatAdapter<
      TMessage,
      TStorageFormat
    >,
  ) {}

  public async append(item: MessageFormatItem<TMessage>): Promise<void> {
    const encoded = this.formatAdapter.encode(item);
    const messageId = this.formatAdapter.getId(item.message);
    await this.parent.appendWithFormat(
      item.parentId,
      messageId,
      this.formatAdapter.format,
      encoded,
    );
  }

  public async load(): Promise<MessageFormatRepository<TMessage>> {
    return this.parent.loadWithFormat<TMessage, TStorageFormat>(
      this.formatAdapter.format,
      (stored) => this.formatAdapter.decode(stored),
    );
  }
}

class LocalStorageThreadHistoryAdapter implements ThreadHistoryAdapter {
  public constructor(private readonly aui: AssistantClient) {}

  public withFormat<TMessage, TStorageFormat>(
    formatAdapter: MessageFormatAdapter<TMessage, TStorageFormat>,
  ): GenericThreadHistoryAdapter<TMessage> {
    return new LocalStorageFormattedThreadHistoryAdapter(this, formatAdapter);
  }

  public async append({ parentId, message }: ExportedMessageRepositoryItem) {
    await this.appendWithFormat(parentId, message.id, "aui/v0", message);
  }

  public async load() {
    const repo = await this.loadWithFormat("aui/v0", (stored) => ({
      parentId: stored.parent_id,
      message: stored.content as ExportedMessageRepositoryItem["message"],
    }));

    return {
      headId: repo.headId ?? null,
      messages: repo.messages,
    };
  }

  public async appendWithFormat<TStorageFormat>(
    parentId: string | null,
    messageId: string,
    format: string,
    content: TStorageFormat,
  ): Promise<void> {
    const { remoteId } = await this.aui.threadListItem().initialize();
    const history = readHistory(remoteId);

    if (history.some((item) => item.id === messageId)) {
      touchThread(remoteId);
      return;
    }

    history.push({
      id: messageId,
      parent_id: parentId,
      format,
      content: content as unknown,
    });

    writeHistory(remoteId, history);
    touchThread(remoteId);
  }

  public async loadWithFormat<TMessage, TStorageFormat>(
    format: string,
    decoder: (
      stored: MessageStorageEntry<TStorageFormat>,
    ) => MessageFormatItem<TMessage>,
  ): Promise<MessageFormatRepository<TMessage>> {
    const remoteId = this.aui.threadListItem().getState().remoteId;
    if (!remoteId) return { messages: [] };

    const entries = readHistory(remoteId).filter(
      (entry) => entry.format === format,
    );
    const messages = entries.map((entry) =>
      decoder({
        id: entry.id,
        parent_id: entry.parent_id,
        format: entry.format,
        content: entry.content as TStorageFormat,
      }),
    );

    return {
      headId: entries.at(-1)?.id ?? null,
      messages,
    };
  }
}

const useLocalStorageThreadHistoryAdapter = (): ThreadHistoryAdapter => {
  const aui = useAui();
  const [adapter] = useState<ThreadHistoryAdapter>(
    () => new LocalStorageThreadHistoryAdapter(aui),
  );
  return adapter;
};

const useLocalStorageThreadListAdapter =
  (): unstable_RemoteThreadListAdapter => {
    const unstable_Provider = useCallback<FC<PropsWithChildren>>(
      function Provider({ children }) {
        const history = useLocalStorageThreadHistoryAdapter();
        const adapters = useMemo(() => ({ history }), [history]);

        return (
          <RuntimeAdapterProvider adapters={adapters}>
            {children}
          </RuntimeAdapterProvider>
        );
      },
      [],
    );

    const [adapter] = useState(() => new LocalStorageThreadListAdapter());
    adapter.unstable_Provider = unstable_Provider;

    return adapter;
  };

type UsePersistentChatRuntimeOptions<UI_MESSAGE extends UIMessage = UIMessage> =
  Omit<UseChatRuntimeOptions<UI_MESSAGE>, "cloud">;

const useDynamicChatTransport = <UI_MESSAGE extends UIMessage = UIMessage>(
  transport: ChatTransport<UI_MESSAGE>,
): ChatTransport<UI_MESSAGE> => {
  const transportRef = useRef<ChatTransport<UI_MESSAGE>>(transport);

  useEffect(() => {
    transportRef.current = transport;
  }, [transport]);

  const dynamicTransport = useMemo(
    () =>
      new Proxy(transportRef.current, {
        get(_, prop) {
          const value =
            transportRef.current[prop as keyof ChatTransport<UI_MESSAGE>];
          return typeof value === "function"
            ? value.bind(transportRef.current)
            : value;
        },
      }),
    [],
  );

  return dynamicTransport;
};

const useChatThreadRuntime = <UI_MESSAGE extends UIMessage = UIMessage>(
  options?: UsePersistentChatRuntimeOptions<UI_MESSAGE>,
): AssistantRuntime => {
  const {
    adapters,
    transport: transportOptions,
    toCreateMessage,
    ...chatOptions
  } = options ?? {};

  const transport = useDynamicChatTransport(
    transportOptions ?? new AssistantChatTransport(),
  );

  const id = useAuiState(({ threadListItem }) => threadListItem.id);
  const chat = useChat({
    ...chatOptions,
    id,
    transport,
  });

  const runtime = useAISDKRuntime(chat, {
    adapters,
    ...(toCreateMessage && { toCreateMessage }),
  });

  if (transport instanceof AssistantChatTransport) {
    transport.setRuntime(runtime);
  }

  return runtime;
};

export const usePersistentChatRuntime = <
  UI_MESSAGE extends UIMessage = UIMessage,
>(
  options: UsePersistentChatRuntimeOptions<UI_MESSAGE> = {},
): AssistantRuntime => {
  const adapter = useLocalStorageThreadListAdapter();

  return unstable_useRemoteThreadListRuntime({
    runtimeHook: function RuntimeHook() {
      return useChatThreadRuntime(options);
    },
    adapter,
    allowNesting: true,
  });
};
