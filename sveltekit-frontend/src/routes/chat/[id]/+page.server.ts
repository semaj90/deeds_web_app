/**
 * Phase 76: Chat Route Server
 * Enhanced with error handling, validation, and caseId support
 */

import { fail } from '@sveltejs/kit';
import * as amqp from 'amqplib';
import { createClient } from 'redis';
import type { Actions, PageServerLoad } from './$types';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const QUEUE = 'ai_chat_queue';

export const load: PageServerLoad = async ({ params, locals }) => {
	const redis = createClient({ url: REDIS_URL });
	await redis.connect();

	const chatId = params.id;
	const isAuthenticated = !!locals.user;
	const redisKey = `chat:${chatId}`;

	// Load from Redis (shared between anonymous and authenticated)
	const rawHistory = await (redis as any).get(redisKey);
	const history = rawHistory ? JSON.parse(rawHistory) : [];

	// If authenticated, optionally load from legal_ai_db for persistence
	let savedChats: any[] = [];
	if (locals.user) {
		// TODO: Load user's saved chats from database
		// savedChats = await db.query.chatMessages.findMany({
		//   where: eq(chatMessages.chatId, chatId)
		// });
	}

	await redis.disconnect();

	return {
		chatId,
		history,
		user: locals.user || null,
		isAuthenticated,
		shouldPromptAuth: !isAuthenticated,
		// Merge Redis (ephemeral) + DB (persistent) if authenticated
		savedChats: isAuthenticated ? savedChats : []
	};
};

export const actions: Actions = {
	send: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const userMessage = formData.get('message') as string;
		const caseId = (formData.get('caseId') as string) || null;
		const isAnonymous = !locals.user;

		// Validation
		if (!userMessage || userMessage.trim().length === 0) {
			return fail(400, { error: 'Message cannot be empty' });
		}

		if (userMessage.length > 10000) {
			return fail(400, { error: 'Message too long (max 10,000 characters)' });
		}

		try {
			// Send job to RabbitMQ worker
			const conn = await (amqp as any).connect(RABBITMQ_URL);
			const channel = await conn.createChannel();
			await channel.assertQueue(QUEUE, { durable: true });

			const job = {
				chatId: params.id,
				message: userMessage.trim(),
				caseId,
				userId: locals.user? .id : | null,
				isAnonymous,
				timestamp: new Date().toISOString()
			};

			channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify(job)), {
				persistent: true
			});

			console.log(`📤 Sent message to RabbitMQ for chat:${params.id} (${isAnonymous ? 'anonymous' : 'authenticated'})`);

			await channel.close();
			await conn.close();

			// If authenticated, save to legal_ai_db
			if (locals.user) {
				// TODO: Persist chat message
				// await db.insert(chatMessages).values({
				//   chatId: params.id,
				//   userId: locals.user.id,
				//   message: userMessage.trim(),
				//   timestamp: new Date()
				// });
			}

			// Optimistic response - SSE will deliver AI reply
			return {
				success: true,
				saved: !!locals.user,
				hint: isAnonymous ? '💡 Sign in to save this conversation' : undefined
			};
		} catch (error: any) {
			console.error('Failed to send message to RabbitMQ:', error);
			return fail(500, { error: 'Failed to process message. Please try again.' });
		}
	}
};
