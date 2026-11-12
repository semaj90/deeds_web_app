import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { chatMessages, chatMetadata } from '$lib/server/db/schema';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import type { ChatSessionOwnerDependenciesV1 } from './chat-session-owner-v1.js';

/**
 * PostgreSQL-backed dependencies for `ensureChatSessionOwnerV1`: `chat_metadata` is the session
 * owner, `chat_messages` only proves a legacy chat already has history, and case access is the
 * canonical owner-or-assigned-attorney rule. Same behaviour as the inline copies in
 * `api/sse/chat` and `api/v1/chat/messages`; those are left untouched until a consolidation pass.
 */
export function chatSessionOwnerDepsV1(): ChatSessionOwnerDependenciesV1 {
	return {
		findSession: async (chatId) => {
			const [session] = await db
				.select({ userId: chatMetadata.userId, caseId: chatMetadata.caseId })
				.from(chatMetadata)
				.where(eq(chatMetadata.chatId, chatId))
				.limit(1);
			return session ?? null;
		},
		hasMessages: async (chatId) => {
			const [messageRow] = await db
				.select({ id: chatMessages.id })
				.from(chatMessages)
				.where(eq(chatMessages.chatId, chatId))
				.limit(1);
			return Boolean(messageRow);
		},
		createIfAbsent: async ({ chatId, userId, caseId }) => {
			await db.insert(chatMetadata).values({ chatId, userId, caseId }).onConflictDoNothing();
		},
		canAccessCase: async (caseId, userId) => Boolean(await getAuthorizedCase(caseId, userId)),
	};
}
