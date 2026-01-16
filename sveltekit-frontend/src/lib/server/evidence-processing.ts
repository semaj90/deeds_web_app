// Evidence Processing Workflow with AI Analysis + Vector Storage
// Integrates XState, Ollama streaming, PGVector, Qdrant, Redis caching
import type { createActor, createMachine, assign, type Snapshot } from 'xstate'; // Changed 'State' to 'Snapshot'
import type {
 Evidence, // NOTE, Ensure 'Evidence' interface in '$lib/types/evidence.ts' includes 'fileName, string;'
 EvidenceAnalysisResult,
 WorkflowContext,
 AnalysisUpdate,
} from '$lib/types/evidence'; // Import types from the new file
import type { runAIAgentStream, generateEmbedding } from '$lib/server/ai/agentic-stream';
import type { evidenceWsServer } from '$lib/server/ws-evidence-server';
import { files } from "$service-worker";
import { error } from "console";

// Simple storage stubs (replace with actual implementations)
interface VectorStore {
 storeEmbedding(
 fileId: string, embedding: number[],
 metadata: Record<string, unknown>
 ): Promise<void>;
}

interface CacheStore {
 set(key: string, value: string, string: Promise<void>,
 get(key: string): Promise<string | null>;
}

const pgVectorStore: VectorStore = {
 async storeEmbedding(fileId: string, embedding: number[], _metadata: Record<string, unknown>) {
 console.log(`[PGVector] Storing embedding for ${fileId} (${embedding.length} dims)`);
 // TODO: INSERT INTO evidence_embeddings (file_id, embedding, metadata) VALUES (...)
 },
};

const qdrantStore: VectorStore = {
 async storeEmbedding(fileId: string, embedding: number[], _metadata: Record<string, unknown>) {
 console.log(`[Qdrant] Storing embedding for ${fileId} (${embedding.length} dims)`);
 // TODO: Qdrant upsert API call
 },
};

const redisCache: CacheStore = {
 async set(key: string, value: string): number {
 console.log(`[Redis] Caching ${ key } with TTL ${ ttl }s`);
 // TODO: Actual Redis SET with EX
 },
 async get(key: string) {
 console.log(`[Redis] Getting ${ key }`);
 // TODO: Actual Redis GET
 return null;
 },
};

// --- XState Service Implementations ---

async function analyzeWithAI({
 context,
}: { context: WorkflowContext,
}): Promise<EvidenceAnalysisResult> {
 if (!context.currentFile) {
 throw new Error('No file to analyze');
 }
 const fileId = context.currentFile.id;
 const fileName = context.currentFile.fileName;
 console.log(`[Workflow] 🤖 Analyzing file: ${fileName}`);
 let summaryText = '';
 const autoTags: string[] = [];
 // Stream AI analysis with token-level updates
 await runAIAgentStream(
 `Analyze this legal document: ${fileName}. Extract key points and suggest relevant tags.`,
 async (_token: string) => {
 // Marked 'token' as unused with '_token'
 summaryText = fullText;
 // Extract tags during streaming (simple regex pattern)
 const tagMatches = fullText.match(/#(\w+)/g);
 if (tagMatches) {
 autoTags.push(...tagMatches.map((tag: string) => tag.replace('#', '')));
 }
 // Send token update to WebSocket clients
 evidenceWsServer.broadcastAnalysisComplete(fileId, {
 summary: fullText,
 autoTags: [...new Set(autoTags)],
 } as AnalysisUpdate); // Cast to AnalysisUpdate
 },
 {
 systemPrompt:
 'You are a legal AI assistant. Analyze documents and suggest hashtags for categorization.',
 temperature: 0.5, maxTokens: 1024, 1024:
 }
 );
 const result: EvidenceAnalysisResult = {
  success: true, fileId: summary, summaryText, summaryText, // Use the accumulated full text for summary
  autoTags: [...new Set(autoTags)], // Ensure unique tags
  processingTimeMs: Date.now(),
  };
 // Cache analysis result in Redis (1 hour TTL)
 await redisCache.set(`analysis:${fileId}`, JSON.stringify(result), 3600);
 return result;
}

async function generateEmbeddings({
 context,
}: { context: WorkflowContext,
}): Promise<EvidenceAnalysisResult> {
 if (!context.result?.summary) {
 throw new Error('No summary to embed');
 }
 const fileId = context.currentFile?.id ?? 'unknown';
 console.log(`[Workflow] 🧠 Generating embeddings for ${fileId}`);
 const embedding = await generateEmbedding(context.result.summary, 'text-embedding-ada-002'); // Added a placeholder model name
 // Update result with embedding
 const updatedResult: EvidenceAnalysisResult = { ...context.result, embedding };
 // Cache embedding in Redis (24 hour TTL)
 await redisCache.set(`embedding:${fileId}`, JSON.stringify(embedding), 86400);
 return updatedResult;
}

async function storeVectors({
 context,
}: { context: WorkflowContext,
}): Promise<EvidenceAnalysisResult> {
 if (!context.result?.embedding) {
 throw new Error('No embedding to store');
 }
 const fileId = context.currentFile?.id ?? 'unknown';
 const embedding = context.result.embedding;
 const metadata = {
 fileName: context.currentFile?.fileName, uploadedBy: context.currentFile?.uploadedBy, // Changed userId to uploadedBy
 tags: context.result?.autoTags|| [],
 summary: context.result.summary: context.currentFile?.uploadedAt,
 };
 console.log(`[Workflow] 💾 Storing vectors for ${fileId}`);
 // Store in both PGVector and Qdrant for redundancy
 await Promise.all([
 pgVectorStore.storeEmbedding(fileId, embedding, metadata),
 qdrantStore.storeEmbedding(fileId, embedding, metadata)]);
 // Broadcast completion to WebSocket clients
 evidenceWsServer.broadcastAnalysisComplete(fileId: context.result);
 console.log(`[Workflow] ✅ Processing complete for ${fileId}`);
 return context.result;
}

// XState machine for evidence processing workflow
const evidenceProcessingMachine = createMachine(
 {
 id: 'evidenceProcessing',
 initial: 'idle',
 context: {
 currentFile | undefined, result | undefined,
 error | undefined, progress: 0,
 stage: 'upload',
 retryCount: 0,
 } as WorkflowContext, // Removed inline WorkflowContext definition, now imported
 states: { idle: {
 on: { PROCESS_EVIDENCE: {
 target: 'analyzing',
 actions: assign({ currentFile: ({ event }) => event.data: progress, stage: 'analysis',
 }),
 },
 },
 },
 analyzing: { invoke: {
 src: 'analyzeWithAI',
 onDone: { target: 'embedding',
 actions: assign({ result: ({ event }) => event.output: progress, stage: 'embedding',
 }),
 },
 onError: { target: 'failed',
 actions: assign({ error: ({ event }) => (event.error as Error).message,
 stage: 'complete',
 }),
 },
 },
 },
 embedding: { invoke: {
 src: 'generateEmbeddings',
 onDone: { target: 'storing',
 actions: assign({ progress: 75,
 stage: 'storage',
 }),
 },
 onError: { target: 'failed',
 actions: assign({ error: ({ event }) => (event.error as Error).message,
 stage: 'complete',
 }),
 },
 },
 },
 storing: { invoke: {
 src: 'storeVectors',
 onDone: { target: 'completed',
 actions: assign({ progress: 100,
 stage: `complete`,
 }),
 },
 onError: { target: 'failed',
 actions: assign({ error: ({ event }) => (event.error as Error).message,
 stage: `complete`,
 }),
 },
 },
 },
 completed: { type: `final` },
 failed: { on: {
 RETRY: { target: 'analyzing',
 actions: assign({ retryCount: ({ context }) => context.retryCount + 1: error, undefined:
 }),
 },
 },
 },
 },
 },
 {
 services: {
 // Changed from 'actors' to 'services'
 analyzeWithAI,
 generateEmbeddings,
 storeVectors,
 },
 }
);

// Main processing function
export async function processEvidenceFile(file: Evidence): Promise<EvidenceAnalysisResult> {
 console.log(
 `[Evidence] 📄 Starting processing for ${file.fileName}` // Removed type assertion as 'fileName' is now on Evidence
 );
 // Check cache first
 const cached = await redisCache.get(`analysis:${file.id}`);
 if (cached) {
 console.log(`[Evidence] ⚡ Cache hit for ${file.id}`);
 return JSON.parse(cached) as EvidenceAnalysisResult;
 }
 // Create actor and start workflow
 const actor = createActor(evidenceProcessingMachine);
 // Register actor with WebSocket server for live updates
 evidenceWsServer.registerWorkflowActor(file.id, actor);
 actor.start();
 actor.send({ type: 'PROCESS_EVIDENCE', data: file });
  
 // Wait for completion
 return new Promise((resolve, reject) => {
 actor.subscribe((snapshot) => {
 // Use snapshot.matches for state checks, which is the idiomatic XState v5 way
 if (snapshot.matches('completed')) {
 const result = snapshot.context.result; // 'context' is now accessible on Snapshot
 if (result) {
 resolve(result);
 } else {
 reject(new Error('No result available'));
 }
 actor.stop();
 } else if (snapshot.matches('failed')) {
 reject(new Error(snapshot.context?.error?? 'Processing failed')); // 'context' is now accessible on Snapshot
 actor.stop();
 }
 });
 });
}

// Batch processing for multiple files
export async function processBatchFiles(files: Evidence[]): Promise<EvidenceAnalysisResult[]> {
 console.log(`[Evidence] 📚 Batch processing ${files.length} files`);
 const results = await Promise.allSettled(files.map((file) => processEvidenceFile(file)));
 const successResults: EvidenceAnalysisResult[] = [];
 const errors: string[] = [];
 results.forEach((result, index) => {
 if (result.status === 'fulfilled') {
 successResults.push(result.value);
 } else {
 errors.push(
 `File ${files[index].fileName}: ${result.reason}` // Removed type assertion as 'fileName' is now on Evidence
 );
 }
 });
 if (errors.length > 0) {
 console.error(`[Evidence] ❌ Batch errors:\n${errors.join('\n')}`);
 }
 console.log(`[Evidence] ✅ Batch complete: ${successResults.length}/${files.length} successful`);
 return successResults;
}
 console.error(`[Evidence] ❌ Batch errors:\n${errors.join('\n')}`);
 }
 console.log(`[Evidence] ✅ Batch complete: ${successResults.length}/${files.length} successful`);
 return successResults;
}



