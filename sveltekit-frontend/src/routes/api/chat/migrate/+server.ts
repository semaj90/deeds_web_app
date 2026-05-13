/**
 * Phase 80: Chat Migration API
 * Migrates anonymous localStorage chats to legal_ai_db when user logs in/registers.
 */

import { db } from '$lib/server/db/client';
import { chatMessages } from '$lib/server/db/schema';
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const chatMessageSchema = z.object({
	id: z.string().max(500).optional().default(''),
	conversationId: z.string().max(500).optional().default(''),
	role: z.enum(['user', 'assistant', 'system']),
	content: z.string().max(100_000),
	timestamp: z.string(),
	saved: z.boolean().optional(),
});

const migrationSchema = z.object({
	sessionId: z.string().min(1, 'Missing sessionId').max(500),
	chats: z.record(z.string(), z.array(chatMessageSchema).max(1000)),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'You must be logged in to save your chat history');
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const parsed = migrationSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
	}

	const { sessionId, chats } = parsed.data;
	const userId = Number(locals.user.id);

  // Redis dedup: skip if this (userId, sessionId) pair was already migrated recently
  try {
    const { redis } = await import('$lib/server/redis.js');
    const dedupKey = `chat:migrate:${userId}:${sessionId}`;
    const alreadyDone = await redis.get(dedupKey);
    if (alreadyDone) {
      return json({ success: true, migratedCount: 0, message: 'Already migrated this session.' });
    }
    await redis.set(dedupKey, '1', 'EX', 86400); // 24h TTL
  } catch {
    // Redis unavailable — proceed without dedup
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
              id: msg.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              chatId,
              userId: userId,
              role: msg.role,
              content: msg.content,
              createdAt: new Date(msg.timestamp),
            })
            .onConflictDoNothing();

          migratedCount++;
        }
      }
    });

    console.log(`[chat/migrate] Migrated ${migratedCount} messages from session`);

    // Publish to RabbitMQ for async embedding of migrated messages
    if (migratedCount > 0) {
      try {
        const { rabbitmq } = await import('$lib/server/queue/rabbitmq-manager-fixed.js');
        await rabbitmq.publishWhenReady('document.processing', 'chat.migrate.embed', {});
      } catch {
        // Non-fatal: embedding will be triggered on next chat query
      }
    }

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
			},
			{ status: 500 }
		);
	}
};