import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { LLAMA_SERVER_BASE_URL, LOCAL_VLM_MODEL } from '$lib/server/ai/local-llama-provider.js';

const generateSchema = z.object({
  model: z.string().max(100).default(LOCAL_VLM_MODEL),
  prompt: z.string().min(1).max(100000),
  stream: z.boolean().default(true),
  options: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      num_ctx: z.number().min(512).max(65536).optional(),
      top_p: z.number().min(0).max(1).optional(),
      top_k: z.number().min(1).max(200).optional()
    })
    .optional()
});

async function streamChatCompletionAsNdjson(
  response: Response
): Promise<Response> {
  if (!response.body) {
    return new Response(JSON.stringify({ error: 'Missing response body' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const encoder = new TextEncoder();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;

            try {
              const parsed = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
              };
              const chunk =
                parsed.choices?.[0]?.delta?.content ??
                parsed.choices?.[0]?.message?.content ??
                '';
              if (chunk) {
                controller.enqueue(encoder.encode(JSON.stringify({ response: chunk, done: false }) + '\n'));
              }
            } catch {
              // Ignore partial chunk parse errors.
            }
          }
        }

        if (buffer.trim().startsWith('data:')) {
          const payload = buffer.trim().slice(5).trim();
          if (payload && payload !== '[DONE]') {
            try {
              const parsed = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
              };
              const chunk =
                parsed.choices?.[0]?.delta?.content ??
                parsed.choices?.[0]?.message?.content ??
                '';
              if (chunk) {
                controller.enqueue(encoder.encode(JSON.stringify({ response: chunk, done: false }) + '\n'));
              }
            } catch {
              // Ignore.
            }
          }
        }

        controller.enqueue(encoder.encode(JSON.stringify({ response: '', done: true }) + '\n'));
        controller.close();
      } catch (error) {
        controller.enqueue(
          encoder.encode(JSON.stringify({ error: 'Stream generation failed', done: true }) + '\n')
        );
        controller.error(error);
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked'
    }
  });
}

/** POST /api/ollama/generate — compatibility wrapper routed to llama-server /v1/chat/completions */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  let body: z.infer<typeof generateSchema>;
  try {
    const raw = await request.json();
    const parsed = generateSchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    body = parsed.data;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const model = body.model.includes(':') ? body.model : `${body.model}:latest`;

  try {
    const res = await fetch(`${LLAMA_SERVER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: body.prompt }],
        stream: body.stream,
        temperature: body.options?.temperature ?? 0.7,
        max_tokens: body.options?.num_ctx ?? 2048
      }),
      signal: AbortSignal.timeout(120_000)
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `llama-server error: ${res.status}` }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (body.stream) {
      return await streamChatCompletionAsNdjson(res);
    }

    const data = await res.json();
    const responseText = String(data?.choices?.[0]?.message?.content ?? '');
    return new Response(
      JSON.stringify({
        ...data,
        model,
        response: responseText,
        done: true
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[/api/ollama/generate] error:', err);
    return new Response(JSON.stringify({ error: 'llama-server service unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
