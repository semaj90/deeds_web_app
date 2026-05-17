import fs from 'fs';
import path from 'path';
import { db } from '$lib/server/db/client.js';
import { llmSynthesisEvents } from '$lib/server/db/schema.js';
import { setJsonWithTtl } from '$lib/server/redis.js';

export interface LogLlmSynthesisEventParams {
  runId: string;
  sessionId?: string;
  userId?: number;
  query: string;
  profile: string;
  acePacket: any;
  toolCalls?: any[];
  sourceRefs?: any[];
  cacheKeys?: Record<string, string>;
  model: string;
}

/**
 * Log LLM Synthesis Event to PostgreSQL (durable store), cache to Redis,
 * and append to daily training JSONL dataset.
 * Enforces strict memory hygiene constraints.
 */
export async function logLlmSynthesisEvent(params: LogLlmSynthesisEventParams): Promise<string> {
  // Validate basic schema boundaries
  if (!params.runId) {
    throw new Error('runId is required for LLM synthesis logging');
  }
  if (!params.query) {
    throw new Error('query is required for LLM synthesis logging');
  }
  if (!params.profile) {
    throw new Error('profile is required for LLM synthesis logging');
  }
  if (!params.acePacket) {
    throw new Error('acePacket is required for LLM synthesis logging');
  }

  // Enforce zero-hidden-thought rules on payload to maintain VRAM security boundaries
  const payloadToSanitize = [params.acePacket, params.toolCalls, params.sourceRefs];
  for (const obj of payloadToSanitize) {
    if (obj) {
      const str = JSON.stringify(obj);
      if (
        str.includes('"hiddenThoughts"') ||
        str.includes('"chainOfThought"') ||
        str.includes('"kv_cache"') ||
        str.includes('"tensor"') ||
        str.includes('"cudaPointer"')
      ) {
        throw new Error(
          'Security Constraint Violation: Persistent synthesis cache cannot store raw tensor, cudaPointer, hiddenThoughts or chainOfThought.'
        );
      }
    }
  }

  const toolCalls = params.toolCalls ?? [];
  const sourceRefs = params.sourceRefs ?? [];
  const cacheKeys = params.cacheKeys ?? {};

  // Insert durably into Postgres
  const [inserted] = await db
    .insert(llmSynthesisEvents)
    .values({
      runId: params.runId,
      sessionId: params.sessionId ?? null,
      userId: params.userId ?? null,
      query: params.query,
      profile: params.profile,
      acePacket: params.acePacket,
      toolCalls: toolCalls,
      sourceRefs: sourceRefs,
      cacheKeys: cacheKeys,
      model: params.model,
    })
    .returning({ id: llmSynthesisEvents.id });

  const recordId = inserted.id;

  // Cache to Redis BitFrost under hot keys
  // ace:packet:{runId} - TTL: 1h (3600 seconds)
  const redisKey = `ace:packet:${params.runId}`;
  await setJsonWithTtl(
    redisKey,
    {
      id: recordId,
      runId: params.runId,
      sessionId: params.sessionId ?? null,
      userId: params.userId ?? null,
      query: params.query,
      profile: params.profile,
      acePacket: params.acePacket,
      toolCalls,
      sourceRefs,
      cacheKeys,
      model: params.model,
      createdAt: new Date().toISOString(),
    },
    3600 // 1 hour TTL
  );

  // Append to daily JSONL dataset file
  try {
    const rootDir = process.cwd().endsWith('sveltekit-frontend')
      ? path.resolve(process.cwd(), '..')
      : process.cwd();
    const datasetDir = path.join(rootDir, 'memory/datasets/llm_synthesis');
    if (!fs.existsSync(datasetDir)) {
      fs.mkdirSync(datasetDir, { recursive: true });
    }
    const today = new Date().toISOString().split('T')[0];
    const filePath = path.join(datasetDir, `${today}.jsonl`);
    const line = JSON.stringify({
      id: recordId,
      runId: params.runId,
      sessionId: params.sessionId ?? null,
      userId: params.userId ?? null,
      query: params.query,
      profile: params.profile,
      acePacket: params.acePacket,
      toolCalls,
      sourceRefs,
      cacheKeys,
      model: params.model,
      createdAt: new Date().toISOString(),
      datasetTimestamp: new Date().toISOString()
    }) + '\n';
    fs.appendFileSync(filePath, line, 'utf8');
  } catch (err: any) {
    console.warn('[logLlmSynthesisEvent] Failed to write to JSONL dataset:', err.message);
  }

  return recordId;
}
