/**
 * Phase 76: ChatSession Reactive Class (Svelte 5 Runes)
 * Real SSE streaming via /api/sse/chat with reconnection logic.
 * Client router: lightweight queries → local ONNX, legal/RAG → server Ollama.
 */
import { shouldEscalateToServer, fetchCapabilities, type RouterDecision } from '$lib/ai/client-router.js';
import { SERVER_CHAT_MODEL, CLIENT_LLM_ONNX_PATH, CLIENT_LLM_TOKENIZER_PATH } from '$lib/ai/model-ids.js';
import type { InferenceSource } from '$lib/ai/model-ids.js';
import { clientCache } from '$lib/ai/client-cache.js';
import { updateTextEmotion, getEmotionSystemPrompt, getEmotionState } from '$lib/ai/emotion-context.js';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ExtractedCitation {
  sourceNum: number;
  documentId: string;
  similarity: number;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  timestamp?: string;
  source?: InferenceSource;
  metadata?: {
    confidence?: number;
    confidenceFactors?: ConfidenceFactors;
    citations?: string[];
    contextDocIds?: string[];
    extractedCitations?: ExtractedCitation[];
    graph_context?: string[];
    warnings?: string[];
    routerDecision?: RouterDecision;
  };
}

export interface ConfidenceFactors {
	caseContext: boolean;
	ragHits: number;
	topScore: number | null;
	embeddingModel: string;
}

export interface SSEChunk {
  id: string;
  role: 'assistant';
  content: string;
  status: 'thinking' | 'streaming' | 'done' | 'error';
  source?: InferenceSource;
  confidence?: number;
  confidenceFactors?: ConfidenceFactors;
  contextUsed?: string[];
  citations?: ExtractedCitation[];
  conversationTurns?: number;
}

type OnnxGenerationOutput = {
  content: string;
  provider: string;
  tokensGenerated: number;
};

type AttachmentIngestResult = {
  title?: string;
  filename?: string;
  extractionMethod?: string;
  chunksCreated?: number;
  contentPreview?: string;
  yoloLabels?: string[];
  layoutRegions?: string[];
};

export interface SendMessageOptions {
  forceServer?: boolean;
  forceLocal?: boolean;
  attachment?: File | null;
}

function shouldDebugLogChunkStream(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    return new URLSearchParams(window.location.search).get('debug') === '1';
  } catch {
    return false;
  }
}

function logDebugSseChunk(chatId: string, chunk: SSEChunk): void {
  if (!shouldDebugLogChunkStream()) return;

  console.info(
    `[ChatSSE] ${JSON.stringify({
      chatId,
      status: chunk.status,
      source: chunk.source ?? 'unknown',
      contentLength: chunk.content.length,
      contextUsed: chunk.contextUsed?.length ?? 0,
      extractedCitations: chunk.citations?.length ?? 0,
      confidence: chunk.confidence ?? null,
    })}`
  );
}

function normalizeTokenIds(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.filter((token): token is number => Number.isInteger(token));
  }

  if (typeof value === 'number' && Number.isInteger(value)) {
    return [value];
  }

  return [];
}

function normalizeAttachmentPreview(value: string | undefined, maxLength = 320): string {
  if (!value) return '';
  const normalized = value
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength) + '...';
}

async function generateLocalOnnxReply(message: string): Promise<OnnxGenerationOutput> {
  const { getOnnxSession, getProviderLabel } = await import('$lib/ai/onnx/session.js');
  const { AutoTokenizer } = await import('@huggingface/transformers');
  const { Tensor } = await import('onnxruntime-web');

  const [session, tokenizer] = await Promise.all([
    getOnnxSession(CLIENT_LLM_ONNX_PATH),
    AutoTokenizer.from_pretrained(CLIENT_LLM_TOKENIZER_PATH.replace('/tokenizer.json', ''), {
      local_files_only: true,
    }),
  ]);

  const prompt = [
    'You are a concise legal AI assistant.',
    'Answer the user directly. If the request needs documents or case context, say so briefly.',
    `User: ${message}`,
    'Assistant:',
  ].join('\n');

  const encoded = await tokenizer(prompt, {
    truncation: true,
    max_length: 384,
  });

  const initialInputIds = Array.from(encoded.input_ids ?? []);
  if (initialInputIds.length === 0) {
    throw new Error('Tokenizer produced no input ids');
  }

  const currentTokens = [...initialInputIds];
  const generatedTokens: number[] = [];
  const eosTokenIds = new Set([
    ...normalizeTokenIds((tokenizer as any).eos_token_id),
    ...normalizeTokenIds((tokenizer as any).eos_token_ids),
    ...normalizeTokenIds((tokenizer as any).model?.eos_token_id),
  ]);

  const maxGeneratedTokens = 64;
  const maxContextTokens = 512;

  for (let step = 0; step < maxGeneratedTokens; step++) {
    const trimmedTokens = currentTokens.slice(-maxContextTokens);
    const inputIds = new Tensor('int32', Int32Array.from(trimmedTokens), [1, trimmedTokens.length]);
    const attentionMask = new Tensor('int32', new Int32Array(trimmedTokens.length).fill(1), [
      1,
      trimmedTokens.length,
    ]);

    const results = await session.run({
      input_ids: inputIds,
      attention_mask: attentionMask,
    });

    const outputTensor = (results.logits ?? results[Object.keys(results)[0]]) as {
      data?: ArrayLike<number>;
      dims?: number[];
    };

    const logits = outputTensor?.data;
    if (!logits) {
      throw new Error('No logits output from ONNX model');
    }

    const vocabSize =
      outputTensor?.dims?.[outputTensor.dims.length - 1] ??
      Math.floor(logits.length / trimmedTokens.length);
    if (!Number.isFinite(vocabSize) || vocabSize <= 0) {
      throw new Error('Unable to infer ONNX vocab size');
    }

    const lastRowOffset = (trimmedTokens.length - 1) * vocabSize;
    let bestToken = -1;
    let bestScore = -Infinity;

    for (let tokenIndex = 0; tokenIndex < vocabSize; tokenIndex++) {
      const score = Number(logits[lastRowOffset + tokenIndex] ?? -Infinity);
      if (score > bestScore) {
        bestScore = score;
        bestToken = tokenIndex;
      }
    }

    if (bestToken < 0) {
      throw new Error('ONNX decode step produced no next token');
    }

    if (eosTokenIds.has(bestToken)) {
      break;
    }

    generatedTokens.push(bestToken);
    currentTokens.push(bestToken);
  }

  const content = tokenizer.decode(generatedTokens, { skip_special_tokens: true }).trim();
  if (!content) {
    throw new Error('Local ONNX generated an empty response');
  }

  return {
    content,
    provider: getProviderLabel(CLIENT_LLM_ONNX_PATH),
    tokensGenerated: generatedTokens.length,
  };
}

export class ChatSession {
  messages = $state<ChatMessage[]>([]);
  status = $state<'idle' | 'thinking' | 'streaming' | 'error'>('idle');
  error = $state<string | null>(null);
  lastConfidence = $state<number>(1.0);
  lastSource = $state<InferenceSource>('server-ollama');
  connectionStatus = $state<'connected' | 'disconnected'>('disconnected');
  debugInfo = $state({ reason: '', latencyMs: 0, cacheHit: 'none', provider: 'unknown' });

  private abortController: AbortController | null = null;
  private _chatId: string;
  private _hasCaseContext: boolean;
  private _cartridgePreFetched = false;
  currentRoute = $state<string>('');

  constructor(chatId: string, initialHistory: ChatMessage[] = [], hasCaseContext = false) {
    this._chatId = chatId;
    this.messages = initialHistory;
    this._hasCaseContext = hasCaseContext;
    this.connectionStatus = typeof window !== 'undefined' ? 'connected' : 'disconnected';
  }

  get chatId() {
    return this._chatId;
  }

  /** Load persisted chat history from IndexedDB into this session */
  async loadHistory(): Promise<void> {
    if (this.messages.length > 0) return; // already has history (e.g. from server load)
    const history = await clientCache.getChatHistory(this._chatId);
    if (history.length > 0) {
      this.messages = history.map((h) => ({
        role: h.role as ChatRole,
        content: h.content,
        timestamp: new Date(h.timestamp).toISOString(),
      }));
    }
  }

  addOptimistic(content: string) {
    this.messages.push({
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    });
    clientCache.saveChatMessage(this._chatId, 'user', content);
  }

  addMessage(role: ChatRole, content: string) {
    this.messages.push({
      role,
      content,
      timestamp: new Date().toISOString(),
    });
    clientCache.saveChatMessage(this._chatId, role, content);
  }

  private _getAceCaseId(): string | undefined {
    return this._chatId.startsWith('case-') ? this._chatId : undefined;
  }

  private async _ingestAttachment(file: File): Promise<AttachmentIngestResult> {
    const formData = new FormData();
    formData.set('file', file, file.name);

    const caseId = this._getAceCaseId();
    if (caseId) {
      formData.set('caseId', caseId);
    }

    const response = await fetch('/api/ace/ingest', {
      method: 'POST',
      body: formData,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Attachment ingest failed: HTTP ${response.status}`);
    }

    return payload as AttachmentIngestResult;
  }

  /**
   * Send a message — routes through client router to decide local vs server.
   * Local ONNX path: TODO — wire onnxruntime-web InferenceSession here.
   * Server path: SSE stream via /api/sse/chat (existing, fully wired).
   */
  async sendMessage(content?: string, options?: SendMessageOptions) {
    if (content) {
      this.addMessage('user', content);
    }

    const lastUserMsg = [...this.messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) return;

    let routedMessage = lastUserMsg.content;
    let effectiveOptions: SendMessageOptions = { ...options };

    if (options?.attachment) {
      this.addMessage('system', `Indexing attachment: ${options.attachment.name}`);
      try {
        const attachmentResult = await this._ingestAttachment(options.attachment);
        const title =
          attachmentResult.title || attachmentResult.filename || options.attachment.name;
        const details = [`Attachment ready: ${title}`];
        if (attachmentResult.extractionMethod) {
          details.push(`via ${attachmentResult.extractionMethod}`);
        }
        if (attachmentResult.yoloLabels?.length) {
          details.push(`YOLO: ${attachmentResult.yoloLabels.join(', ')}`);
        }
        this.addMessage('system', details.join(' · '));
        const normalizedPreview = normalizeAttachmentPreview(attachmentResult.contentPreview);
        const previewBlock = normalizedPreview
          ? `\n\nATTACHMENT SOURCE TEXT PROVIDED BELOW. Do not ask the user to provide it again.\n[ATTACHMENT SOURCE START]\n${normalizedPreview}\n[ATTACHMENT SOURCE END]`
          : '';
        routedMessage = `${lastUserMsg.content}\n\nFresh attachment uploaded just now: "${title}".${previewBlock}\n\nUse the attachment source text above and any retrieved ACE context from this attachment as the primary basis for your answer. Quote or cite the attached source when answering. If the attachment source text is present above, do not ask the user to provide it again.`;
        effectiveOptions = { ...effectiveOptions, forceServer: true };
      } catch (err: any) {
        const failureMessage = err?.message ?? 'Attachment ingest failed';
        this.addMessage('system', `Attachment ingest failed: ${failureMessage}`);
        this.error = failureMessage;
      }
    }

    // ── Emotion Context Update ─────────────────────────────────────
    updateTextEmotion(lastUserMsg.content);

    // ── Client Router Decision (health-aware + LokiJS cache) ───────
    const capabilities = await fetchCapabilities();
    const decision = shouldEscalateToServer(routedMessage, this.messages, {
      forceServer: effectiveOptions.forceServer,
      forceLocal: effectiveOptions.forceLocal,
      hasCaseContext: this._hasCaseContext,
      capabilities,
    });

    // Cache the router decision for fast repeated lookups
    clientCache.cacheRouterDecision(
      routedMessage,
      decision.source,
      decision.reason,
      decision.confidence
    );

    this.lastSource = decision.source;
    this.debugInfo = { ...this.debugInfo, reason: decision.reason };

    if (decision.source === 'local-onnx') {
      await this._handleLocalInference(routedMessage, decision);
    } else if (decision.source === 'retrieval-hybrid') {
      await this._handleRetrievalInference(routedMessage, decision);
    } else {
      await this._handleServerInference(routedMessage, decision);
    }
  }

  /**
   * Local ONNX inference via onnxruntime-web + WebGPU (Dawn).
   *
   * Flow:
   *   1. Check IndexedDB cache → return cached reply if hit
   *   2. Load model + tokenizer via getOnnxSession()
   *   3. Tokenize → run InferenceSession → greedy decode
   *   4. Cache result in IndexedDB (persistent)
   *   5. If ONNX fails → auto-escalate to server
   */
  private async _handleLocalInference(message: string, decision: RouterDecision) {
    const t0 = performance.now();
    this.status = 'thinking';
    this.error = null;

    // Check IndexedDB cache first
    const cached = await clientCache.getReply(message);
    if (cached) {
      console.info('[ChatRouter] Cache hit (IndexedDB)', { source: cached.source });
      this.messages.push({
        role: 'assistant',
        content: cached.content,
        timestamp: new Date().toISOString(),
        source: 'local-onnx',
        metadata: { routerDecision: decision },
      });
      this.status = 'idle';
      this.lastSource = 'local-onnx';
      this.debugInfo = {
        ...this.debugInfo,
        cacheHit: 'idb',
        latencyMs: Math.round(performance.now() - t0),
        provider: 'cache',
      };
      return;
    }

    try {
      this.status = 'streaming';
      const { content, provider, tokensGenerated } = await generateLocalOnnxReply(message);

      // Add assistant message
      this.messages.push({
        role: 'assistant',
        content,
        timestamp: new Date().toISOString(),
        source: 'local-onnx',
        metadata: { routerDecision: decision },
      });

      // Cache in IndexedDB (reply cache + chat history)
      await clientCache.putReply(message, content, 'local-onnx');
      clientCache.saveChatMessage(this._chatId, 'assistant', content, { source: 'local-onnx' });

      this.status = 'idle';
      this.lastSource = 'local-onnx';
      this.lastConfidence = decision.confidence;
      this.debugInfo = {
        ...this.debugInfo,
        cacheHit: 'none',
        latencyMs: Math.round(performance.now() - t0),
        provider,
      };
      console.info(`[ChatRouter] Local ONNX response via ${provider}`, {
        tokens: tokensGenerated,
        reason: decision.reason,
      });
    } catch (err: any) {
      // ONNX failed → auto-escalate to server
      console.warn('[ChatRouter] Local ONNX failed, escalating to server:', err.message);
      await this._handleServerInference(message, {
        ...decision,
        source: 'server-ollama',
        reason: `local-fallback(${decision.reason}): ${err.message}`,
      });
    }
  }

  /**
   * Retrieval-hybrid inference: client embeds query → server RAG search with
   * precomputed embedding → GPU rerank chunks → local ONNX generation.
   * Falls back to server on any failure.
   */
  private async _handleRetrievalInference(message: string, decision: RouterDecision) {
    const t0 = performance.now();
    this.status = 'thinking';
    this.error = null;

    try {
      // Step 1: Client-side query embedding (avoids server re-embedding)
      let precomputedEmbedding: number[] | undefined;
      try {
        const { embedText } = await import('$lib/ai/client-embed.js');
        const embedding = await embedText(message);
        if (embedding && embedding.length === 768) {
          precomputedEmbedding = Array.from(embedding);
          console.info(
            `[ChatRouter] Client-embedded query in ${Math.round(performance.now() - t0)}ms`
          );
        }
      } catch {
        // Client embedding failed — server will embed instead
        console.warn('[ChatRouter] Client embedding failed, server will embed');
      }

      // Step 2: Fetch RAG chunks from server (with precomputed embedding)
      const searchRes = await fetch('/api/rag/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: message,
          top_k: 5,
          min_score: 0.3,
          scoring_method: 'hybrid',
          precomputedEmbedding,
        }),
        signal: AbortSignal.timeout(8_000),
      });

      if (!searchRes.ok) {
        console.warn('[ChatRouter] RAG search failed, falling back to server');
        await this._handleServerInference(message, {
          ...decision,
          source: 'server-ollama',
          reason: `retrieval-fallback(rag-${searchRes.status})`,
        });
        return;
      }

      const ragData = await searchRes.json();
      const rawChunks: Array<{ text: string; snippet: string; score: number }> =
        ragData.chunks ?? [];

      if (rawChunks.length === 0) {
        console.info('[ChatRouter] No RAG chunks, trying local inference');
        await this._handleLocalInference(message, {
          ...decision,
          reason: `retrieval(0-chunks)+${decision.reason}`,
        });
        return;
      }

      // Step 3: GPU rerank chunks client-side (WebGPU → WASM → CPU fallback)
      let rankedChunks = rawChunks;
      try {
        const { gpuRerank } = await import('$lib/gpu/gpu-search-reranker.js');
        const rerankResult = await gpuRerank(
          message,
          rawChunks.map((c) => ({ content: c.text || c.snippet, serverScore: c.score })),
          5
        );
        if (rerankResult) {
          rankedChunks = rerankResult.items
            .filter((item) => item.gpuScore >= 0)
            .map((item) => rawChunks[item.index]);
          console.info(
            `[ChatRouter] GPU reranked ${rerankResult.metrics.chunksProcessed} chunks via ${rerankResult.metrics.backend} in ${rerankResult.metrics.totalMs}ms`
          );
        }
      } catch {
        // GPU rerank failed — use server-ranked order
      }

      // Step 4: Build context-augmented prompt for local ONNX
      const topChunks = rankedChunks.slice(0, 3);
      const contextBlock = topChunks
        .map((c, i) => `[Document ${i + 1}]: ${(c.text || c.snippet).slice(0, 800)}`)
        .join('\n\n');
      const augmentedMessage = `Based on these legal documents:\n${contextBlock}\n\nAnswer this question concisely: ${message}`;

      console.info(
        `[ChatRouter] Retrieval-hybrid: ${topChunks.length} chunks, attempting local generation`
      );

      // Step 5: Local ONNX inference with augmented prompt
      try {
        await this._handleLocalInference(augmentedMessage, {
          ...decision,
          source: 'retrieval-hybrid',
          reason: `retrieval(${topChunks.length}-chunks)+local-onnx`,
        });

        // Verify answer quality — if too short, escalate to server
        const lastMsg = this.messages[this.messages.length - 1];
        if (lastMsg?.role === 'assistant' && lastMsg.content.length < 50) {
          console.warn('[ChatRouter] Local answer too short, escalating to server');
          this.messages.pop();
          await this._handleServerInference(message, {
            ...decision,
            source: 'server-ollama',
            reason: `retrieval-escalated(short-answer)`,
          });
        } else {
          this.debugInfo = {
            ...this.debugInfo,
            latencyMs: Math.round(performance.now() - t0),
            provider: 'retrieval-hybrid',
          };
        }
      } catch {
        console.warn('[ChatRouter] Retrieval local ONNX failed, escalating to server');
        await this._handleServerInference(message, {
          ...decision,
          source: 'server-ollama',
          reason: `retrieval-fallback(onnx-failed)`,
        });
      }
    } catch (err: any) {
      console.warn('[ChatRouter] Retrieval pipeline error:', err.message);
      await this._handleServerInference(message, {
        ...decision,
        source: 'server-ollama',
        reason: `retrieval-fallback(${err.message})`,
      });
    }
  }

  /**
   * Server SSE inference via /api/sse/chat (Ollama gemma3-legal:latest + RAG).
   */
  private async _handleServerInference(message: string, decision: RouterDecision) {
    const t0 = performance.now();
    this.status = 'thinking';
    this.error = null;

    this.abortController?.abort();
    this.abortController = new AbortController();

    // Pre-fetch CHR-ROM97 cartridge for case context (fire-and-forget)
    if (this._hasCaseContext && !this._cartridgePreFetched) {
      this._cartridgePreFetched = true;
      const caseId = this._chatId.replace(/^case-/, '');
      fetch('/api/cartridge/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId }),
      })
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((buf) => (buf ? clientCache.putCartridge(caseId, new Uint8Array(buf)) : null))
        .catch(() => {
          /* non-critical optimization */
        });
    }

    try {
      // Build emotion-aware request — server uses emotionPrompt to adapt tone
      const emotionPrompt = getEmotionSystemPrompt();
      const emotionState = getEmotionState();

      const res = await fetch('/api/sse/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          conversationId: this._chatId,
          model: SERVER_CHAT_MODEL,
          emotionPrompt: emotionPrompt || undefined,
          emotionMood: emotionState.composite.mood,
          ...(this.currentRoute ? { currentRoute: this.currentRoute } : {}),
        }),
        signal: this.abortController.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Chat API error: ${res.status}`);
      }

      // Placeholder assistant message — updated as chunks arrive
      const assistantIdx = this.messages.length;
      this.messages.push({
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        source: decision.source,
        metadata: { routerDecision: decision },
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const event of events) {
          // Gather all data: lines in this event (handles multi-line data)
          const dataLines = event
            .split('\n')
            .filter((l) => l.startsWith('data:') || l.startsWith('data: '))
            .map((l) => l.replace(/^data:\s?/, ''));
          const dataLine = dataLines.join('').trim();
          if (!dataLine) continue;

          try {
            const chunk: SSEChunk = JSON.parse(dataLine);
            logDebugSseChunk(this._chatId, chunk);

            if (chunk.status === 'streaming' || chunk.status === 'done') {
              this.status = chunk.status === 'done' ? 'idle' : 'streaming';
              if (chunk.source) {
                this.lastSource = chunk.source;
              }
              this.messages[assistantIdx] = {
                ...this.messages[assistantIdx],
                content: chunk.content,
                source: chunk.source ?? decision.source,
                metadata: {
                  ...this.messages[assistantIdx].metadata,
                  ...(chunk.confidence !== undefined && { confidence: chunk.confidence }),
                  ...(chunk.confidenceFactors && {
                    confidenceFactors: chunk.confidenceFactors,
                  }),
                  ...(chunk.contextUsed && {
                    citations: chunk.contextUsed,
                    contextDocIds: chunk.contextUsed,
                  }),
                  ...(chunk.citations && {
                    extractedCitations: chunk.citations,
                  }),
                },
              };
            }

            if (chunk.status === 'done' && chunk.confidence !== undefined) {
              this.lastConfidence = chunk.confidence;
            }

            if (chunk.status === 'error') {
              this.status = 'error';
              this.error = chunk.content;
              this.messages[assistantIdx] = {
                ...this.messages[assistantIdx],
                content: chunk.content,
              };
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }

      if (this.status === 'streaming') {
        this.status = 'idle';
      }
      this.debugInfo = {
        ...this.debugInfo,
        cacheHit: 'none',
        latencyMs: Math.round(performance.now() - t0),
        provider: 'server-ollama',
      };

      // Persist completed assistant message to IndexedDB
      const finalMsg = this.messages[assistantIdx];
      if (finalMsg?.content) {
        clientCache.saveChatMessage(this._chatId, 'assistant', finalMsg.content, {
          source: decision.source,
          confidence: finalMsg.metadata?.confidence,
        });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('ChatSession.sendMessage error:', err);
      this.status = 'error';
      this.error = err.message ?? 'Failed to get response';

      const lastMsg = this.messages[this.messages.length - 1];
      if (lastMsg?.role !== 'assistant') {
        this.messages.push({
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      this.abortController = null;
      // Ensure status returns to idle after stream completes
      // (guards against SSE payloads missing a 'done' status chunk)
      if (this.status === 'thinking' || this.status === 'streaming') {
        this.status = 'idle';
      }
    }
  }

  destroy() {
    this.abortController?.abort();
    this.abortController = null;
    this.connectionStatus = 'disconnected';
  }
}
