# Audio-to-Knowledge Pipeline Architecture

**Date**: April 12, 2026
**Status**: DESIGN COMPLETE ✅
**Integration**: Sprint 4B.4-4B.6 extended for audio processing

---

## Overview

Complete pipeline for converting audio evidence (depositions, witness statements, court recordings) into searchable, analyzable knowledge with real-time UX updates.

```
Audio Upload (Client)
  ↓
WebSocket/SSE Progress Stream ← Concurrent UX updates
  ↓
RabbitMQ audio.process Queue (Server)
  ↓
Whisper Base CUDA (Multi-lingual ASR)
  ↓
SIMD JSON Parsing (Fast text normalization)
  ↓
LangExtract Entity Extraction (Names, dates, money, citations)
  ↓
ACE Quality Analysis + Summary Generation
  ↓
Qdrant Embedding + Indexing (with tags)
  ↓
JSONB Metadata Storage (PostgreSQL evidence.metadata)
  ↓
KAG/DAG Graph Integration (Neo4j + CouchDB cache)
  ↓
Bifrost L2 / Redis L1 Cache Decision (based on query type)
  ↓
SSE Chat Context Available (audio transcript + entities + summary)
```

---

## 1. Audio Upload + Progress Streaming (Client → Server)

### Client: XState v5 Audio Upload Machine

**File**: `src/lib/machines/audio-upload-machine.ts` (NEW)

```typescript
import { setup, fromPromise } from 'xstate';
import type { EventObject } from 'xstate';

export interface AudioUploadContext {
  file: File | null;
  uploadProgress: number;
  transcriptionProgress: number;
  analysisProgress: number;
  evidenceId: string | null;
  transcription: string | null;
  entities: any[];
  summary: string | null;
  error: string | null;
}

type AudioUploadEvent =
  | { type: 'UPLOAD_FILE'; file: File }
  | { type: 'PROGRESS_UPDATE'; stage: string; progress: number }
  | { type: 'CANCEL' }
  | { type: 'RETRY' };

export const audioUploadMachine = setup({
  types: {
    context: {} as AudioUploadContext,
    events: {} as AudioUploadEvent
  },
  actors: {
    uploadAudio: fromPromise(async ({ input }: { input: File }) => {
      const formData = new FormData();
      formData.append('audio', input);
      formData.append('caseId', 'CASE-2024-001'); // From current case context

      const res = await fetch('/api/audio/upload', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Upload failed');
      return res.json();
    }),

    // SSE connection for real-time progress
    progressStream: fromPromise(async ({ input }: { input: string }) => {
      const eventSource = new EventSource(`/api/audio/progress/${input}`);

      return new Promise((resolve, reject) => {
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);

          if (data.stage === 'complete') {
            eventSource.close();
            resolve(data);
          }

          // Emit progress updates (handled by parent machine)
          window.dispatchEvent(new CustomEvent('audio:progress', { detail: data }));
        };

        eventSource.onerror = () => {
          eventSource.close();
          reject(new Error('SSE connection failed'));
        };
      });
    })
  }
}).createMachine({
  id: 'audioUpload',
  initial: 'idle',
  context: {
    file: null,
    uploadProgress: 0,
    transcriptionProgress: 0,
    analysisProgress: 0,
    evidenceId: null,
    transcription: null,
    entities: [],
    summary: null,
    error: null
  },
  states: {
    idle: {
      on: {
        UPLOAD_FILE: {
          target: 'uploading',
          actions: ({ context, event }) => {
            context.file = event.file;
          }
        }
      }
    },
    uploading: {
      invoke: {
        src: 'uploadAudio',
        input: ({ context }) => context.file!,
        onDone: {
          target: 'streaming',
          actions: ({ context, event }) => {
            context.evidenceId = event.output.evidenceId;
          }
        },
        onError: {
          target: 'error',
          actions: ({ context, event }) => {
            context.error = event.error.message;
          }
        }
      }
    },
    streaming: {
      invoke: {
        src: 'progressStream',
        input: ({ context }) => context.evidenceId!,
        onDone: {
          target: 'complete',
          actions: ({ context, event }) => {
            context.transcription = event.output.transcription;
            context.entities = event.output.entities;
            context.summary = event.output.summary;
          }
        },
        onError: {
          target: 'error',
          actions: ({ context, event }) => {
            context.error = event.error.message;
          }
        }
      },
      on: {
        PROGRESS_UPDATE: {
          actions: ({ context, event }) => {
            if (event.stage === 'transcription') {
              context.transcriptionProgress = event.progress;
            } else if (event.stage === 'analysis') {
              context.analysisProgress = event.progress;
            }
          }
        },
        CANCEL: 'cancelled'
      }
    },
    complete: {
      type: 'final'
    },
    error: {
      on: {
        RETRY: 'uploading',
        CANCEL: 'idle'
      }
    },
    cancelled: {
      on: {
        UPLOAD_FILE: 'uploading'
      }
    }
  }
});
```

### Client: Audio Upload Component

**File**: `src/lib/components/chat/AudioUploadWidget.svelte` (NEW)

```svelte
<script lang="ts">
  import { useMachine } from '$lib/utils/xstate-svelte5';
  import { audioUploadMachine } from '$lib/machines/audio-upload-machine';
  import Icon from '$lib/components/ui/Icon.svelte';

  let fileInput = $state<HTMLInputElement | null>(null);

  const { snapshot, send } = useMachine(audioUploadMachine);

  const isUploading = $derived(snapshot.matches('uploading'));
  const isProcessing = $derived(snapshot.matches('streaming'));
  const isComplete = $derived(snapshot.matches('complete'));
  const hasError = $derived(snapshot.matches('error'));

  const totalProgress = $derived(
    (snapshot.context.uploadProgress * 0.2) +
    (snapshot.context.transcriptionProgress * 0.5) +
    (snapshot.context.analysisProgress * 0.3)
  );

  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];

    if (file && file.type.startsWith('audio/')) {
      send({ type: 'UPLOAD_FILE', file });
    }
  }

  // Listen for SSE progress events
  $effect(() => {
    if (!browser) return;

    const handler = (event: CustomEvent) => {
      send({
        type: 'PROGRESS_UPDATE',
        stage: event.detail.stage,
        progress: event.detail.progress
      });
    };

    window.addEventListener('audio:progress', handler as EventListener);
    return () => window.removeEventListener('audio:progress', handler as EventListener);
  });
</script>

<div class="audio-upload-widget">
  {#if !isUploading && !isProcessing}
    <button class="upload-trigger" onclick={() => fileInput?.click()}>
      <Icon name="mic" size={20} />
      <span>Upload Audio Evidence</span>
    </button>
    <input
      bind:this={fileInput}
      type="file"
      accept="audio/*"
      style="display: none;"
      onchange={handleFileSelect}
    />
  {:else if isUploading}
    <div class="progress-card">
      <div class="progress-stage">
        <Icon name="upload" size={16} />
        <span>Uploading audio...</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: {snapshot.context.uploadProgress}%"></div>
      </div>
    </div>
  {:else if isProcessing}
    <div class="progress-card">
      <div class="progress-stage">
        <Icon name="loader-2" size={16} class="spin" />
        <span>Processing audio...</span>
      </div>

      <!-- Transcription progress -->
      <div class="sub-progress">
        <span class="sub-label">Transcribing (Whisper CUDA)</span>
        <div class="progress-bar small">
          <div class="progress-fill" style="width: {snapshot.context.transcriptionProgress}%"></div>
        </div>
      </div>

      <!-- Analysis progress -->
      <div class="sub-progress">
        <span class="sub-label">Analyzing (LangExtract + ACE)</span>
        <div class="progress-bar small">
          <div class="progress-fill" style="width: {snapshot.context.analysisProgress}%"></div>
        </div>
      </div>

      <div class="overall-progress">
        {Math.round(totalProgress)}% complete
      </div>
    </div>
  {:else if isComplete}
    <div class="result-card">
      <div class="result-header">
        <Icon name="check-circle" size={20} class="success" />
        <span>Audio processed successfully</span>
      </div>

      <div class="result-summary">
        <p><strong>Transcript:</strong> {snapshot.context.transcription?.slice(0, 100)}...</p>
        <p><strong>Entities:</strong> {snapshot.context.entities.length} extracted</p>
        <p><strong>Summary:</strong> {snapshot.context.summary?.slice(0, 80)}...</p>
      </div>

      <button class="view-details" onclick={() => /* Navigate to evidence detail */ {}}>
        View Full Analysis
      </button>
    </div>
  {:else if hasError}
    <div class="error-card">
      <Icon name="alert-triangle" size={20} />
      <p>{snapshot.context.error}</p>
      <button onclick={() => send({ type: 'RETRY' })}>Retry</button>
    </div>
  {/if}
</div>

<style>
  /* Styling omitted for brevity — use theme CSS variables */
</style>
```

---

## 2. RabbitMQ Audio Processing Queue (Server)

### Queue Publisher

**File**: `src/routes/api/audio/upload/+server.ts` (NEW)

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rabbitmq } from '$lib/server/queue/rabbitmq-manager-fixed.js';
import { db } from '$lib/server/db/client.js';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { v4 as uuidv4 } from 'uuid';
import { getRedis } from '$lib/server/redis.js';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const audioFile = formData.get('audio') as File;
  const caseId = formData.get('caseId') as string;

  if (!audioFile || !caseId) {
    return json({ error: 'Missing audio file or caseId' }, { status: 400 });
  }

  // 1. Upload to MinIO
  const evidenceId = uuidv4();
  const minioPath = `audio/${caseId}/${evidenceId}.${audioFile.name.split('.').pop()}`;

  // TODO: Actual object storage upload (omitted for brevity)

  // 2. Create evidence record
  await db.insert(evidence).values({
    id: evidenceId,
    caseId,
    title: audioFile.name,
    evidenceType: 'audio',
    fileName: audioFile.name,
    minioPath,
    uploadedBy: locals.user.id,
    metadata: {
      size: audioFile.size,
      mimeType: audioFile.type,
      processingStatus: 'queued'
    }
  });

  // 3. Publish to RabbitMQ audio.process queue
  await rabbitmq.publishAudioProcess({
    evidenceId,
    caseId,
    minioPath,
    userId: locals.user.id
  });

  // 4. Initialize Redis progress tracking
  const redis = getRedis();
  await redis.hset(`audio:progress:${evidenceId}`, {
    uploadProgress: 100,
    transcriptionProgress: 0,
    analysisProgress: 0,
    stage: 'queued'
  });

  return json({ evidenceId, status: 'queued' });
};
```

### SSE Progress Endpoint

**File**: `src/routes/api/audio/progress/[evidenceId]/+server.ts` (NEW)

```typescript
import type { RequestHandler } from './$types';
import { getRedis } from '$lib/server/redis.js';

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { evidenceId } = params;
  const redis = getRedis();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Poll Redis every 500ms for progress updates
      const interval = setInterval(async () => {
        try {
          const progress = await redis.hgetall(`audio:progress:${evidenceId}`);

          if (!progress || Object.keys(progress).length === 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ stage: 'error', error: 'Progress not found' })}\n\n`));
            clearInterval(interval);
            controller.close();
            return;
          }

          // Send progress update
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`));

          // Close stream when complete
          if (progress.stage === 'complete' || progress.stage === 'error') {
            clearInterval(interval);
            controller.close();
          }
        } catch (error) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ stage: 'error', error: 'SSE error' })}\n\n`));
          clearInterval(interval);
          controller.close();
        }
      }, 500);

      // Cleanup on client disconnect
      return () => clearInterval(interval);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
};
```

---

## 3. Whisper CUDA Transcription (Consumer Stage 1)

### RabbitMQ Consumer

**File**: `src/lib/server/queue/consumers/audio-processor.ts` (NEW)

```typescript
import { rabbitmq } from '../rabbitmq-manager-fixed.js';
import { transcribeAudio } from '$lib/server/ai/whisper-cuda.js';
import { parseJSON } from '$lib/server/utils/simd-parser.js';
import { extractEntities } from '$lib/server/analysis/langextract.js';
import { analyzeWithACE } from '$lib/server/ai/ace-analyzer.js';
import { embedText } from '$lib/server/grpc/embedding-client.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { db } from '$lib/server/db/client.js';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';
import { getRedis } from '$lib/server/redis.js';
import { buildKAGGraph } from '$lib/server/graph/kag-builder.js';

export async function startAudioProcessorConsumer() {
  await rabbitmq.consume('audio.process', async (msg) => {
    const { evidenceId, caseId, minioPath } = JSON.parse(msg.content.toString());
    const redis = getRedis();

    try {
      // Stage 1: Transcription (50% of total progress)
      await redis.hset(`audio:progress:${evidenceId}`, 'stage', 'transcription');

      const audioBuffer = await downloadFromMinIO(minioPath);
      const transcription = await transcribeAudio(audioBuffer, {
        model: 'base', // 99 languages
        useCUDA: true,
        onProgress: async (progress) => {
          await redis.hset(`audio:progress:${evidenceId}`, 'transcriptionProgress', progress);
        }
      });

      // Stage 2: SIMD JSON Parsing (fast text normalization)
      const normalizedText = parseJSON(JSON.stringify(transcription));

      // Stage 3: LangExtract Entity Extraction (20% of total)
      await redis.hset(`audio:progress:${evidenceId}`, 'stage', 'analysis');
      await redis.hset(`audio:progress:${evidenceId}`, 'analysisProgress', 0);

      const entities = await extractEntities(transcription.text, {
        types: ['PERSON', 'DATE', 'MONEY', 'CITATION', 'STATUTE', 'ORGANIZATION']
      });

      await redis.hset(`audio:progress:${evidenceId}`, 'analysisProgress', 33);

      // Stage 4: ACE Quality Analysis + Summary (20% of total)
      const aceAnalysis = await analyzeWithACE(transcription.text, {
        context: { caseId, evidenceType: 'audio' },
        tasks: ['summarize', 'extract_claims', 'identify_contradictions']
      });

      await redis.hset(`audio:progress:${evidenceId}`, 'analysisProgress', 66);

      // Stage 5: Embedding + Qdrant Indexing (10% of total)
      const embedding = await embedText(transcription.text);

      await qdrant.upsert('evidence_items', {
        points: [{
          id: evidenceId,
          vector: embedding,
          payload: {
            evidenceId,
            caseId,
            type: 'audio_transcription',
            text: transcription.text,
            language: transcription.language,
            entities: entities.map(e => ({ type: e.type, value: e.value })),
            summary: aceAnalysis.summary,
            tags: [
              ...entities.map(e => e.type.toLowerCase()),
              'audio',
              'transcription',
              aceAnalysis.claims.length > 0 ? 'contains-claims' : null
            ].filter(Boolean),
            uploadedAt: new Date().toISOString()
          }
        }]
      });

      await redis.hset(`audio:progress:${evidenceId}`, 'analysisProgress', 100);

      // Stage 6: JSONB Metadata Storage (PostgreSQL)
      await db.update(evidence)
        .set({
          metadata: {
            transcription: {
              text: transcription.text,
              language: transcription.language,
              segments: transcription.segments,
              duration: transcription.duration
            },
            entities,
            aceAnalysis: {
              summary: aceAnalysis.summary,
              claims: aceAnalysis.claims,
              contradictions: aceAnalysis.contradictions,
              confidence: aceAnalysis.confidence
            },
            qdrantId: evidenceId,
            processingStatus: 'complete',
            processedAt: new Date().toISOString()
          }
        })
        .where(eq(evidence.id, evidenceId));

      // Stage 7: KAG/DAG Graph Integration (Neo4j + CouchDB cache)
      await buildKAGGraph({
        evidenceId,
        caseId,
        entities,
        claims: aceAnalysis.claims,
        transcription: transcription.text
      });

      // Stage 8: Pre-warm Bifrost L2 cache (semantic queries likely)
      await prewarmBifrostCache(evidenceId, transcription.text);

      // Final: Mark complete
      await redis.hset(`audio:progress:${evidenceId}`, {
        stage: 'complete',
        transcription: transcription.text.slice(0, 500),
        entities: JSON.stringify(entities.slice(0, 10)),
        summary: aceAnalysis.summary
      });

    } catch (error) {
      console.error('[AudioProcessor] Error:', error);
      await redis.hset(`audio:progress:${evidenceId}`, {
        stage: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
```

---

## 4. SIMD JSON Parsing (Performance)

### Fast Text Normalization

**File**: `src/lib/server/utils/simd-parser.ts` (ENHANCED)

```typescript
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let simdjson: any = null;

try {
  simdjson = require('../../../simd-bridge/node_modules/simdjson');
} catch {
  console.warn('[SIMD] simdjson not available — falling back to JSON.parse');
}

/**
 * Fast JSON parsing using SIMD when available
 * ~2-5x faster than JSON.parse for large transcripts
 */
export function parseJSON<T = any>(jsonString: string): T {
  if (!simdjson) {
    return JSON.parse(jsonString);
  }

  try {
    return simdjson.parse(jsonString);
  } catch {
    // Fallback to standard JSON.parse
    return JSON.parse(jsonString);
  }
}

/**
 * Normalize transcription text for entity extraction
 * - Remove filler words (um, uh, like)
 * - Collapse multiple spaces
 * - Standardize punctuation
 */
export function normalizeTranscription(text: string): string {
  return text
    .replace(/\b(um|uh|like|you know)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s([.,!?;:])/g, '$1')
    .trim();
}
```

---

## 5. LangExtract Entity Extraction

### Entity Extraction Integration

**File**: `src/lib/server/analysis/langextract.ts` (ENHANCED)

```typescript
import { ENV } from '$lib/server/env.server.js';

export interface ExtractedEntity {
  type: 'PERSON' | 'DATE' | 'MONEY' | 'CITATION' | 'STATUTE' | 'ORGANIZATION' | 'LOCATION';
  value: string;
  start: number;
  end: number;
  confidence: number;
}

export async function extractEntities(
  text: string,
  options: {
    types?: string[];
    minConfidence?: number;
  } = {}
): Promise<ExtractedEntity[]> {
  const { types = [], minConfidence = 0.5 } = options;

  const response = await fetch(`${ENV.LANGEXTRACT_URL}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      types,
      min_confidence: minConfidence
    })
  });

  if (!response.ok) {
    throw new Error(`LangExtract extraction failed: ${response.statusText}`);
  }

  const result = await response.json();
  return result.entities;
}

/**
 * Group entities by type for metadata storage
 */
export function groupEntitiesByType(entities: ExtractedEntity[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};

  for (const entity of entities) {
    if (!grouped[entity.type]) {
      grouped[entity.type] = [];
    }
    grouped[entity.type].push(entity.value);
  }

  // Deduplicate
  for (const type in grouped) {
    grouped[type] = [...new Set(grouped[type])];
  }

  return grouped;
}
```

---

## 6. ACE Analysis + Summary Generation

### ACE Analyzer

**File**: `src/lib/server/ai/ace-analyzer.ts` (ENHANCED)

```typescript
import { generateCompletion } from '$lib/server/ai/ollama-client.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';

export interface ACEAnalysis {
  summary: string;
  claims: Array<{ text: string; timestamp?: string }>;
  contradictions: Array<{ claim1: string; claim2: string; reason: string }>;
  confidence: number;
  tags: string[];
}

export async function analyzeWithACE(
  transcription: string,
  options: {
    context: { caseId: string; evidenceType: string };
    tasks: string[];
  }
): Promise<ACEAnalysis> {
  const systemPrompt = `You are a legal analysis AI (ACE — Agentic Cognitive Engine).
Analyze the provided audio transcription and extract:
1. A 2-3 sentence summary of key points
2. All legal claims made by the speaker
3. Any logical contradictions or inconsistencies
4. Relevant tags for indexing

Provide structured JSON output.`;

  const userPrompt = `Case ID: ${options.context.caseId}
Evidence Type: ${options.context.evidenceType}
Tasks: ${options.tasks.join(', ')}

Transcription:
${transcription}

Analyze and respond in JSON format:
{
  "summary": "...",
  "claims": [{"text": "...", "timestamp": "..."}],
  "contradictions": [{"claim1": "...", "claim2": "...", "reason": "..."}],
  "confidence": 0.0-1.0,
  "tags": ["tag1", "tag2"]
}`;

  return traceLLM('ace-audio-analysis', { caseId: options.context.caseId }, async (gen) => {
    const result = await generateCompletion({
      prompt: userPrompt,
      systemPrompt,
      model: 'gemma4-legal:latest',
      temperature: 0.3,
      maxTokens: 1024
    });

    const analysis = JSON.parse(result.response);
    gen.end({ output: analysis });
    return analysis;
  });
}
```

---

## 7. Qdrant Indexing with Tags

### Evidence Qdrant Schema

**JSONB Metadata Structure** (PostgreSQL `evidence.metadata`):

```typescript
interface EvidenceMetadata {
  // Audio transcription
  transcription?: {
    text: string;
    language: string;
    segments: Array<{ start: number; end: number; text: string }>;
    duration: number;
  };

  // Extracted entities
  entities?: Array<{
    type: string;
    value: string;
    start: number;
    end: number;
    confidence: number;
  }>;

  // ACE analysis
  aceAnalysis?: {
    summary: string;
    claims: Array<{ text: string; timestamp?: string }>;
    contradictions: Array<{ claim1: string; claim2: string; reason: string }>;
    confidence: number;
    tags: string[];
  };

  // Processing metadata
  processingStatus: 'queued' | 'processing' | 'complete' | 'error';
  processedAt?: string;
  qdrantId?: string;

  // Original upload metadata
  size: number;
  mimeType: string;
}
```

**Qdrant Payload** (`evidence_items` collection):

```typescript
interface EvidenceQdrantPayload {
  evidenceId: string;
  caseId: string;
  type: 'audio_transcription';
  text: string; // Full transcription
  language: string;

  // Entities (denormalized for filtering)
  entities: Array<{ type: string; value: string }>;

  // ACE summary
  summary: string;

  // Tags for faceted search
  tags: string[]; // ['audio', 'transcription', 'person', 'date', 'contains-claims', ...]

  // Timestamps
  uploadedAt: string;
  processedAt: string;
}
```

---

## 8. KAG/DAG Graph Integration

### Knowledge-Augmented Graph Builder

**File**: `src/lib/server/graph/kag-builder.ts` (NEW)

```typescript
import { neo4j } from '$lib/server/graph/neo4j-client.js';
import { couchdb } from '$lib/server/couchdb/client.js';
import type { ExtractedEntity } from '$lib/server/analysis/langextract.js';

export async function buildKAGGraph(options: {
  evidenceId: string;
  caseId: string;
  entities: ExtractedEntity[];
  claims: Array<{ text: string; timestamp?: string }>;
  transcription: string;
}): Promise<void> {
  const { evidenceId, caseId, entities, claims, transcription } = options;

  // 1. Create Evidence node in Neo4j
  await neo4j.run(
    `MERGE (e:Evidence {id: $evidenceId})
     SET e.type = 'audio',
         e.caseId = $caseId,
         e.createdAt = timestamp()
     WITH e
     MATCH (c:Case {id: $caseId})
     MERGE (c)-[:HAS_EVIDENCE]->(e)`,
    { evidenceId, caseId }
  );

  // 2. Create Entity nodes + relationships
  for (const entity of entities) {
    await neo4j.run(
      `MERGE (ent:Entity {type: $type, value: $value})
       WITH ent
       MATCH (e:Evidence {id: $evidenceId})
       MERGE (e)-[:MENTIONS]->(ent)`,
      { type: entity.type, value: entity.value, evidenceId }
    );
  }

  // 3. Create Claim nodes
  for (const claim of claims) {
    await neo4j.run(
      `CREATE (cl:Claim {text: $text, timestamp: $timestamp})
       WITH cl
       MATCH (e:Evidence {id: $evidenceId})
       MERGE (e)-[:CONTAINS_CLAIM]->(cl)`,
      { text: claim.text, timestamp: claim.timestamp || null, evidenceId }
    );
  }

  // 4. Cache DAG ordering in CouchDB (for fast retrieval)
  const dagOrdering = await computeDAGOrdering(caseId);
  await couchdb.put('dag_cache', `case:${caseId}`, {
    caseId,
    ordering: dagOrdering,
    evidenceCount: dagOrdering.length,
    lastUpdated: new Date().toISOString(),
    ttl: 3600 // 1 hour
  });
}

/**
 * Compute topological ordering of evidence based on temporal/causal relationships
 */
async function computeDAGOrdering(caseId: string): Promise<string[]> {
  const result = await neo4j.run(
    `MATCH (c:Case {id: $caseId})-[:HAS_EVIDENCE]->(e:Evidence)
     OPTIONAL MATCH (e)-[:PRECEDES]->(e2:Evidence)
     RETURN e.id as id, collect(e2.id) as successors
     ORDER BY e.createdAt ASC`,
    { caseId }
  );

  // Topological sort (Kahn's algorithm)
  const graph = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const record of result.records) {
    const id = record.get('id');
    const successors = record.get('successors');
    graph.set(id, successors);
    inDegree.set(id, 0);
  }

  for (const [id, successors] of graph) {
    for (const successor of successors) {
      inDegree.set(successor, (inDegree.get(successor) || 0) + 1);
    }
  }

  const queue = Array.from(inDegree.entries())
    .filter(([_, degree]) => degree === 0)
    .map(([id]) => id);

  const ordering: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    ordering.push(id);

    for (const successor of graph.get(id) || []) {
      const newDegree = inDegree.get(successor)! - 1;
      inDegree.set(successor, newDegree);
      if (newDegree === 0) {
        queue.push(successor);
      }
    }
  }

  return ordering;
}
```

---

## 9. Bifrost L2 vs Redis L1 Cache Decision

### Intelligent Cache Routing

**File**: `src/lib/server/cache/audio-cache-router.ts` (NEW)

```typescript
import { getRedis } from '$lib/server/redis.js';
import { bifrostCache } from '$lib/server/cache/bifrost-client.js';
import type { Redis } from 'ioredis';

export type CacheStrategy = 'redis' | 'bifrost' | 'skip';

/**
 * Determine optimal cache layer based on query characteristics
 */
export function getCacheStrategy(query: {
  type: 'exact' | 'semantic' | 'fuzzy';
  text: string;
  context?: string;
}): CacheStrategy {
  const { type, text } = query;

  // Rule 1: Exact queries → Redis L1 (5ms)
  if (type === 'exact' && text.length < 200) {
    return 'redis';
  }

  // Rule 2: Semantic/fuzzy queries → Bifrost L2 (2-5s)
  if (type === 'semantic' || type === 'fuzzy') {
    return 'bifrost';
  }

  // Rule 3: Long transcripts → skip cache, go direct to Qdrant
  if (text.length > 2000) {
    return 'skip';
  }

  // Default: Redis L1
  return 'redis';
}

/**
 * Query cache with intelligent routing
 */
export async function queryCachedTranscription(options: {
  evidenceId: string;
  query: string;
  queryType: 'exact' | 'semantic' | 'fuzzy';
}): Promise<any> {
  const strategy = getCacheStrategy({
    type: options.queryType,
    text: options.query
  });

  if (strategy === 'redis') {
    return queryRedisCache(options);
  } else if (strategy === 'bifrost') {
    return queryBifrostCache(options);
  } else {
    // Skip cache — go direct to Qdrant
    return null;
  }
}

async function queryRedisCache(options: { evidenceId: string; query: string }): Promise<any> {
  const redis: Redis = getRedis();
  const cacheKey = `transcription:${options.evidenceId}:${options.query}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  return null;
}

async function queryBifrostCache(options: { evidenceId: string; query: string }): Promise<any> {
  return bifrostCache.search({
    query: options.query,
    collection: 'evidence_items',
    filters: { evidenceId: options.evidenceId },
    limit: 5
  });
}
```

---

## 10. SSE Chat Context Integration

### Wiring Audio Transcription to Chat

**File**: `src/routes/api/sse/chat/+server.ts` (ENHANCED)

```typescript
// ... existing imports ...

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { message, caseId, sessionId } = await request.json();
  const redis = getRedis();

  // Retrieve audio transcriptions for this case
  const audioEvidence = await db
    .select()
    .from(evidence)
    .where(
      and(
        eq(evidence.caseId, caseId),
        eq(evidence.evidenceType, 'audio'),
        sql`metadata->>'processingStatus' = 'complete'`
      )
    )
    .limit(5); // Last 5 audio files

  // Build audio context for system prompt
  const audioContext = audioEvidence.map((ev, i) => {
    const meta = ev.metadata as any;
    return `### Audio Evidence ${i + 1}: ${ev.title}
- Language: ${meta.transcription?.language || 'unknown'}
- Duration: ${meta.transcription?.duration || 'unknown'}s
- Summary: ${meta.aceAnalysis?.summary || 'N/A'}
- Key Entities: ${meta.entities?.slice(0, 5).map((e: any) => `${e.type}:${e.value}`).join(', ') || 'None'}

Transcript (first 500 chars):
${meta.transcription?.text.slice(0, 500) || 'N/A'}...`;
  }).join('\n\n');

  const systemPrompt = `You are a legal AI assistant for Case ${caseId}.

The following audio evidence is available for this case:

${audioContext}

Use the audio transcripts to answer questions about witness statements, depositions, or recorded evidence. Reference specific evidence by title when citing information.`;

  // ... rest of SSE chat logic (ACE context, RAG, KAG, DAG, etc.) ...
};
```

---

## 11. RabbitMQ Concurrent UX Pattern

### Parallel Processing with Progress Updates

```typescript
// In audio-processor.ts consumer
export async function startAudioProcessorConsumer() {
  await rabbitmq.consume('audio.process', async (msg) => {
    const { evidenceId } = JSON.parse(msg.content.toString());
    const redis = getRedis();

    try {
      // Run transcription + entity extraction in parallel where possible
      const [transcription, ...] = await Promise.all([
        transcribeAudio(audioBuffer, { ... }),
        // Pre-warm related evidence (parallel task)
        prewarmRelatedEvidence(caseId)
      ]);

      // Sequential tasks that depend on transcription
      const entities = await extractEntities(transcription.text);
      const aceAnalysis = await analyzeWithACE(transcription.text, { ... });

      // Parallel tasks for indexing
      await Promise.all([
        embedAndIndex(transcription.text, evidenceId),
        buildKAGGraph({ evidenceId, entities, claims: aceAnalysis.claims }),
        updateSearchIndex(evidenceId, transcription.text)
      ]);

      // Mark complete
      await redis.hset(`audio:progress:${evidenceId}`, 'stage', 'complete');

    } catch (error) {
      // Error handling
    }
  });
}
```

---

## 12. Performance Benchmarks (Estimated)

| Stage | Time (CUDA) | Time (CPU) | Speedup |
|-------|-------------|------------|---------|
| Whisper Transcription (60s audio) | ~3s | ~9s | 3x |
| SIMD JSON Parsing (100KB transcript) | ~5ms | ~20ms | 4x |
| LangExtract Entity Extraction | ~500ms | ~500ms | 1x |
| ACE Analysis (Ollama GPU) | ~2s | ~8s | 4x |
| Embedding (embeddinggemma) | ~50ms | ~200ms | 4x |
| Qdrant Indexing | ~100ms | ~100ms | 1x |
| KAG Graph Build (Neo4j) | ~300ms | ~300ms | 1x |
| DAG Cache Update (CouchDB) | ~50ms | ~50ms | 1x |
| **Total Pipeline** | **~6s** | **~18s** | **3x** |

**Concurrent UX**: SSE progress updates every 500ms keep UI responsive.

---

## 13. Drizzle Schema Additions

### Evidence Metadata JSONB Extension

```typescript
// src/lib/server/db/schema-postgres.ts
export const evidence = pgTable('evidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').notNull().references(() => cases.id),
  title: varchar('title', { length: 500 }).notNull(),
  evidenceType: evidenceTypeEnum('evidence_type').notNull(),
  fileName: varchar('file_name', { length: 500 }),
  minioPath: varchar('minio_path', { length: 1000 }),
  uploadedBy: uuid('uploaded_by').references(() => users.id),

  // JSONB metadata (supports transcription, entities, ACE analysis)
  metadata: jsonb('metadata').$type<EvidenceMetadata>(),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});
```

---

## 14. Integration Checklist

- [x] Design audio upload XState v5 machine
- [x] Create SSE progress streaming endpoint
- [x] Wire RabbitMQ audio.process queue
- [x] Integrate Whisper CUDA with progress callbacks
- [x] Add SIMD JSON parsing for fast transcripts
- [x] Connect LangExtract entity extraction
- [x] Wire ACE analysis for summaries
- [x] Qdrant indexing with tags
- [x] JSONB metadata schema
- [x] KAG/DAG Neo4j graph integration
- [x] CouchDB DAG cache for topological ordering
- [x] Bifrost L2 vs Redis L1 cache routing
- [x] SSE chat context with audio transcripts
- [x] Concurrent UX with parallel processing

**Next**: Implement Sprint 4B.4 (audio upload UI) + Sprint 4B.5 (Drizzle schema) + Sprint 4B.6 (SSE chat)

---

## 15. Testing Plan

### Manual Testing

1. Upload 10s audio clip → verify SSE progress updates
2. Upload 60s deposition → verify CUDA transcription (< 5s)
3. Check PostgreSQL `evidence.metadata` for transcription/entities/ACE analysis
4. Query Qdrant `evidence_items` for audio transcription
5. Verify Neo4j graph has Evidence → Entity relationships
6. Test SSE chat with audio context in system prompt

### Automated Testing

```bash
# Test whisper CUDA
node scripts/tests/test-whisper-benchmark.mjs

# Test audio upload endpoint
curl -X POST http://localhost:5173/api/audio/upload \
  -F "audio=@test_deposition.wav" \
  -F "caseId=CASE-2024-001"

# Test SSE progress stream
curl http://localhost:5173/api/audio/progress/{evidenceId}

# Test cache routing
npm run test:audio-cache-router
```

---

## 16. Future Enhancements

1. **Real-time transcription**: Stream audio chunks as they're recorded (WebRTC → Whisper streaming)
2. **Speaker diarization**: Identify multiple speakers in depositions (pyannote.audio integration)
3. **Timestamp linking**: Click timestamp in transcript → jump to audio position
4. **Audio-to-video sync**: Align transcription with courtroom video footage
5. **Multi-lingual chat**: Ask questions in any language, retrieve audio evidence in original language
6. **Gemma 4 E4B audio**: Once Ollama is stable, replace Whisper with unified multimodal model

---

## Summary

**Complete audio-to-knowledge pipeline** ready for implementation:

1. **Client**: XState v5 machine + SSE progress streaming + Svelte 5 upload widget
2. **Server**: RabbitMQ async processing + Whisper CUDA + SIMD + LangExtract + ACE
3. **Storage**: PostgreSQL JSONB metadata + Qdrant vector search + Neo4j KAG graph
4. **Cache**: Intelligent routing (Redis L1 exact match, Bifrost L2 semantic search)
5. **UX**: Real-time progress updates, 6-second pipeline on GPU, concurrent processing

**Estimated implementation time**: 8-10 hours across Sprint 4B.4, 4B.5, 4B.6

**Performance**: 3x faster with CUDA (6s vs 18s for 60s audio)

**Ready for Sprint 4B implementation** ✅
