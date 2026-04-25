import type { Writable } from "svelte/store";
import { derived, writable } from "svelte/store";

// === TYPES ===

export interface ChatMessage {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
  conversationId?: string;
  saved?: boolean;
  metadata?: {
    model?: string;
    temperature?: number;
    tokensUsed?: number;
    references?: string[];
    emotionalTone?: string;
    proactive?: boolean;
    reactions?: Record<string, boolean>;
    saved?: boolean;
  };
}
export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  created: Date;
  updated: Date;
  isFavorite?: boolean;
  tags?: string[];
}
export interface ChatState {
  currentConversation: Conversation | null;
  conversations: Conversation[];
  isLoading: boolean;
  isTyping: boolean;
  error: string | null;
  lastActivity?: Date;
  settings: {
    model: string;
    temperature: number;
    maxTokens: number;
    proactiveMode: boolean;
    emotionalMode: boolean;
  };
}
// === INITIAL STATE ===

const initialState: ChatState = {
  currentConversation: null,
  conversations: [],
  isLoading: false,
  isTyping: false,
  error: null,
  settings: {
    model: "gpt-4",
    temperature: 0.7,
    maxTokens: 2048,
    proactiveMode: true,
    emotionalMode: true,
  },
};

// === STORE ===

export const chatStore: Writable<ChatState> = writable(initialState);

// AI Personality configuration
export const aiPersonality = writable({
  name: "Legal Assistant",
  role: "prosecutor assistant",
  description:
    "Professional legal AI assistant specialized in prosecution cases",
});

// === DERIVED STORES ===

export const currentMessages = derived(
  chatStore,
  ($chat) => $chat.currentConversation?.messages || [],
);

export const conversationsList = derived(chatStore, ($chat) =>
  $chat.conversations.sort((a, b) => b.updated.getTime() - a.updated.getTime()),
);

export const isActiveChat = derived(
  chatStore,
  ($chat) => !!$chat.currentConversation,
);

export const currentConversation = derived(
  chatStore,
  ($chat) => $chat.currentConversation,
);

export const isLoading = derived(chatStore, ($chat) => $chat.isLoading);

export const isTyping = derived(chatStore, ($chat) => $chat.isTyping);

export const showProactivePrompt = writable(false);

// === ACTIONS ===

export const chatActions = {
  // Create new conversation
  newConversation: (title?: string) => {
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      title: title || "New Conversation",
      messages: [],
      created: new Date(),
      updated: new Date(),
    };

    chatStore.update((state) => ({
      ...state,
      currentConversation: conversation,
      conversations: [conversation, ...state.conversations],
    }));

    return conversation.id;
  },

  // Load conversation
  loadConversation: (conversationId: string) => {
    chatStore.update((state) => {
      const conversation = state.conversations.find(
        (c) => c.id === conversationId,
      );
      return {
        ...state,
        currentConversation: conversation || null,
      };
    });
  },

  // Add message
  addMessage: (content: string, role: "user" | "assistant", metadata?: any) => {
    chatStore.update((state) => {
      if (!state.currentConversation) {
        // Create new conversation if none exists
        const conversation: Conversation = {
          id: crypto.randomUUID(),
          title: content.slice(0, 50) + (content.length > 50 ? "..." : ""),
          messages: [],
          created: new Date(),
          updated: new Date(),
        };
        state.currentConversation = conversation;
        state.conversations = [conversation, ...state.conversations];
      }
      const message: ChatMessage = {
        id: crypto.randomUUID(),
        content,
        role,
        timestamp: new Date(),
        conversationId: state.currentConversation.id,
        metadata,
      };

      state.currentConversation.messages.push(message);
      state.currentConversation.updated = new Date();

      // Update title if it's the first user message
      if (role === "user" && state.currentConversation.messages.length === 1) {
        state.currentConversation.title =
          content.slice(0, 50) + (content.length > 50 ? "..." : "");
      }
      return { ...state };
    });
  },

  // Send message
  sendMessage: async (content: string) => {
    chatActions.addMessage(content, "user");

    chatStore.update((state) => ({
      ...state,
      isLoading: true,
      isTyping: true,
      error: null,
    }));

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          conversationId: getCurrentConversationId(),
          settings: getSettings(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();

      chatActions.addMessage(data.response, "assistant", {
        model: data.model,
        tokensUsed: data.tokensUsed,
        references: data.references,
      });
    } catch (error) {
      console.error("Error sending message:", error);
      chatStore.update((state) => ({
        ...state,
        error:
          error instanceof Error ? error.message : "Failed to send message",
      }));
    } finally {
      chatStore.update((state) => ({
        ...state,
        isLoading: false,
        isTyping: false,
      }));
    }
  },

  // Delete conversation
  deleteConversation: (conversationId: string) => {
    chatStore.update((state) => {
      const conversations = state.conversations.filter(
        (c) => c.id !== conversationId,
      );
      const currentConversation =
        state.currentConversation?.id === conversationId
          ? null
          : state.currentConversation;

      return {
        ...state,
        conversations,
        currentConversation,
      };
    });
  },

  // Update settings
  updateSettings: (newSettings: Partial<ChatState["settings"]>) => {
    chatStore.update((state) => ({
      ...state,
      settings: { ...state.settings, ...newSettings },
    }));
  },

  // Clear error
  clearError: () => {
    chatStore.update((state) => ({ ...state, error: null }));
  },

  // Save conversation to local storage
  saveToStorage: () => {
    if (typeof window === "undefined") return;

    chatStore.subscribe((state) => {
      try {
        localStorage.setItem(
          "chat-conversations",
          JSON.stringify(state.conversations),
        );
        localStorage.setItem("chat-settings", JSON.stringify(state.settings));
      } catch (error) {
        console.warn("Failed to save chat data to localStorage:", error);
      }
    });
  },

  // Load from local storage
  loadFromStorage: () => {
    if (typeof window === "undefined") return;

    try {
      const conversations = localStorage.getItem("chat-conversations");
      const settings = localStorage.getItem("chat-settings");

      if (conversations || settings) {
        chatStore.update((state) => ({
          ...state,
          conversations: conversations
            ? JSON.parse(conversations).map((c: any) => ({
                ...c,
                created: new Date(c.created),
                updated: new Date(c.updated),
                messages: c.messages.map((m: any) => ({
                  ...m,
                  timestamp: new Date(m.timestamp),
                })),
              }))
            : state.conversations,
          settings: settings
            ? { ...state.settings, ...JSON.parse(settings) }
            : state.settings,
        }));
      }
    } catch (error) {
      console.warn("Failed to load chat data from localStorage:", error);
    }
  },

  // Update activity timestamp
  updateActivity: () => {
    chatStore.update((state) => ({
      ...state,
      lastActivity: new Date(),
    }));
  },

  // Toggle message saved status
  toggleMessageSaved: (messageId: string) => {
    chatStore.update((state) => {
      if (!state.currentConversation) return state;

      const messages = state.currentConversation.messages.map((msg) => {
        if (msg.id === messageId) {
          return { ...msg, saved: !msg.metadata?.saved };
        }
        return msg;
      });

      return {
        ...state,
        currentConversation: {
          ...state.currentConversation,
          messages,
        },
      };
    });
  },

  // React to message
  reactToMessage: (messageId: string, reaction: string) => {
    chatStore.update((state) => {
      if (!state.currentConversation) return state;

      const messages = state.currentConversation.messages.map((msg) => {
        if (msg.id === messageId) {
          const reactions = msg.metadata?.reactions || {};
          return {
            ...msg,
            metadata: {
              ...msg.metadata,
              reactions: { ...reactions, [reaction]: !reactions[reaction] },
            },
          };
        }
        return msg;
      });

      return {
        ...state,
        currentConversation: {
          ...state.currentConversation,
          messages,
        },
      };
    });
  },

  // Set loading state
  setLoading: (loading: boolean) => {
    chatStore.update((state) => ({
      ...state,
      isLoading: loading,
    }));
  },

  // Set typing state
  setTyping: (typing: boolean) => {
    chatStore.update((state) => ({
      ...state,
      isTyping: typing,
    }));
  },
};

// === HELPER FUNCTIONS ===

function getCurrentConversationId(): string | undefined {
  let currentId: string | undefined;
  chatStore.subscribe((state) => {
    currentId = state.currentConversation?.id;
  })();
  return currentId;
}
function getSettings(): ChatState["settings"] {
  let settings: ChatState["settings"];
  chatStore.subscribe((state) => {
    settings = state.settings;
  })();
  return settings!;
}
