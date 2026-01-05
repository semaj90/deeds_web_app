/**
 * Phase 80: Chat Migration API (COMPLETE)
 *
 * Migrates anonymous localStorage chats to legal_ai_db when user logs in/registers.
 *
 * POST /api/chat/migrate
 * Body: { sessionId, chats: { [chatId]: ChatMessage[] } }
 *
 * Returns: { success: true, migratedCount: number }
 */

import db from '$lib/server/db';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface ChatMessage {
	id: string;
	chatId: string;
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
	// Phase 79: Require authentication for migration
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
		const migratedMessageIds: string[] = [];
		const chatIds = new Set<string>();

		// Use raw SQL with the postgres instance (db) for maximum compatibility
		// We use a transaction to ensure all messages and metadata are saved together
		await db.begin(async (sql) => {
			// Iterate through all chats and save to database
			for (const [chatId, messages] of Object.entries(chats)) {
				chatIds.add(chatId);

				for (const message of messages) {
					// Skip if already saved
					if (message.saved) continue;

					// Phase 80: Insert message into chat_messages table using raw SQL
					await sql`
						INSERT INTO chat_messages (
							id, chat_id, user_id, role, content, timestamp, migrated_from, metadata, created_at, updated_at
						) VALUES (
							${message.id},
							${message.chatId},
							${locals.user.id},
							${message.role},
							${message.content},
							${new Date(message.timestamp)},
							${sessionId},
							NULL,
							NOW(),
							NOW()
						) ON CONFLICT (id) DO NOTHING
					`;

					migratedCount++;
					migratedMessageIds.push(message.id);
				}
			}

			// Update or create chat metadata for each chat
			for (const chatId of chatIds) {
				const messages = chats[chatId];
				const lastMessage = messages[messages.length - 1];

				await sql`
					INSERT INTO chat_metadata (
						chat_id, user_id, title, case_id, message_count, last_message_at, is_archived, tags, created_at, updated_at
					) VALUES (
						${chatId},
						${locals.user.id},
						NULL,
						NULL,
						${messages.length.toString()},
						${new Date(lastMessage.timestamp)},
						'false',
						NULL,
						NOW(),
						NOW()
					) ON CONFLICT (chat_id) DO UPDATE SET
						message_count = EXCLUDED.message_count,
						last_message_at = EXCLUDED.last_message_at,
						updated_at = NOW()
				`;
			}
		});

		console.log(`✅ Migrated ${migratedCount} messages from session ${sessionId} to user ${locals.user.id}`);

		return json({
			success: true,
			migratedCount,
			chatCount: chatIds.size,
			message: `Successfully saved ${migratedCount} chat messages to your account!`
		});
	} catch (err: any) {
		console.error('Migration failed:', err);
		return json({
			message: 'Failed to migrate chat history',
			details: err.message
		}, { status: 500 });
	}
};
