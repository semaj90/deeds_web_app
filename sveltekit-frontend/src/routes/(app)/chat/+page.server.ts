import * as amqp from 'amqplib';
import { getRabbitMQUrl } from '$lib/config/env.server.js';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db/client';
import { chatMessages } from '$lib/server/db/schema';

/**
 * Phase 79: Graceful Auth Fallback for Chat
 * - Allow anonymous users (localStorage-based)
 * - Offer login/register to save chats to legal_ai_db
 * - Non-intrusive UX for contextual testing
 */

export const load: PageServerLoad = async ({ locals }) => {
	// Check if user is authenticated
	const isAuthenticated = !!locals.user;

    return {
        isAuthenticated,
        user: locals?.user ?? null,
        // Hint to frontend: show "Sign in to save your chats" banner
        shouldPromptAuth: !isAuthenticated
    };
};

export const actions: Actions = {
	send: async ({ request, locals }) => {
        const data = await request.formData();
        const text = data.get('message') as string;
        const chatId = data.get('chatId') as string;
        const isAnonymous = !locals.user;

        if (!text || !chatId) {
            return { success: false, error: 'Missing message or chatId' };
        }

        // Push to RabbitMQ (works for both anonymous and authenticated users)
        try {
            const conn = await (amqp as any).connect(getRabbitMQUrl());
            const ch = await conn.createChannel();
            await ch.assertQueue('ai_jobs');

            const message = {
                chatId,
                text,
                userId: locals.user?.id ?? null, // null for anonymous
                isAnonymous,
                timestamp: new Date().toISOString()
            };

            await ch.sendToQueue('ai_jobs', Buffer.from(JSON.stringify(message)));

            await ch.close();
            await conn.close();

            // If authenticated, save to legal_ai_db
            if (locals.user) {
                await db.insert(chatMessages).values({
                    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    chatId,
                    userId: locals.user.id,
                    role: 'user',
                    content: text,
                    timestamp: new Date()
                }).catch(e => console.error('Failed to persist chat message:', e));
            }

            return {
                success: true,
                saved: !!locals.user, // Inform frontend if message was persisted
                hint: isAnonymous ? 'Sign in to save your conversation history' : undefined
            };
        } catch (error) {
            console.error("Failed to send to queue:", error);
            return { success: false, error: 'Queue error' };
        }
    }
};


