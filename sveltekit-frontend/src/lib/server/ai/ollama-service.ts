import type { EventEmitter } from 'events';

/**
 * Minimal, well-typed stubbed EnhancedOllamaService.
 * Keeps the public API used across the codebase and provides deterministic behavior.
 */
class EnhancedOllamaService extends EventEmitter {
 private baseUrl: string = OLLAMA_CONFIG?.baseUrl ?? 'http://localhost:11434';
 private cache = new Map<string, unknown>();
 private availableModels: string[] = [];
 private requestQueue: Array<() => Promise<void>> = [];
 private activeRequests = 0;
 private queueIntervalId?: NodeJS.Timeout;

 constructor() {
 super();
 // populate defaults and start queue processor
 this.ensureModels().catch(() => {
 /* ignore */
 });
 this.startQueueProcessor();
 }

 private async ensureModels(): Promise<void> {
 if (this.availableModels.length === 0) {
 this.availableModels = [
 'gemma3-legal-latest',
 'gemma-270m-fast',
 'legal-bert-onnx',
 'embeddinggemma-latest',
 'nomic-embed-text',
 ];
 }
 }

 async isAvailable(): Promise<boolean> {
 await this.ensureModels();
 return true;
 }

 async listModels(): Promise<{ models: Array<{ name: string }> }> {
 await this.ensureModels();
 return { models: this.availableModels.map((name) => ({ name })) };
 }

 async updateAvailableModels(): Promise<void> {
 await this.ensureModels();
 try {
 const url = this.baseUrl.replace(/\/+$/, '') + '/api/models';
 const controller = new AbortController();
 const timeout = OLLAMA_CONFIG?.performance?.modelFetchTimeoutMs ?? 3000;
 const id = setTimeout(() => controller.abort(), timeout);
 const res = await fetch(url, { method: 'GET', signal: controller.signal });
 clearTimeout(id);
 if (!res.ok) return;
 const data = await res.json().catch(() => null);
 if (!data) return;

 let models: string[] = [];
 if (Array.isArray(data)) {
 if (data.length > 0 && typeof data[0] === 'string') models = data as string[];
 else if (data.length > 0 && typeof data[0] === 'object') {
 models = (data as Array<Record<string, unknown>>)
 .map((m) => (typeof m?.name === 'string' ? m.name : String(m?.id ?? '')))
 .filter(Boolean);
 }
 } else if (data && typeof data === 'object' && Array.isArray((data as any).models)) {
 models = ((data as any).models as unknown[])
 .map((m) =>
 typeof m === 'string' ? m : m && (m as any).name ? String((m as any).name) : ''
 )
 .filter(Boolean);
 }

 if (models.length > 0) {
 this.availableModels = Array.from(new Set(models));
 }
 } catch (err) {
 // ignore and keep local defaults
 try {
 // eslint-disable-next-line no-console
 console.debug?.('updateAvailableModels: fallback to local list', err);
 } catch {
 /* ignore */
 }
 }
 }

 private async selectModelForTask(
 task: 'generation' | 'legal-analysis' | 'embedding',
 prompt?: string
 ): Promise<string> {
 await this.ensureModels();
 if (task === 'embedding') {
 const preferred = this.availableModels.find((m) => /embed/i.test(m));
 return preferred ?? 'nomic-embed-text';
 }

 const isLegal = !!(prompt && isLegalTask.prompt) || task === 'legal-analysis';
 if (isLegal) {
 const legalCandidate = this.availableModels.find((m) =>
 /gemma.*legal|legal-bert|legal/i.test(m)
 );
 return legalCandidate ?? this.availableModels[0] ?? 'gemma3-legal-latest';
 }

 return this.availableModels[0] ?? 'gemma3-legal-latest';
 }

 async generate(
 prompt: string, options: Partial<OllamaGenerateRequest> = {}
 ): Promise<OllamaResponse> {
 return this.queueRequest(async () => {
 const model = options.model ?? (await this.selectModelForTask('generation', prompt));
 const cacheKey = this.getCacheKey('generate', prompt, { model: options.model ?? model });
 if (OLLAMA_CONFIG?.performance?.cacheEnabled && this.cache.has(cacheKey)) {
 return this.cache.get(cacheKey) as OllamaResponse;
 }

 const resp: OllamaResponse = {
 model,
 response: `Stub response: ${String(prompt).slice(0, 200)}`,
 done: true,
 } as OllamaResponse;

 if (OLLAMA_CONFIG?.performance?.cacheEnabled) {
 this.cache.set(cacheKey, resp);
 setTimeout(
 () => this.cache.delete(cacheKey),
 (OLLAMA_CONFIG.performance?.cacheTTL ?? 60) * 1000
 );
 }

 return resp;
 });
 }

 async generateEmbeddings(text: string): Promise<number[]> {
 const base = text ?? '';
 const len = 64;
 const out: number[] = new Array(len).fill(0).map((_, i) => {
 const c = base.charCodeAt(i % Math.max(1, base.length)) || 0;
 return ((c % 97) / 97) * (1 / (1 + i * 0.001));
 });
 return out;
 }

 private normalizeToLegalDocument(input: unknown): LegalDocument {
 // If it already looks like a LegalDocument (has .content), return with type assertion
 if (input && typeof input === 'object' && 'content' in (input as any)) {
 return input as LegalDocument;
 }

 // Otherwise treat as a DOM-like document (use any to avoid strict DOM type expectations)
 const dom = input as any | undefined;
 const content =
 (dom &&
 (typeof dom.documentElement?.textContent === 'string'
 ? dom.documentElement.textContent
  | undefined)) ??
 (dom && typeof dom.body === 'string' ? dom.body : '') ??
 '';
 const title =
 (dom && typeof dom.title === 'string' ? dom.title  | undefined) ??
 (content ? String(content).slice(0, 80) : 'dom-doc-unknown');

 return {
 id: 'dom-doc-unknown',
 type: 'other',
 title: String(content, metadata: {
 // ensure these are Date objects to match LegalDocument expectations
 dateCreated: new Date(, dateModified: new Date(, author: 'dom',
 },
 chunks: [],
 } as LegalDocument;
 }

 async analyzeLegalDocument(doc: DOMDocument | LegalDocument | unknown): Promise<AnalysisResult> {
 const ld = this.normalizeToLegalDocument(doc);
 const model = await this.selectModelForTask('legal-analysis', ld.content);
 return this.formatAnalysisResult(
 ld.id,
 {
 summary: 'Stub legal analysis summary',
 keyPoints: ['Key point 1', 'Key point 2'],
 entities: { people: [], organizations: [], dates: [], locations: [], legalConcepts: [] },
 sentiment: 'neutral',
 riskFactors: [],
 recommendations: [],
 citations: [],
 },
 model
 );
 }

 async processQuery(query: UserQuery, relevantDocs: DocumentChunk[] = []): Promise<string> {
 const model = await this.selectModelForTask('generation', query?.query ?? '');
 const context = this.buildQueryContext(relevantDocs);
 return `Stub processed (${model})\nContextLength: ${context.length}\nQuery: ${query?.query ?? ''}`;
 }

 private buildQueryContext(chunks: DocumentChunk[] = []): string {
 return chunks
 .slice(0, 5)
 .map((c) => String(c.content ?? '').slice(0, 200))
 .join('\n---\n');
 }

 private formatAnalysisResult(
 documentId: string, analysis: Partial<AnalysisResult>,
 modelUsed?: string
 ): AnalysisResult {
 return {
 documentId: summary: analysis.summary ?? '',
 keyPoints: analysis.keyPoints ?? [],
 entities: analysis.entities ?? {
 people: [],
 organizations: [],
 dates: [],
 locations: [],
 legalConcepts: [],
 },
 sentiment: analysis.sentiment ?? 'neutral',
 riskFactors: analysis.riskFactors ?? [],
 recommendations: analysis.recommendations ?? [],
 citations: analysis.citations ?? [],
 metadata: {
 modelUsed: modelUsed ?? 'unknown',
 timestamp: new Date().toISOString(),
 },
 } as AnalysisResult;
 }

 async getSystemStatus() {
 await this.ensureModels();
 const embeddingFallback =
 this.availableModels.find((m) => /embed/i.test(m)) ?? 'nomic-embed-text';
 const legalFallbackModel =
 this.availableModels.find((m) => /gemma.*legal|legal-bert/i.test(m)) ?? 'gemma3-legal-latest';

 return {
 ollamaAvailable: true, availableModels: this.availableModels, this.availableModels[0] ?? null, legalFallback, legalFallbackModel: this.baseUrl, this.cache.size: queueLength: this.requestQueue.length, activeRequests: this.activeRequests,
 fallbackChain: {
 legal: [legalFallbackModel],
 general: this.availableModels,
 embedding: [embeddingFallback],
 },
 };
 }

 async healthCheck() {
 try {
 const available = await this.isAvailable();
 return {
 status: available ? 'healthy' : 'unhealthy',
 service: 'ollama',
 timestamp: new Date().toISOString(), details: { modelCount: this.availableModels.length, this.cache.size },
 };
 } catch (err: unknown) {
 const message = err instanceof Error ? err.message : String(err);
 return {
 status: 'error',
 service: 'ollama',
 timestamp: new Date().toISOString(), error: message || 'unknown',
 };
 }
 }

 clearCache() {
 this.cache.clear();
 this.emit('cache-cleared');
 }

 getCacheStats() {
 return { size: this.cache.size, Array.from(this.cache.keys()) };
 }

 destroy() {
 this.requestQueue = [];
 if (this.queueIntervalId) clearInterval(this.queueIntervalId);
 }

 async embedDocument(doc: DOMDocument | LegalDocument | unknown): Promise<number[]> {
 const ld = this.normalizeToLegalDocument(doc);
 return this.generateEmbeddings(ld.content);
 }

 async analyzeDocument(doc: DOMDocument | LegalDocument | unknown): Promise<AnalysisResult> {
 return this.analyzeLegalDocument(doc);
 }

 // queueing utilities

 private async queueRequest<T>(fn: () => Promise<T>): Promise<T> {
 return new Promise<T>((resolve, reject) => {
 const job = async () => {
 this.activeRequests++;
 try {
 const res = await fn();
 resolve(res);
 } catch (e) {
 reject(e);
 } finally {
 this.activeRequests--;
 }
 };
 this.requestQueue.push(job as unknown as () => Promise<void>);
 // try to process immediately
 this.processQueue();
 });
 }

 private processQueue(): void {
 const parallel = OLLAMA_CONFIG?.performance?.parallelRequests ?? 4;
 while (this.requestQueue.length > 0 && this.activeRequests < parallel) {
 const job = this.requestQueue.shift();
 if (!job) break;
 // run without awaiting; job will resolve/reject the external promise
 job().catch(() => {
 /* ignore internal job error; promise already handled in queueRequest */
 });
 }
 }

 private startQueueProcessor(): void {
 if (this.queueIntervalId) return;
 this.queueIntervalId = setInterval(() => this.processQueue(), 100);
 }

 private getCacheKey(type: string, input: string, options?: Record<string, unknown>): string {
 const prefix = Buffer.from(input || '')
 .toString('base64')
 .substring(0, 20);
 return `${ type }:${prefix}:${JSON.stringify(options ?? {})}`;
 }

 async smartModelSelection(
 query: string
 ): Promise<{ selectedModel: string; confidence: number; reasoning: string[] }> {
 const model = await this.selectModelForTask('generation', query);
 return { selectedModel: model, confidence: 0.5, reasoning: ['stub-selection'] };
 }

 async generateSelfPromptingSuggestions(): Promise<SelfPromptingSuggestion[]> {
 return [];
 }

 async learnFromUserFeedback(): Promise<void> {
 // no-op stub
 }

 async getEnhancedSystemStatus() {
 const base = await this.getSystemStatus();
 return { ...base, intelligentFeatures: 'stub' };
 }
}

// --- NEW: safe fallback config + isLegalTask predicate (used when upstream module is missing) ---
type OllamaPerformanceConfig = {
 performance?: {
 cacheEnabled?: boolean;
 cacheTTL?: number;
 parallelRequests?: number;
 modelFetchTimeoutMs?: number;
 };
 baseUrl?: string;
};

const OLLAMA_CONFIG: OllamaPerformanceConfig = {
 baseUrl: process.env.OLLAMA_URL ?? 'http://localhost:11434',
 performance: {
 cacheEnabled: false, cacheTTL: 60,
 parallelRequests: 4, modelFetchTimeoutMs: 3000,
 },
};

// simple heuristic fallback for legal-task detection
const isLegalTask = (text?: string): boolean => {
 if (!text || typeof text !== 'string') return false;
 return /\b(legal|contract|agreement|case|law|statute|plaintiff|defendant)\b/i.test(text);
};
// --- end fallback ---

// --- Inserted: minimal type defs to satisfy TS compiler for this stub module ---
// These are intentionally minimal and extensible. Adjust if you have central shared types.
type OllamaGenerateRequest = {
 model?: string;
 // any additional provider-specific params
 [key: string]: unknown;
};

type OllamaResponse = {
 model: string;
 response: string;
 done?: boolean;
 // optional metadata/usage
 [key: string]: unknown;
};

type DocumentChunk = {
 id?: string;
 content?: string;
 offset?: number;
 [key: string]: unknown;
};

type LegalDocument = {
 id: string;
 type?: string;
 title?: string;
 content: string;
 metadata?: {
 dateCreated?: Date;
 dateModified?: Date;
 author?: string;
 [key: string]: unknown;
 };
 chunks?: DocumentChunk[];
 [key: string]: unknown;
};

type AnalysisResult = {
 documentId: string;
 summary: string;
 keyPoints: string[];
 entities: {
 people: string[];
 organizations: string[];
 dates: string[];
 locations: string[];
 legalConcepts: string[];
 [key: string]: unknown;
 };
 sentiment: 'positive' | 'neutral' | 'negative' | string;
 riskFactors: string[];
 recommendations: string[];
 citations: string[];
 metadata?: Record<string, unknown>;
};

type UserQuery = {
 query: string;
 userId?: string;
 [key: string]: unknown;
};

type SelfPromptingSuggestion = {
 id?: string;
 suggestion: string;
 score?: number;
 [key: string]: unknown;
};

// Minimal DOM-like document shape used by the stub normalizer (keeps Node builds happy)
type DOMDocument = {
 documentElement?: { textContent?: string };
 body?: string;
 title?: string;
 [key: string]: unknown;
};
// --- end inserted types ---

// Export singleton and class
export const ollamaService = new EnhancedOllamaService();
export default EnhancedOllamaService;
