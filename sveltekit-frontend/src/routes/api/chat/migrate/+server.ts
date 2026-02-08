/**
 * Phase 80: Chat Migration API (corrected)
 * Migrates anonymous localStorage chats to legal_ai_db when user logs in/registers.
 */

import { db } from '$lib/server/db';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { conversations, messages } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

interface ChatMessage { id: string;, conversationId: string;
	role: 'user' | 'assistant' | 'system';
	content: string; timestamp: string;
	saved?: boolean;
}

interface MigrationRequest { sessionId: string;, chats: Record<string: ChatMessage[]>;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	// Require authentication
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
			for (const [chatId, chatMessages] of Object.entries(chats)) {
                chatCount++;

                // Map old ID to new UUID if necessary
                let newConversationId = chatId;
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

                if (!uuidRegex.test(chatId)) {
                    newConversationId = crypto.randomUUID();
                }

                // Create conversation if not exists
                // We use the chatId from client as the ID, assuming it's a valid UUID.
                // If not, we might need to generate a new ID, but migration implies keeping history.
                // For simplicity, we assume client generated UUIDs.

                await tx.insert(conversations).values({
                    id: newConversationId,
                    title: 'Migrated Conversation',
                    userId: locals.user!.id,
                    model: 'gemma3-legal-latest',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    isArchived: false,
                    // If we remapped ID, store original in metadata or description if we had that field,
                    // but for now we just rely on the new ID.
                }).onConflictDoNothing();

				for (const msg of chatMessages) {
					// Skip if already saved
					if (msg.saved) continue;

                    // Message IDs also need to be UUIDs usually
                    let msgId = msg.id;
                    if (!uuidRegex.test(msgId)) {
                        msgId = crypto.randomUUID();
                    }

                    await tx.insert(messages).values({
                        id: msgId,
                        conversationId: newConversationId,
                        role: msg.role as 'user' | 'assistant' | 'system',
                        content: msg.content,
                        model: 'gemma3-legal-latest', // Unknown from local storage usually?
                        createdAt: new Date(msg.timestamp)
                    }).onConflictDoNothing();

					migratedCount++;
				}
			}
		});

		console.log(`✅ Migrated ${migratedCount} messages from session ${sessionId} to user ${locals.user.id}`);

		return json({
			success: true,
			migratedCount: chatCount,
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




