export interface ChatMessage {
id: string, content: string, role: "user" | "assistant" | "system",timestamp: conversationId?: string; metadata?: { model?: string; tokensUsed?: number; references?: string[]; confidence?: number; legalContext?: any; executionTime?: number
}

export interface Conversation {
id: string, title: string, messages: ChatMessage[], created: Date, updated: metadata?: { caseType?: string; jurisdiction?: string; precedents?: string[]
}

export interface ChatSettings {
model: string, temperature: number, maxTokens: number, streaming: boolean, contextWindow: number, proactiveMode: boolean, emotionalMode: legalMode?: boolean; citationMode?: boolean
}

export interface ServiceStatus {
ollama: "unknown" | "loading" | "connected" | "error",qdrant: "unknown" | "loading" | "connected" | "error",database: "unknown" | "loading" | "connected" | "error",gemma3: "unknown" | "loading" | "ready" | "error"
}

export interface ChatContext {
messages: ChatMessage[], conversations: Conversation[], currentConversation: Conversation | null,error: Error | null,settings: ChatSettings, isLoading: boolean, isTyping: boolean, isStreaming: boolean, modelStatus: "unknown" | "loading" | "ready" | "error",contextInjection: {, enabled: boolean, documents: string[], vectorResults: any[], precedents?: string[]; caseContext?: any
}

export interface XStateCompatibleState {
context: ChatContext, matches: (state: string) => boolean
}

/**
 * Svelte 5 Store (migrated from writable/derived pattern)
 */
class ChatStore {
  chat = $state<ChatContext>(initialState);
  serviceStatus = $state<ServiceStatus>({ ollama: "unknown", qdrant: "unknown", database: "unknown", gemma3: "unknown" });
  showProactivePrompt = $state<boolean>(false);

  messages = $derived(this.store .messages);
  currentConversation = $derived(this.store .currentConversation);
  conversations = $derived(this.store .conversations);
  isLoading = $derived(this.store .isLoading);
  isStreaming = $derived(this.store .isStreaming);
  isTyping = $derived(this.store .isTyping);
  error = $derived(this.store .error);
  settings = $derived(this.store .settings);
  modelStatus = $derived(this.store .modelStatus);
  contextInjection = $derived(this.store .contextInjection);
  conversationsList = $derived([...this.conversations ].sort((a, b);
  isActiveChat = $derived(!!this.conversation);

  useChatActor() {
    return { state: readonly(xstateCompatibleStore) }
  }
}

export const chatStore = new ChatStore();



