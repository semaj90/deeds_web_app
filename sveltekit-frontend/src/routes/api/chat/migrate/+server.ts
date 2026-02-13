/**
 * Phase 80: Chat Migration API
 * Migrates anonymous localStorage chats to legal_ai_db when user logs in/registers.
 *
 * TODO: chatMetadata auto-encoding logic for session-level metadata
 * TODO: Redis cache for migration deduplication
 * TODO: RabbitMQ embedding.generation queue for async embedding of migrated messages
 * TODO: Qdrant vector tagging for semantic chat retrieval
 */

import { db } from '$lib/server/db/client';
import { chatMessages } from '$lib/server/db/schema';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface ChatMessage {
	id: string;
	conversationId: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: string;
	saved?: boolean;
}

interface MigrationRequest {
	sessionId: string;
	chats: Record<string, ChatMessage[]>;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'You must be logged in to save your chat history');
	}

	let body: MigrationRequest;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const { sessionId, chats } = body;

	if (!sessionId || !chats) {
		throw error(400, 'Missing sessionId or chats');
	}

	try {
		let migratedCount = 0;
		let chatCount = 0;

		await db.transaction(async (tx) => {
			for (const [chatId, msgs] of Object.entries(chats)) {
				chatCount++;

				for (const msg of msgs) {
					if (msg.saved) continue;

					await tx
						.insert(chatMessages)
						.values({
							chatId,
							userId: locals.user!.id,
							role: msg.role,
							content: msg.content,
							createdAt: new Date(msg.timestamp),
						})
						.onConflictDoNothing();

					migratedCount++;
				}
			}
		});

		console.log(
			`Migrated ${migratedCount} messages from session ${sessionId} to user ${locals.user.id}`
		);

		return json({
			success: true,
			migratedCount: chatCount,
			message: `Successfully saved ${migratedCount} chat messages to your account!`,
		});
	} catch (err: unknown) {
		console.error('Migration failed:', err);
		return json(
			{
				message: 'Failed to migrate chat history',
				details: err instanceof Error ? err.message : 'Unknown error',
			},
			{ status: 500 }
		);
	}
};