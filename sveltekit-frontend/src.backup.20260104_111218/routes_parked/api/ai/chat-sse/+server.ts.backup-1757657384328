import type { RequestHandler } from './$types';
import { apiError, getRequestId, withErrorHandling } from '$lib/server/api/standard-response';
import { ollamaService } from '$lib/server/services/OllamaService.js';
import { logger } from '$lib/server/production-logger.js';
import { conversationService } from '$lib/server/services/conversation-service';

interface StreamLine {
  response?: string;
  done?: boolean;
  [k: string]: any;
}

export const POST: RequestHandler = withErrorHandling(async (event) => {
  const requestId = getRequestId(event);
  const body = await event.request.json().catch(() => ({}));
  const {
    message,
    model = 'gemma3-legal:latest',
    temperature = 0.7,
    conversationId,
    userId = 'mock-user-id',
    caseId,
    useRAG = true,
  } = body;

  if (!message || !message.trim())
    return apiError('Message is required', 400, 'INVALID_INPUT', undefined, requestId);

  if (!(await ollamaService.isHealthy()))
    return apiError(
      'AI service is currently unavailable',
      503,
      'SERVICE_UNAVAILABLE',
      undefined,
      requestId
    );

  let currentConversationId = conversationId;
  if (!currentConversationId) {
    const title = message.length > 50 ? message.slice(0, 47) + '...' : message;
    const created = await conversationService.create({
      userId,
      title,
      caseId,
      context: { model, temperature, useRAG },
    });
    currentConversationId = created.id;
  }

  await conversationService.addMessage({
    conversationId: currentConversationId,
    role: 'user',
    content: message,
    metadata: { requestId, useRAG },
  });

  let prompt = `You are an expert legal AI assistant. Provide accurate, professional legal information.\n\nUser question: ${message}`;
  if (useRAG) {
    try {
      const ragResp = await fetch('http://localhost:8094/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: message, limit: 5, threshold: 0.7 }),
      });
      if (ragResp.ok) {
        const ragData = await ragResp.json();
        if (Array.isArray(ragData.results) && ragData.results.length) {
          const ctx = ragData.results
            .map((r: any) => `- ${r.content || r.text || 'Relevant legal information'}`)
            .join('\n');
          prompt += `\n\nRelevant legal context from your knowledge base:\n${ctx}\n\nUse this context to provide more accurate and specific answers.`;
        }
      }
    } catch (e) {
      logger.warn(
        `RAG context fetch failed (requestId=${requestId}): ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (d: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(d)}\n\n`));
      let buffer = '';
      let tokens = 0;
      let finished = false;

      const persist = async (incomplete = false) => {
        if (!buffer) return;
        try {
          await conversationService.addMessage({
            conversationId: currentConversationId!,
            role: 'assistant',
            content: buffer,
            metadata: { requestId, model, temperature, tokenCount: tokens, useRAG, incomplete },
          });
        } catch (e) {
          logger.error(
            `Persist assistant message failed (requestId=${requestId}): ${e instanceof Error ? e.message : String(e)}`
          );
        }
      };

      send({
        type: 'connection',
        conversationId: currentConversationId,
        requestId,
        timestamp: new Date().toISOString(),
      });

      try {
        const resp = await fetch('http://localhost:11436/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            prompt,
            stream: true,
            options: { temperature, num_predict: 2048, top_k: 40, top_p: 0.9, repeat_penalty: 1.1 },
          }),
        });
        if (!resp.ok) throw new Error(`Ollama API error ${resp.status}`);
        const reader = resp.body?.getReader();
        if (!reader) throw new Error('Streaming response body not available');
        const td = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = td.decode(value, { stream: true });
          const lines = chunk
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);
          for (const raw of lines) {
            let line = raw.startsWith('data:') ? raw.slice(5).trim() : raw;
            try {
              const data: StreamLine = JSON.parse(line);
              if (data.response) {
                buffer += data.response;
                tokens++;
                send({
                  type: 'token',
                  content: data.response,
                  fullResponse: buffer,
                  tokenCount: tokens,
                });
              }
              if (data.done) {
                finished = true;
                await persist(false);
                send({
                  type: 'complete',
                  fullResponse: buffer,
                  tokenCount: tokens,
                  conversationId: currentConversationId,
                  timestamp: new Date().toISOString(),
                });
              }
            } catch (e) {
              logger.warn(
                `Stream parse error (requestId=${requestId}) lineSnippet='${line.slice(0, 120)}' err=${e instanceof Error ? e.message : String(e)}`
              );
            }
          }
          if (finished) break;
        }
      } catch (e) {
        logger.error(
          `Streaming failure (requestId=${requestId}): ${e instanceof Error ? e.message : String(e)}`
        );
        await persist(true);
        send({
          type: 'error',
          error: e instanceof Error ? e.message : 'Streaming failed',
          timestamp: new Date().toISOString(),
        });
      } finally {
        if (!finished) await persist(true);
        send({ type: 'close', timestamp: new Date().toISOString() });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
});

export const OPTIONS: RequestHandler = async () =>
  new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
