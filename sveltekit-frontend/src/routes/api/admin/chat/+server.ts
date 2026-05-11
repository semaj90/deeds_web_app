import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env.server.js';
import { db } from '$lib/server/db/client';
import { chatMessages } from '$lib/server/db/schema.js';
import { z } from 'zod';

const MODEL_URL = ENV.TURBOQUANT_BASE_URL ?? 'http://127.0.0.1:8090';

const chatSchema = z.object({
  message: z.string().min(1),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string()
  })).default([]),
  chatId: z.string().min(1),
  systemContext: z.object({
    rabbit: z.object({ pending: z.number(), failed: z.number() }).optional(),
    postgres: z.object({ summary_count: z.number() }).optional(),
    neo4j: z.object({ nodes: z.number() }).optional(),
    qdrant: z.object({ collectionCount: z.number() }).optional()
  }).optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json();
  const { message, history, chatId, systemContext } = chatSchema.parse(body);
  const userId = locals.user?.id;

  // 1. Log User Message
  const userMsgId = `msg_${Date.now()}_u`;
  await db.insert(chatMessages).values({
    id: userMsgId,
    chatId: chatId,
    userId: userId,
    role: 'user',
    content: message,
    metadata: JSON.stringify({ model: ENV.GEMMA4_MODEL, systemContext })
  });

  // 2. Prepare Context (Indexing Studio Context + RabbitMQ Health)
  const systemPrompt = `You are the TRACE Indexing Assistant. 
  You help admins manage the N8-N10 Knowledge Retrieval pipeline.
  
  CURRENT SYSTEM STATUS:
  - RabbitMQ: ${systemContext?.rabbit?.pending ?? 0} pending, ${systemContext?.rabbit?.failed ?? 0} failed.
  - Postgres: ${systemContext?.postgres?.summary_count ?? 0} snippets.
  - Neo4j: ${systemContext?.neo4j?.nodes ?? 0} nodes.
  - Qdrant: ${systemContext?.qdrant?.collectionCount ?? 0} collections.
  
  If RabbitMQ "failed" count is > 0, prioritize explaining potential worker bottlenecks (GPU exhaustion or SIMD-bridge crashes).
  Provide technical, precise, and concise answers.`;

  // 3. Call Model (TurboQuant / llama-server /v1/chat/completions)
  try {
    const response = await fetch(`${MODEL_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: message }
        ],
        stream: false // Streaming can be added later with Response.body
      })
    });

    const data = await response.json();
    const assistantContent = data.choices?.[0]?.message?.content || 'Error: No response from model.';

    // 4. Log Assistant Message
    const assistantMsgId = `msg_${Date.now()}_a`;
    await db.insert(chatMessages).values({
      id: assistantMsgId,
      chatId: chatId,
      userId: userId,
      role: 'assistant',
      content: assistantContent,
      metadata: JSON.stringify({ usage: data.usage })
    });

    return json({ content: assistantContent, id: assistantMsgId });
  } catch (err) {
    console.error('Admin Chat Error:', err);
    return json({ error: 'Failed to reach inference server.' }, { status: 502 });
  }
};
