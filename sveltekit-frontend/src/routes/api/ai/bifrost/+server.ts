import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { streamText } from 'ai'
import { bifrost } from '$lib/server/ai/bifrost-provider.js'
import { z } from 'zod'

/** Strip reasoning metadata from Gemma4 responses */
function stripReasoningMetadata(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<start_of_turn>.*?<\/start_of_turn>/g, '')
    .replace(/<end_of_turn>/g, '')
    .replace(/<\|thinking\>[\s\S]*?<\/\|thinking\>/g, '')
    .trim()
}

const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().max(32000),
      })
    )
    .min(1)
    .max(50),
  model: z.string().default('gemma4'),
  stream: z.boolean().default(true),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().min(1).max(8192).optional(),
})

/** POST /api/ai/bifrost — Vercel AI SDK streaming via Bifrost OpenAI-compatible gateway */
export const POST: RequestHandler = async ({ request, locals }) => {
  const isDev = process.env.NODE_ENV === 'development' || process.env.DEV_BYPASS_AUTH === 'true'
  if (!locals.user && !isDev) return json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400 })
  }

  const { messages, model, stream, temperature, maxOutputTokens } = parsed.data

  // Always use streamText for reasoning models like Gemma4
  // (generateText silently truncates <think> blocks and breaks tool calling)
  const result = streamText({
    model: bifrost(model),
    messages,
    temperature,
    maxOutputTokens,
  })

  if (stream) {
    return result.toTextStreamResponse()
  }

  // Non-streaming: collect streamed chunks into full text
  let fullText = ''
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

  for await (const event of result.fullStream) {
    if (event.type === 'text-delta') {
      fullText += event.delta
    } else if (event.type === 'finish') {
      usage = event.usage
    }
  }

  // Strip reasoning metadata before returning to client
  const cleanText = stripReasoningMetadata(fullText)

  return json({ text: cleanText, usage })
}
