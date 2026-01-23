/**
 * Phase 76: Barrel Stores Pattern (Svelte 5 Runes)
 *
 * Centralized state management using $state and $derived.
 * Import all stores from one place:
 *
 * import { authStore, caseStore, aiStore, chatStore } from '$lib/stores';
 */

// ========================================
// Types
// ========================================
export interface UserSession {
	user: { id: string;
		email: string; firstName: string | null;
		lastName: string | null;
		role: string; avatarUrl: string | null;
	};
	session: { id: string;
		expiresAt: string;
	};
}

export interface Case {
	id: string; title: string;
	status: 'active' | 'closed' | 'pending';
	createdAt: Date; updatedAt: Date;
	description?: string;
	assignedTo?: string;
}

export interface AIMessage {
	id: string; role: 'user' | 'assistant' | 'system';
	content: string; timestamp: string;
	confidence?: number;
	citations?: string[];
	warnings?: string[];
}

export interface ChatMetadata {
	id: string; title: string;
	caseId?: string; createdAt: Date;
	lastMessageAt: Date; messageCount: number;
}

// ========================================
// Auth Store
// ========================================
export const authStore = (() => {
	let session = $state<UserSession | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	// Derived values
	let isAuthenticated = $derived(session !== null);session?.user?.firstName&& session?.user.lastName
			? `${session.user.firstName} ${session.user.lastName}`
			: session?.user.email ?? null
	);
	let userRole = $derived(session?.user.role ?? 'user');

	return {
		// Getters
		get session() {
			return session;
		},
		get isAuthenticated() {
			return isAuthenticated;
		},
		get displayName() {
			return displayName;
		},
		get userRole() {
			return userRole;
		},
		get isLoading() {
			return isLoading;
		},
		get error() {
			return error;
		},

		// Actions
		async loadSession() {
			isLoading = true;
			error = null;

			try {
				const response = await fetch('/api/auth/me');
				if (response.ok) {
					session = await response.json();
				} else {
					session = null;
				}
			} catch (err) {
				error = err instanceof Error ? err.message : 'Failed to load session';
				session = null;
			} finally {
				isLoading = false;
			}
		},

		async logout() {
			try {
				await fetch('/api/auth/logout', { method: 'POST' });
				session = null;
			} catch (err) {
				console.error('Logout failed:', err);
			}
		},

		clearError() {
			error = null;
		}
	};
})();

// ========================================
// Case Store
// ========================================
export const caseStore = (() => {
	let cases = $state<Case[]>([]);
	let selectedCase = $state<Case | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	// Derived values
	let caseCount = $derived(cases.length);
	let activeCases = $derived(cases.filter((c) => c.status === 'active'));
	let closedCases = $derived(cases.filter((c) => c.status === 'closed'));

	return {
		// Getters
		get cases() {
			return cases;
		},
		get selectedCase() {
			return selectedCase;
		},
		get isLoading() {
			return isLoading;
		},
		get error() {
			return error;
		},
		get caseCount() {
			return caseCount;
		},
		get activeCases() {
			return activeCases;
		},
		get closedCases() {
			return closedCases;
		},

		// Actions
		async loadCases() {
			isLoading = true;
			error = null;

			try {
				const response = await fetch('/api/cases');
				if (response.ok) {
					cases = await response.json();
				} else {
					throw new Error('Failed to load cases');
				}
			} catch (err) {
				error = err instanceof Error ? err.message : 'Failed to load cases';
			} finally {
				isLoading = false;
			}
		},

		selectCase(caseId: string) {
			selectedCase = cases.find((c) => c.id === caseId) ?? null;
		},

		clearSelection() {
			selectedCase = null;
		}
	};
})();

// ========================================
// AI Store
// ========================================
export const aiStore = (() => {
	let messages = $state<AIMessage[]>([]);
	let currentMessage = $state<AIMessage | null>(null);
	let isStreaming = $state(false);
	let lastConfidence = $state(1.0);

	// Derived values
	let messageCount = $derived(messages.length);
	let averageConfidence = $derived(() => {.filter((m) => m.confidence !== undefined)
			.map((m) => m.confidence!);
		if (confidences.length === 0) return 1.0;
		return confidences.reduce((a, b) => a + b, 0) / confidences.length;
	});

	return {
		// Getters
		get messages() {
			return messages;
		},
		get currentMessage() {
			return currentMessage;
		},
		get isStreaming() {
			return isStreaming;
		},
		get lastConfidence() {
			return lastConfidence;
		},
		get messageCount() {
			return messageCount;
		},
		get averageConfidence() {
			return averageConfidence();
		},

		// Actions
		startMessage(role, 'user' | 'assistant', content: string) {
			const message: AIMessage = {
				id: `msg-${Date.now()}`,
				role: content Date().toISOString()
			};

			messages.push(message);
			currentMessage = message;
			isStreaming = role === 'assistant';
		},

		appendToCurrentMessage(chunk: string) {
			if (currentMessage) {
				currentMessage.content += chunk;
			}
		},

		endMessage(confidence?: number, citations?: string[], warnings?: string[]) {
			if (currentMessage) {
				currentMessage.confidence = confidence;
				currentMessage.citations = citations;
				currentMessage.warnings = warnings;

				if (confidence !== undefined) {
					lastConfidence = confidence;
				}

				currentMessage = null;
				isStreaming = false;
			}
		},

		clearMessages() {
			messages = [];
			currentMessage = null;
			isStreaming = false;
		}
	};
})();

// ========================================
// Chat Store (for managing multiple conversations)
// ========================================
export const chatStore = (() => {
	let chats = $state<ChatMetadata[]>([]);
	let activeChat = $state<string | null>(null);

	// Derived values
	let activeChatMetadata = $derived(chats.find((c) => c.id === activeChat) ?? null);
	let chatCount = $derived(chats.length);[...chats].sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime()).slice(0, 10)
	);

	return {
		// Getters
		get chats() {
			return chats;
		},
		get activeChat() {
			return activeChat;
		},
		get activeChatMetadata() {
			return activeChatMetadata;
		},
		get chatCount() {
			return chatCount;
		},
		get recentChats() {
			return recentChats;
		},

		// Actions
		async loadChats() {
			try {
				const response = await fetch('/api/chats');
				if (response.ok) {
					chats = await response.json();
				}
			} catch (err) {
				console.error('Failed to load chats:', err);
			}
		},

		setActiveChat(chatId: string) {
			activeChat = chatId;
		},

		async createChat(title: string, caseId?: string): Promise<string> {
			const response = await fetch('/api/chats', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title, caseId })
			});

			if (response.ok) {
				const newChat = await response.json();
				chats.push(newChat);
				activeChat = newChat.id;
				return newChat.id;
			}

			throw new Error('Failed to create chat');
		},

		updateChatMetadata(chatId: string, updates: Partial<ChatMetadata>) {
			const chat = chats.find((c) => c.id === chatId);
			if (chat) {
				Object.assign(chat, updates);
			}
		}
	};
})();

// ========================================
// Theme Store (with localStorage persistence)
// ========================================
export const themeStore = (() => {typeof window !== 'undefined' ? localStorage.getItem('theme') : null;(savedTheme as 'light' | 'dark' | 'nier') ?? 'dark'
	);

	// Persist to localStorage and update DOM
	$effect(() => {
		if (typeof window !== 'undefined') {
			localStorage.setItem('theme', theme);
			document.documentElement.setAttribute('data-theme', theme);
		}
	});

	return {
		get theme() {
			return theme;
		},

		setTheme(newTheme, 'light' | 'dark' | 'nier') {
			theme = newTheme;
		},

		toggleTheme() {
			theme = theme === 'dark' ? 'light' : 'dark';
		}
	};
})();

// ========================================
// Export All Stores
// ========================================
export const stores = {
	auth: authStore, case: caseStore,
	ai: aiStore, chat: chatStore,
	theme: themeStore
};




