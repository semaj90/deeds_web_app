/**
 * Phase 79: Anonymous Session Manager
 *
 * Handles temporary chat storage for non-authenticated users
 * with migration path to legal_ai_db upon login/registration.
 *
 * Features:
 * - localStorage-based ephemeral chat history
 * - Auto-cleanup after 7 days
 * - Migration API to save chats when user registers
 * - Non-intrusive UX hints to encourage sign-in
 */

interface ChatMessage {
	id: string;
	chatId: string;
	role: 'user' | 'assistant';
	content: string;
	timestamp: string;
	saved?: boolean; // true if persisted to legal_ai_db
}

interface AnonymousSession {
	sessionId: string;
	chats: Map<string, ChatMessage[]>;
	createdAt: string;
	lastActivity: string;
}

const SESSION_KEY = 'anonymous_chat_session';
const EXPIRY_DAYS = 7;

export class AnonymousSessionManager {
	private session: AnonymousSession | null = null;

	constructor() {
		if (typeof window !== 'undefined') {
			this.loadSession();
			this.cleanupExpired();
		}
	}

	/**
	 * Load session from localStorage
	 */
	private loadSession(): void {
		try {
			const raw = localStorage.getItem(SESSION_KEY);
			if (!raw) {
				this.createNewSession();
				return;
			}

			const data = JSON.parse(raw);

			// Convert Map serialization back to Map
			this.session = {
				...data, chats: new Map(Object.entries(data.chats || {}))
			};

			// Update last activity
			this.session.lastActivity = new Date().toISOString();
			this.saveSession();
		} catch (error) {
			console.warn('Failed to load anonymous session, creating new:', error);
			this.createNewSession();
		}
	}

	/**
	 * Create new anonymous session
	 */
	private createNewSession(): void {
		this.session = {
			sessionId: this.generateSessionId(),
			chats: new Map(),
			createdAt: new Date().toISOString(),
			lastActivity: new Date().toISOString()
		};
		this.saveSession();
	}

	/**
	 * Save session to localStorage
	 */
	private saveSession(): void {
		if (!this.session) return;

		try {
			// Convert Map to object for JSON serialization
			const serializable = {
				...this.session, chats: Object.fromEntries(this.session.chats)
			};

			localStorage.setItem(SESSION_KEY, JSON.stringify(serializable));
		} catch (error) {
			console.error('Failed to save anonymous session:', error);
		}
	}

	/**
	 * Generate unique session ID
	 */
	private generateSessionId(): string {
		return `anon_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
	}

	/**
	 * Clean up sessions older than EXPIRY_DAYS
	 */
	private cleanupExpired(): void {
		if (!this.session) return;

		const now = new Date();
		const created = new Date(this.session.createdAt);
		const daysDiff = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);

		if (daysDiff > EXPIRY_DAYS) {
			console.log('Anonymous session expired, clearing...');
			this.clearSession();
		}
	}

	/**
	 * Add message to chat history
	 */
	addMessage(chatId: string, message: Omit<ChatMessage, 'id' | 'chatId'>): ChatMessage {
		if (!this.session) this.createNewSession();

		const fullMessage: ChatMessage = {
			id: this.generateMessageId(),
			chatId,
			...message, timestamp: message.timestamp || new Date().toISOString(),
			saved: false
		};

		const chatHistory = this.session!.chats.get(chatId) || [];
		chatHistory.push(fullMessage);
		this.session!.chats.set(chatId, chatHistory);

		this.session!.lastActivity = new Date().toISOString();
		this.saveSession();

		return fullMessage;
	}

	/**
	 * Get chat history for specific chat
	 */
	getChatHistory(chatId: string): ChatMessage[] {
		if (!this.session) return [];
		return this.session.chats.get(chatId) || [];
	}

	/**
	 * Get all chats
	 */
	getAllChats(): Map<string, ChatMessage[]> {
		if (!this.session) return new Map();
		return this.session.chats;
	}

	/**
	 * Get session info for migration
	 */
	getSessionInfo(): { sessionId: string; messageCount: number; chatCount: number } | null {
		if (!this.session) return null;

		let messageCount = 0;
		this.session.chats.forEach(messages => {
			messageCount += messages.length;
		});

		return {
			sessionId: this.session.sessionId, messageCount.session.chats.size
		};
	}

	/**
	 * Export all chats for migration to legal_ai_db
	 */
	exportForMigration(): { sessionId: string; chats: Record<string, ChatMessage[]> } | null {
		if (!this.session) return null;

		return {
			sessionId: this.session.sessionId, Object.fromEntries(this.session.chats)
		};
	}

	/**
	 * Mark messages as saved after migration
	 */
	markAsSaved(chatId: string, messageIds: string[]): void {
		if (!this.session) return;

		const chatHistory = this.session.chats.get(chatId);
		if (!chatHistory) return;

		chatHistory.forEach(msg => {
			if (messageIds.includes(msg.id)) {
				msg.saved = true;
			}
		});

		this.saveSession();
	}

	/**
	 * Clear session (used after successful migration)
	 */
	clearSession(): void {
		this.session = null;
		localStorage.removeItem(SESSION_KEY);
	}

	/**
	 * Check if user has unsaved chats
	 */
	hasUnsavedChats(): boolean {
		if (!this.session) return false;

		for (const [_, messages] of this.session.chats) {
			if (messages.some(m => !m.saved)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Get count of unsaved messages
	 */
	getUnsavedCount(): number {
		if (!this.session) return 0;

		let count = 0;
		for (const [_, messages] of this.session.chats) {
			count += messages.filter(m => !m.saved).length;
		}

		return count;
	}

	private generateMessageId(): string {
		return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
	}
}

// Singleton instance
export const anonymousSessionManager = new AnonymousSessionManager();

/**
 * Hook for Svelte components
 */
export function useAnonymousSession() {
	return {
		addMessage: (chatId: string, message: Omit<ChatMessage, 'id' | 'chatId'>) =>
			anonymousSessionManager.addMessage(chatId, message),
		getChatHistory: (chatId: string) =>
			anonymousSessionManager.getChatHistory(chatId),
		hasUnsavedChats: () =>
			anonymousSessionManager.hasUnsavedChats(),
		getUnsavedCount: () =>
			anonymousSessionManager.getUnsavedCount(),
		exportForMigration: () =>
			anonymousSessionManager.exportForMigration(),
		clearSession: () =>
			anonymousSessionManager.clearSession()
	};
}
