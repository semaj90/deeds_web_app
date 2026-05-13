
import { getRedis } from '$lib/server/redis.js';
import { isUuid } from '$lib/server/validation.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { chatMetadata } from '$lib/server/db/schema.js';
import { and, eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!isUuid(params.chatId)) {
    return json({ error: 'Invalid ID format' }, { status: 400 });
  }

  const [session] = await db
    .select({ chatId: chatMetadata.chatId })
    .from(chatMetadata)
    .where(
      and(eq(chatMetadata.chatId, params.chatId), eq(chatMetadata.userId, Number(locals.user.id)))
    )
    .limit(1);

  if (!session) {
    return json({ error: 'Conversation not found' }, { status: 404 });
  }

  // ioredis needs a dedicated connection for pub/sub (subscriber mode)
  const subscriber = getRedis().duplicate();
  const channel = `chat_stream:${params.chatId}`;

  const stream = new ReadableStream({
    async start(controller) {
      subscriber.on('message', (ch: string, message: string) => {
        if (ch === channel) {
          controller.enqueue(`data: ${message}\n\n`);
        }
      });
      await subscriber.subscribe(channel);
    },
    async cancel() {
      await subscriber.unsubscribe(channel);
      subscriber.disconnect();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
};
