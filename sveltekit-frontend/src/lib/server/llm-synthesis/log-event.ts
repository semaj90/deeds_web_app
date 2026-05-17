import fs from 'fs';
import path from 'path';
import { db } from '$lib/server/db/client';
import { llmSynthesisEvents } from '$lib/server/db/schema-postgres.js';
import { setJsonWithTtl } from '$lib/server/redis.js';

const FORBIDDEN_FIELDS = [
  'hiddenThoughts',
  'chainOfThought',
  'kv_cache',
  'tensor',
  'cudaPointer',
];

export interface LogLlmSynthesisEventParams {
  runId: string;
  sessionId?: string;
  userId?: number;
  authUserId?: string;
  query: string;
  profile: string;
  acePacket: Record<string, unknown>;
  toolCalls?: unknown[];
  sourceRefs?: unknown[];
  cacheKeys?: Record<string, string>;
  trustTier?: string;
  model: string;
  validation?: Record<string, unknown>;
}

function assertNoForbiddenFields(payload: unknown): void {
  const str = JSON.stringify(payload);
  for (const field of FORBIDDEN_FIELDS) {
    if (str.includes(`"${field}"`)) {
      throw new Error(
        `Security constraint: synthesis log cannot contain "${field}". Remove before logging.`,
      );
    }
  }
}

/**
 * Durably log an LLM synthesis event to Postgres, cache a hot copy in Redis,
 * and append a JSONL training row to memory/datasets/llm_synthesis/YYYY-MM-DD.jsonl.
 *
 * Every field in params flows through to all three sinks so consumers can
 * audit the full provenance of each synthesis run.
 */
export async function logLlmSynthesisEvent(
  params: LogLlmSynthesisEventParams,
): Promise<string> {
  if (!params.runId) throw new Error('runId is required');
  if (!params.query) throw new Error('query is required');
  if (!params.profile) throw new Error('profile is required');
  if (!params.model) throw new Error('model is required');
  if (!params.acePacket) throw new Error('acePacket is required');

  assertNoForbiddenFields(params.acePacket);
  assertNoForbiddenFields(params.toolCalls);
  assertNoForbiddenFields(params.sourceRefs);

  const toolCalls = params.toolCalls ?? [];
  const sourceRefs = params.sourceRefs ?? [];
  const cacheKeys = params.cacheKeys ?? {};
  const validation = params.validation ?? {};

  const [inserted] = await db
    .insert(llmSynthesisEvents)
    .values({
      runId: params.runId,
      sessionId: params.sessionId ?? null,
      userId: params.userId ?? null,
      authUserId: params.authUserId ?? null,
      query: params.query,
      profile: params.profile,
      acePacket: params.acePacket,
      toolCalls,
      sourceRefs,
      cacheKeys,
      trustTier: params.trustTier ?? null,
      model: params.model,
      validation,
    })
    .returning({ id: llmSynthesisEvents.id });

  const recordId = inserted.id;
  const now = new Date().toISOString();

  const hotPayload = {
    id: recordId,
    runId: params.runId,
    sessionId: params.sessionId ?? null,
    userId: params.userId ?? null,
    authUserId: params.authUserId ?? null,
    query: params.query,
    profile: params.profile,
    acePacket: params.acePacket,
    toolCalls,
    sourceRefs,
    cacheKeys,
    trustTier: params.trustTier ?? null,
    model: params.model,
    validation,
    createdAt: now,
  };

  // Redis hot copy: ace:packet:{runId} — 1h TTL, rebuildable
  await setJsonWithTtl(`ace:packet:${params.runId}`, hotPayload, 3600).catch(
    () => {/* Redis unavailable — skip hot cache, Postgres is truth */},
  );

  // Append to daily JSONL training dataset (fire-and-forget)
  try {
    const rootDir = process.cwd().endsWith('sveltekit-frontend')
      ? path.resolve(process.cwd(), '..')
      : process.cwd();
    const datasetDir = path.join(rootDir, 'memory', 'datasets', 'llm_synthesis');
    fs.mkdirSync(datasetDir, { recursive: true });
    const filePath = path.join(datasetDir, `${now.split('T')[0]}.jsonl`);
    fs.appendFileSync(filePath, JSON.stringify({ ...hotPayload, datasetTimestamp: now }) + '\n', 'utf8');
  } catch {
    // JSONL write is best-effort; do not fail the caller
  }

  return recordId;
}