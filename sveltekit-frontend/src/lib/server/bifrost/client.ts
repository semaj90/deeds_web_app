import { ENV } from '$lib/server/env.server.js';

export interface BifrostChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface BifrostStreamRequest {
  model: string;
  messages: BifrostChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export type BifrostStreamEvent =
  | { type: 'token'; content: string }
  | { type: 'done' }
  | { type: 'error'; error: string };

function extractToken(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const obj = payload as {
    choices?: Array<{
      delta?: { content?: string };
      message?: { content?: string };
    }>;
  };
  const choice = obj.choices?.[0];
  return choice?.delta?.content ?? choice?.message?.content ?? '';
}

export async function* streamBifrostChatCompletions(
  req: BifrostStreamRequest
): AsyncGenerator<BifrostStreamEvent> {
  const timeoutMs = Math.max(5_000, req.timeoutMs ?? 120_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${ENV.BIFROST_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...req.headers,
      },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxTokens ?? 2048,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const preview = await response.text().catch(() => '');
      yield { type: 'error', error: `Bifrost HTTP ${response.status}: ${preview.slice(0, 240)}` };
      return;
    }

    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (!data) continue;
        if (data === '[DONE]') {
          yield { type: 'done' };
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const token = extractToken(parsed);
          if (token) yield { type: 'token', content: token };
        } catch {
          // Ignore malformed chunks and continue streaming.
        }
      }
    }

    yield { type: 'done' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    yield { type: 'error', error: message };
  } finally {
    clearTimeout(timeout);
  }
}
