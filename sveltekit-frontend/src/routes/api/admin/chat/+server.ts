import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth-utils.js';
import { resolveLlamaInferenceTarget } from '$lib/server/llm/runtime-contract.js';
import { db } from '$lib/server/db/client.js';
import { chatMessages } from '$lib/server/db/schema.js';
import { z } from 'zod';

const chatSchema = z.object({
  message: z.string().trim().min(1).max(32_000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().max(32_000)
  }).strict()).max(32).default([]),
  chatId: z.string().min(1).max(200),
  systemContext: z.object({
    rabbit: z.object({ pending: z.number().finite().nonnegative(), failed: z.number().finite().nonnegative() }).strict().optional(),
    postgres: z.object({ summary_count: z.number().finite().nonnegative() }).strict().optional(),
    neo4j: z.object({ nodes: z.number().finite().nonnegative() }).strict().optional(),
    qdrant: z.object({ collectionCount: z.number().finite().nonnegative() }).strict().optional()
  }).strict().optional()
});

export const POST: RequestHandler = async (event) => {
  const user = requireAdmin(event);
  let rawBody: unknown;
  try {
    rawBody = await event.request.json();
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsedBody = chatSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return json({ error: 'invalid_request', issues: parsedBody.error.issues.slice(0, 5) }, { status: 400 });
  }
  const { message, history, chatId, systemContext } = parsedBody.data;
  const userId = user.id ? Number(user.id) : undefined;
  let target: Awaited<ReturnType<typeof resolveLlamaInferenceTarget>>;
  try {
    target = await resolveLlamaInferenceTarget();
  } catch {
    return json({ error: 'llama_server_unavailable' }, { status: 503 });
  }

  const userMsgId = `msg_${Date.now()}_u`;
  await db.insert(chatMessages).values({
    id: userMsgId,
    chatId: chatId,
    userId: userId,
    role: 'user',
    content: message,
    metadata: JSON.stringify({ model: target.model, systemContext })
  });

  const systemPrompt = `You are the TRACE Indexing Assistant.
  You help admins manage the N8-N10 Knowledge Retrieval pipeline.

  CURRENT SYSTEM STATUS:
  - RabbitMQ: ${systemContext?.rabbit?.pending ?? 0} pending, ${systemContext?.rabbit?.failed ?? 0} failed.
  - Postgres: ${systemContext?.postgres?.summary_count ?? 0} snippets.
  - Neo4j: ${systemContext?.neo4j?.nodes ?? 0} nodes.
  - Qdrant: ${systemContext?.qdrant?.collectionCount ?? 0} collections.

  If RabbitMQ "failed" count is > 0, prioritize explaining potential worker bottlenecks (GPU exhaustion or SIMD-bridge crashes).
  Provide technical, precise, and concise answers.`;

  try {
    const response = await fetch(`${target.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: target.model,
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
