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
import { isE2BReady } from '$lib/ai/gemma4-e2b-client.js';
import { evaluateSynthesisQuality, scoreRetrievalConfidence, recordFeedback, getThresholds, type RetrievalSignals } from '$lib/ai/client-quality.js';
import { synthesize } from '$lib/ai/client-llm-synthesis.js';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface GlossaryMatch {
  id?: string | null;
  term: string;
  definition: string;
  source: 'legal_glossary' | 'legal_definitions';
  citation?: string | null;
  confidence?: number | null;
  jurisdiction?: string | null;
  sourceNodeId?: string | null;
}

export interface AceEvalSummary {
  quality: number;
  completeness: number;
  accuracy: number;
}

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
    glossaryMatches?: GlossaryMatch[];
    aceEval?: AceEvalSummary;
    graph_context?: string[];
    warnings?: string[];
    routerDecision?: RouterDecision;
    queryHash?: string;
    pipeline?: string;
  };
}

/** FNV-1a 32-bit hash → 8 hex chars. Browser-safe, no crypto import needed. */
function shortHash(text: string): string {
  let h = 2166136261;
  const len = Math.min(text.length, 256);
  for (let i = 0; i < len; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export interface ConfidenceFactors {
	caseContext: boolean;
	ragHits: number;
	topScore: number | null;
	embeddingModel: string;
}

function buildPersistedMetadata(
  message: ChatMessage,
  decision: RouterDecision
): Record<string, unknown> {
  return {
    source: message.source ?? decision.source,
    ...(message.metadata ?? {}),
  };
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
  glossaryMatches?: GlossaryMatch[];
  aceEval?: AceEvalSummary;
  conversationTurns?: number;
  hyperedgeHash?: string;
}

type OnnxGenerationOutput = {
  content: string;
  provider: string;
  tokensGenerated: number;
};

type AttachmentIngestResult = {
  jobId?: string;
  attachmentSourceHash?: string;
  title?: string;
  filename?: string;
  extractionMethod?: string;
  chunksCreated?: number;
  contentPreview?: string;
  yoloLabels?: string[];
  layoutRegions?: string[];
  indexingStatus?: 'queued' | 'completed' | 'deferred';
  statusMessage?: string;
  statusStep?: string;
  statusProgress?: number;
};

type AttachmentJobStatus = {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'deferred' | 'error';
  step: string;
  progress: number;
  message: string;
  error?: string | null;
  result?: {
    title?: string;
    contentPreview?: string;
    chunksCreated?: number;
    graphNodeId?: string | null;
    extractionMethod?: string;
    yoloLabels?: string[];
    layoutRegions?: string[];
    totalTokens?: number;
  } | null;
};

export interface SendMessageOptions {
  forceServer?: boolean;
  forceLocal?: boolean;
  attachment?: File | null;
  attachmentSourceHash?: string;
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
  debugInfo = $state({ reason: '', latencyMs: 0, cacheHit: 'none', provider: 'unknown', e2bReady: false, inferenceTier: 'unknown' as string });

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
        metadata:
          h.metadata && typeof h.metadata === 'object'
            ? (h.metadata as ChatMessage['metadata'])
            : undefined,
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
    return this._chatId.startsWith('case-') ? this._chatId.replace(/^case-/, '') : undefined;
  }

  async saveGlossaryConcept(match: GlossaryMatch): Promise<string> {
    const caseId = this._getAceCaseId();
    if (!caseId) {
      throw new Error('Glossary concepts can only be saved from a case conversation.');
    }

    const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/authorities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'glossary_concept',
        term: match.term,
        citationText: match.term,
        definition: match.definition,
        jurisdiction: match.jurisdiction,
        source: match.source,
        confidence: match.confidence,
        relevanceScore: match.confidence,
        nodeId: match.sourceNodeId || undefined,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Glossary save failed: HTTP ${response.status}`);
    }

    this.addMessage('system', `Saved legal concept to case: ${match.term}`);
    return payload.id as string;
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

  private async _fetchAttachmentJobStatus(jobId: string): Promise<AttachmentJobStatus> {
    const response = await fetch(`/api/ace/status?jobId=${encodeURIComponent(jobId)}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Attachment status failed: HTTP ${response.status}`);
    }

    return payload as AttachmentJobStatus;
  }

  private async _watchAttachmentJob(jobId: string, title: string): Promise<void> {
    let consecutiveFailures = 0;

    for (let attempt = 0; attempt < 90; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      try {
        const status = await this._fetchAttachmentJobStatus(jobId);
        consecutiveFailures = 0;
        if (status.status === 'completed') {
          this._injectAnalysisContext(title, status.result);
          return;
        }

        if (status.status === 'deferred') {
          this.addMessage(
            'system',
            `Attachment retrieval indexing deferred for ${title}. Preview-grounded answers remain available.`
          );
          return;
        }

        if (status.status === 'error') {
          this.addMessage(
            'system',
            `Attachment indexing failed after preview extraction: ${status.error || status.message}`
          );
          return;
        }
      } catch {
        consecutiveFailures += 1;
        if (consecutiveFailures >= 5) {
          this.addMessage(
            'system',
            `Attachment indexing status unavailable for ${title}. Preview-grounded answers are still available.`
          );
          return;
        }
      }
    }

    this.addMessage(
      'system',
      `Attachment indexing is still running for ${title}. Preview-grounded answers remain available.`
    );
  }

  /** Inject a system message with the full analysis context so subsequent questions can reference it */
  private _injectAnalysisContext(title: string, result?: AttachmentJobStatus['result']): void {
    if (!result) {
      this.addMessage('system', `Attachment indexed for retrieval: ${title}`);
      return;
    }

    const parts = [`[File Analysis Complete: ${result.title || title}]`];

    if (result.extractionMethod || result.chunksCreated) {
      const extraction = [
        result.extractionMethod ? `via ${result.extractionMethod}` : '',
        result.chunksCreated ? `${result.chunksCreated} chunks indexed` : '',
        result.totalTokens ? `${result.totalTokens} tokens` : '',
      ].filter(Boolean).join(', ');
      if (extraction) parts.push(`Extraction: ${extraction}`);
    }

    if (result.yoloLabels?.length) {
      parts.push(`Visual objects detected: ${result.yoloLabels.join(', ')}`);
    }

    if (result.layoutRegions?.length) {
      parts.push(`Layout regions: ${result.layoutRegions.join(', ')}`);
    }

    if (result.contentPreview) {
      const preview = result.contentPreview.length > 2000
        ? result.contentPreview.slice(0, 2000) + '...'
        : result.contentPreview;
      parts.push(`Content summary: ${preview}`);
    }

    if (result.graphNodeId) {
      parts.push(`Graph node: ${result.graphNodeId}`);
    }

    this.addMessage('system', parts.join('\n'));
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
        const details = [
          attachmentResult.indexingStatus === 'queued'
            ? `Preview ready: ${title}`
            : `Attachment indexed: ${title}`,
        ];
        if (attachmentResult.extractionMethod) {
          details.push(`via ${attachmentResult.extractionMethod}`);
        }
        if (attachmentResult.yoloLabels?.length) {
          details.push(`YOLO: ${attachmentResult.yoloLabels.join(', ')}`);
        }
        if (attachmentResult.statusMessage) {
          details.push(attachmentResult.statusMessage);
        }
        if (attachmentResult.jobId) {
          details.push(`job ${attachmentResult.jobId.slice(-8)}`);
        }
        this.addMessage('system', details.join(' · '));
        if (attachmentResult.indexingStatus === 'queued') {
          this.addMessage(
            'system',
            'Answering from extracted preview while background indexing completes.'
          );
          if (attachmentResult.jobId) {
            void this._watchAttachmentJob(attachmentResult.jobId, title);
          }
        }
        const normalizedPreview = normalizeAttachmentPreview(attachmentResult.contentPreview);
        const previewBlock = normalizedPreview
          ? `\n\nATTACHMENT SOURCE TEXT PROVIDED BELOW. Do not ask the user to provide it again.\n[ATTACHMENT SOURCE START]\n${normalizedPreview}\n[ATTACHMENT SOURCE END]`
          : '';
        routedMessage = `${lastUserMsg.content}\n\nFresh attachment uploaded just now: "${title}".${previewBlock}\n\nUse the attachment source text above and any retrieved ACE context from this attachment as the primary basis for your answer. Quote or cite the attached source when answering. If the attachment source text is present above, do not ask the user to provide it again.`;
        effectiveOptions = {
          ...effectiveOptions,
          forceServer: true,
          attachmentSourceHash: attachmentResult.attachmentSourceHash,
        };
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
    const e2bReady = isE2BReady();
    const decision = shouldEscalateToServer(routedMessage, this.messages, {
      forceServer: effectiveOptions.forceServer,
      forceLocal: effectiveOptions.forceLocal,
      hasCaseContext: this._hasCaseContext,
      capabilities,
      e2bReady,
    });

    // Cache the router decision for fast repeated lookups
    clientCache.cacheRouterDecision(
      routedMessage,
      decision.source,
      decision.reason,
      decision.confidence
    );

    this.lastSource = decision.source;
    this.debugInfo = { ...this.debugInfo, reason: decision.reason, e2bReady, inferenceTier: decision.source };

    if (decision.source === 'local-e2b') {
      await this._handleE2BInference(routedMessage, decision);
    } else if (decision.source === 'local-onnx') {
      await this._handleLocalInference(routedMessage, decision);
    } else if (decision.source === 'retrieval-hybrid') {
      await this._handleRetrievalInference(routedMessage, decision);
    } else if (decision.source === 'server-agentic') {
      await this._handleAgenticInference(routedMessage, decision, effectiveOptions);
    } else {
      await this._handleServerInference(routedMessage, decision, effectiveOptions);
    }
  }

  /**
   * E2B inference via Gemma 4 E2B 2.3B (Transformers.js + WebGPU).
   * Primary client-side path when E2B model is loaded.
   * Falls back to 270M ONNX on failure.
   */
  private async _handleE2BInference(message: string, decision: RouterDecision) {
    const t0 = performance.now();
    this.status = 'thinking';
    this.error = null;

    // Check synthesis cache first (shared with ONNX path)
    const cached = await clientCache.getReply(message);
    if (cached) {
      console.info('[ChatRouter] Cache hit (IndexedDB)', { source: cached.source });
      this.messages.push({
        role: 'assistant',
        content: cached.content,
        timestamp: new Date().toISOString(),
        source: 'local-e2b',
        metadata: { routerDecision: decision },
      });
      clientCache.saveChatMessage(this._chatId, 'assistant', cached.content, {
        source: 'local-e2b',
        routerDecision: decision,
      });
      this.status = 'idle';
      this.lastSource = 'local-e2b';
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
      const { generateE2B } = await import('$lib/ai/gemma4-e2b-client.js');
      const history = this.messages
        .filter((m) => m.role !== 'system')
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      const result = await generateE2B(message, history);

      // Quality gate — evaluate before accepting
      const quality = evaluateSynthesisQuality(result.text, message);
      if (quality.shouldEscalate) {
        console.warn(`[ChatRouter] E2B quality low (${quality.score.toFixed(2)}): ${quality.reason}, escalating`);
        await this._handleServerInference(message, {
          ...decision,
          source: 'server-ollama',
          reason: `e2b-quality-low(${quality.reason})`,
        });
        return;
      }

      this.messages.push({
        role: 'assistant',
        content: result.text,
        timestamp: new Date().toISOString(),
        source: 'local-e2b',
        metadata: { routerDecision: decision },
      });

      await clientCache.putReply(message, result.text, 'local-e2b');
      clientCache.saveChatMessage(this._chatId, 'assistant', result.text, {
        source: 'local-e2b',
        routerDecision: decision,
      });

      this.status = 'idle';
      this.lastSource = 'local-e2b';
      this.lastConfidence = decision.confidence;
      this.debugInfo = {
        ...this.debugInfo,
        cacheHit: 'none',
        latencyMs: Math.round(performance.now() - t0),
        provider: `e2b(${result.tokPerSec}tok/s)`,
      };
      console.info(`[ChatRouter] E2B response: ${result.tokensGenerated} tokens in ${result.durationMs}ms (${result.tokPerSec} tok/s)`);
    } catch (err: any) {
      // E2B failed → fall back to 270M ONNX
      console.warn('[ChatRouter] E2B failed, falling back to ONNX:', err.message);
      await this._handleLocalInference(message, {
        ...decision,
        source: 'local-onnx',
        reason: `e2b-fallback(${decision.reason}): ${err.message}`,
      });
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
      clientCache.saveChatMessage(this._chatId, 'assistant', cached.content, {
        source: 'local-onnx',
        routerDecision: decision,
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
      clientCache.saveChatMessage(this._chatId, 'assistant', content, {
        source: 'local-onnx',
        routerDecision: decision,
      });

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

      // Step 2.5: Pre-retrieval confidence check — skip local if context too weak
      const retrievalSignals: RetrievalSignals = {
        ragTopScore: rawChunks[0]?.score ?? 0,
        ragHitCount: rawChunks.filter((c) => c.score >= 0.5).length,
        kagNeighborCount: ragData.kagNeighbors ?? 0,
        dagCacheHit: ragData.dagCached ?? false,
        kagGlossaryHits: ragData.glossaryHits ?? 0,
      };
      const retrievalConfidence = scoreRetrievalConfidence(retrievalSignals);
      console.info(`[ChatRouter] Retrieval confidence: ${retrievalConfidence.toFixed(2)}`, retrievalSignals);

      if (retrievalConfidence < 0.35) {
        console.info('[ChatRouter] Retrieval confidence too low, escalating to server');
        await this._handleServerInference(message, {
          ...decision,
          source: 'server-ollama',
          reason: `retrieval-confidence-low(${retrievalConfidence.toFixed(2)})`,
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

      // Step 4: Build RAG context for synthesis
      const topChunks = rankedChunks.slice(0, 3);
      const ragContext = topChunks
        .map((c, i) => `[Document ${i + 1}]: ${(c.text || c.snippet).slice(0, 800)}`)
        .join('\n\n');

      console.info(
        `[ChatRouter] Retrieval-hybrid: ${topChunks.length} chunks (confidence=${retrievalConfidence.toFixed(2)}), attempting local synthesis`
      );

      // Step 5: Try synthesis cache first (RAG-context-aware), then E2B/ONNX
      try {
        const synthResult = await synthesize(message, ragContext);

        if (synthResult.cached || (synthResult.text && synthResult.source !== 'local-onnx')) {
          // Cache hit or successful E2B generation — check quality
          if (synthResult.text) {
            const quality = evaluateSynthesisQuality(synthResult.text, message);
            if (quality.shouldEscalate) {
              console.warn(`[ChatRouter] Synthesis quality low (${quality.score.toFixed(2)}): ${quality.reason}, escalating`);
              await this._handleServerInference(message, {
                ...decision,
                source: 'server-ollama',
                reason: `retrieval-synthesis-quality-low(${quality.reason})`,
              });
              return;
            }

            const source: InferenceSource = synthResult.cached ? 'retrieval-hybrid' : 'local-e2b';
            this.messages.push({
              role: 'assistant',
              content: synthResult.text,
              timestamp: new Date().toISOString(),
              source,
              metadata: { routerDecision: decision, confidence: retrievalConfidence },
            });
            clientCache.saveChatMessage(this._chatId, 'assistant', synthResult.text, {
              source,
              routerDecision: decision,
            });
            this.status = 'idle';
            this.lastSource = source;
            this.lastConfidence = retrievalConfidence;
            this.debugInfo = {
              ...this.debugInfo,
              cacheHit: synthResult.cached ? 'synthesis' : 'none',
              latencyMs: Math.round(performance.now() - t0),
              provider: `retrieval-${synthResult.source}`,
            };
            console.info(`[ChatRouter] Retrieval synthesis: ${synthResult.source} in ${synthResult.durationMs}ms`);
            return;
          }
        }

        // Synthesis returned empty (E2B not ready, no cache) → fall through to ONNX
        const augmentedMessage = `Based on these legal documents:\n${ragContext}\n\nAnswer this question concisely: ${message}`;
        await this._handleLocalInference(augmentedMessage, {
          ...decision,
          source: 'retrieval-hybrid',
          reason: `retrieval(${topChunks.length}-chunks)+local-onnx`,
        });

        // Verify answer quality via quality schema — escalate if insufficient
        const lastMsg = this.messages[this.messages.length - 1];
        const postQuality = lastMsg?.role === 'assistant'
          ? evaluateSynthesisQuality(lastMsg.content, message)
          : null;
        if (postQuality?.shouldEscalate) {
          console.warn(`[ChatRouter] Retrieval answer quality low (${postQuality.score.toFixed(2)}): ${postQuality.reason}, escalating`);
          this.messages.pop();
          await this._handleServerInference(message, {
            ...decision,
            source: 'server-ollama',
            reason: `retrieval-escalated(${postQuality.reason})`,
          });
        } else {
          this.debugInfo = {
            ...this.debugInfo,
            latencyMs: Math.round(performance.now() - t0),
            provider: 'retrieval-hybrid',
          };
        }
      } catch {
        console.warn('[ChatRouter] Retrieval local synthesis failed, escalating to server');
        await this._handleServerInference(message, {
          ...decision,
          source: 'server-ollama',
          reason: `retrieval-fallback(synthesis-failed)`,
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
   * Agentic inference via /api/ai/agent (Gemma4 multi-round tool calling).
   * Routes complex/multi-hop queries through the 4-tool agent loop instead
   * of single-pass SSE. Falls back to SSE on failure.
   */
  private async _handleAgenticInference(
    message: string,
    decision: RouterDecision,
    options?: SendMessageOptions
  ) {
    const t0 = performance.now();
    this.status = 'thinking';
    this.error = null;

    this.abortController?.abort();
    this.abortController = new AbortController();

    const _qHash = shortHash(message);

    // Placeholder — shows "thinking" while agent runs multi-round loop
    const assistantIdx = this.messages.length;
    this.messages.push({
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      source: 'server-agentic',
      metadata: { routerDecision: decision, queryHash: _qHash, pipeline: 'agentic' },
    });

    try {
      const res = await fetch('/api/ai/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: message,
          pipeline: this._hasCaseContext ? 'case' : 'ace',
          sessionId: this._chatId,
        }),
        signal: this.abortController.signal,
      });

      if (!res.ok) {
        // Agent failed (rate limit, server error) → fall back to SSE
        console.warn(`[ChatRouter] Agent returned ${res.status}, falling back to SSE`);
        // Remove placeholder
        this.messages.splice(assistantIdx, 1);
        await this._handleServerInference(message, {
          ...decision,
          source: 'server-ollama',
          reason: decision.reason + '+agent-fallback',
        }, options);
        return;
      }

      const result: {
        answer: string;
        toolsUsed: string[];
        rounds: number;
        sources: unknown[];
        durationMs: number;
      } = await res.json();

      // Build tool attribution suffix
      const toolInfo = result.toolsUsed.length > 0
        ? `\n\n---\n*Agent used ${result.toolsUsed.join(', ')} over ${result.rounds} round${result.rounds !== 1 ? 's' : ''} (${(result.durationMs / 1000).toFixed(1)}s)*`
        : '';

      this.messages[assistantIdx] = {
        ...this.messages[assistantIdx],
        content: result.answer + toolInfo,
        source: 'server-agentic',
        metadata: {
          ...this.messages[assistantIdx].metadata,
          pipeline: 'agentic',
        },
      };

      this.status = 'idle';
      this.lastSource = 'server-agentic';
      this.debugInfo = {
        ...this.debugInfo,
        cacheHit: 'none',
        latencyMs: Math.round(performance.now() - t0),
        provider: `agent(${result.rounds}r,${result.toolsUsed.length}t)`,
      };

      // Persist to IndexedDB
      const finalMsg = this.messages[assistantIdx];
      if (finalMsg?.content) {
        clientCache.saveChatMessage(
          this._chatId,
          'assistant',
          finalMsg.content,
          buildPersistedMetadata(finalMsg, decision)
        );
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.warn('[ChatRouter] Agent error, falling back to SSE:', err.message);
      // Remove placeholder and fall back
      if (this.messages[assistantIdx]?.content === '') {
        this.messages.splice(assistantIdx, 1);
      }
      await this._handleServerInference(message, {
        ...decision,
        source: 'server-ollama',
        reason: decision.reason + '+agent-error',
      }, options);
    } finally {
      this.abortController = null;
      if (this.status === 'thinking') {
        this.status = 'idle';
      }
    }
  }

  /**
   * Server SSE inference via /api/sse/chat (Ollama gemma4-legal:latest + RAG).
   */
  private async _handleServerInference(
    message: string,
    decision: RouterDecision,
    options?: SendMessageOptions
  ) {
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
          attachmentSourceHash: options?.attachmentSourceHash || undefined,
          ...(this.currentRoute ? { currentRoute: this.currentRoute } : {}),
        }),
        signal: this.abortController.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Chat API error: ${res.status}`);
      }

      // Placeholder assistant message — updated as chunks arrive
      const assistantIdx = this.messages.length;
      const _qHash = shortHash(message);
      this.messages.push({
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        source: decision.source,
        metadata: { routerDecision: decision, queryHash: _qHash, pipeline: decision.source },
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
                  ...(chunk.glossaryMatches && {
                    glossaryMatches: chunk.glossaryMatches,
                  }),
                  ...(chunk.aceEval && {
                    aceEval: chunk.aceEval,
                  }),
                  ...(chunk.hyperedgeHash && {
                    hyperedgeHash: chunk.hyperedgeHash,
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
        clientCache.saveChatMessage(
          this._chatId,
          'assistant',
          finalMsg.content,
          buildPersistedMetadata(finalMsg, decision)
        );
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

  /**
   * Record user feedback on a response (thumbs up/down).
   * Adjusts local synthesis quality thresholds over time.
   *
   * @param messageIndex — Index of the assistant message in this.messages
   * @param helpful — Whether the user found the response helpful
   */
  async rateFeedback(messageIndex: number, helpful: boolean): Promise<void> {
    const msg = this.messages[messageIndex];
    if (!msg || msg.role !== 'assistant') return;

    const source = msg.source ?? this.lastSource;
    const queryMsg = this.messages.slice(0, messageIndex).reverse().find((m) => m.role === 'user');
    const queryHash = msg.metadata?.queryHash
      ?? (queryMsg?.content ? shortHash(queryMsg.content) : shortHash(String(messageIndex)));

    await recordFeedback({
      queryHash,
      helpful,
      source,
      ts: Date.now(),
    });

    console.info(`[ChatSession] Feedback recorded: ${helpful ? 'helpful' : 'unhelpful'} for ${source}`);
  }

  /** Get current inference pipeline status for debug UI. */
  getInferenceStatus() {
    return {
      e2bReady: isE2BReady(),
      lastSource: this.lastSource,
      lastConfidence: this.lastConfidence,
      qualityThresholds: getThresholds(),
      debugInfo: this.debugInfo,
    };
  }

  destroy() {
    this.abortController?.abort();
    this.abortController = null;
    this.connectionStatus = 'disconnected';
  }
}
