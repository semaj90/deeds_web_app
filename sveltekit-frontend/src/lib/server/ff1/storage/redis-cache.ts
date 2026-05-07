/**
 * FF1 Redis Storage Layer
 *
 * OOM-safe key/value cache for the FF1 agent loop.
 * All keys are namespaced under ff1:* and have explicit TTLs.
 * Uses lazy Redis connection (no connect on import) to avoid blocking startup.
 *
 * Key schema:
 *   ff1:graph:summary:{sha1(path)}          → file summary string (24h)
 *   ff1:audit:diagnostics:{commitSha}       → DiagnosticEntry[] (6h)
 *   ff1:repair:plan:{diagHash}              → RepairPlan (24h)
 *   ff1:llm:{promptHash}:{contextHash}      → LLM text output (24h)
 *   ff1:llm:propose:{diagId}               → ProposalFix JSON (12h)
 *   ff1:validation:{patchHash}             → ValidationResult (24h)
 */

import { createHash } from 'crypto';
import type { DiagnosticEntry, RepairPlan } from '../graph/graph-schema.js';

const REDIS_URL = ENV.REDIS_URL;

// TTLs (seconds)
const TTL = {
  fileSummary:   86_400,   // 24h
  diagnostics:   21_600,   //  6h
  repairPlan:    86_400,   // 24h
  llmOutput:     86_400,   // 24h
  proposal:      43_200,   // 12h
  validation:    86_400,   // 24h
} as const;

// ── Redis client (lazy) ───────────────────────────────────────────────────

type RedisClient = Awaited<ReturnType<typeof import('redis')['createClient']>>;
let _client: RedisClient | null = null;
let _connecting = false;

async function getClient(): Promise<RedisClient> {
  if (_client?.isReady) return _client;
  if (_connecting) {
    // Wait up to 3s for pending connection
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (_client?.isReady) return _client;
    }
    throw new Error('FF1 Redis: timed out waiting for connection');
  }
  _connecting = true;
  try {
    const { createClient } = await import('redis');
    _client = createClient({
      url:    REDIS_URL,
      socket: { connectTimeout: 3000, reconnectStrategy: (r) => r > 3 ? new Error('FF1 Redis: giving up') : 500 },
    });
    _client.on('error', (e: Error) => {
      // log but don't crash — FF1 degrades gracefully without Redis
      console.warn('[ff1:redis] connection error:', e.message);
    });
    await _client.connect();
    return _client;
  } finally {
    _connecting = false;
  }
}

async function withRedis<T>(fn: (r: RedisClient) => Promise<T>, fallback: T): Promise<T> {
  try {
    const r = await getClient();
    return await fn(r);
  } catch (err) {
    console.warn('[ff1:redis] operation skipped:', (err as Error).message);
    return fallback;
  }
}

// ── Disconnect helper (call on process exit) ──────────────────────────────

export async function disconnectRedis(): Promise<void> {
  if (_client?.isReady) await _client.quit().catch(() => {});
}

// ── Hash helpers ──────────────────────────────────────────────────────────

function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex').slice(0, 16);
}

// ── File summary cache ────────────────────────────────────────────────────

export async function getCachedFileSummary(path: string): Promise<string | null> {
  return withRedis(async r => (await r.get(`ff1:graph:summary:${sha1(path)}`)) as string | null, null);
}

export async function setCachedFileSummary(path: string, summary: string): Promise<void> {
  await withRedis(r => r.set(`ff1:graph:summary:${sha1(path)}`, summary, { EX: TTL.fileSummary }), undefined);
}

// ── Diagnostics cache ─────────────────────────────────────────────────────

export async function getCachedDiagnostics(commitSha: string): Promise<DiagnosticEntry[] | null> {
  return withRedis(async r => {
    const v = (await r.get(`ff1:audit:diagnostics:${commitSha}`)) as string | null;
    return v ? (JSON.parse(v) as DiagnosticEntry[]) : null;
  }, null);
}

export async function setCachedDiagnostics(commitSha: string, entries: DiagnosticEntry[]): Promise<void> {
  await withRedis(
    r => r.set(`ff1:audit:diagnostics:${commitSha}`, JSON.stringify(entries), { EX: TTL.diagnostics }),
    undefined,
  );
}

// ── Repair plan cache ─────────────────────────────────────────────────────

export async function getCachedRepairPlan(diagId: string): Promise<RepairPlan | null> {
  return withRedis(async r => {
    const v = (await r.get(`ff1:repair:plan:${diagId}`)) as string | null;
    return v ? (JSON.parse(v) as RepairPlan) : null;
  }, null);
}

export async function setCachedRepairPlan(plan: RepairPlan): Promise<void> {
  await withRedis(
    r => r.set(`ff1:repair:plan:${plan.issueId}`, JSON.stringify(plan), { EX: TTL.repairPlan }),
    undefined,
  );
}

// ── LLM output cache ──────────────────────────────────────────────────────

export interface LlmCacheEntry {
  output:          string;
  model?:          string;
  promptTokens?:   number;
  completionTokens?: number;
  createdAt:       string;
}

export async function getCachedLlmOutput(promptHash: string, contextHash: string): Promise<LlmCacheEntry | null> {
  return withRedis(async r => {
    const v = (await r.get(`ff1:llm:${promptHash}:${contextHash}`)) as string | null;
    return v ? (JSON.parse(v) as LlmCacheEntry) : null;
  }, null);
}

export async function setCachedLlmOutput(
  promptHash: string,
  contextHash: string,
  entry: LlmCacheEntry,
): Promise<void> {
  await withRedis(
    r => r.set(`ff1:llm:${promptHash}:${contextHash}`, JSON.stringify(entry), { EX: TTL.llmOutput }),
    undefined,
  );
}

// ── Proposal cache ────────────────────────────────────────────────────────

export interface ProposalFix {
  id:               string;
  issueId:          string;
  title:            string;
  rootCause:        string;
  confidence:       number;
  risk:             'low' | 'medium' | 'high';
  affectedFiles:    Array<{ path: string; reason: string; plannedChange: string }>;
  validationCommands: string[];
  rollbackPlan:     string;
  notes:            string[];
  model?:           string;
  needsHumanApproval: boolean;
  createdAt:        string;
}

export async function getCachedProposal(diagId: string): Promise<ProposalFix | null> {
  return withRedis(async r => {
    const v = (await r.get(`ff1:llm:propose:${diagId}`)) as string | null;
    return v ? (JSON.parse(v) as ProposalFix) : null;
  }, null);
}

export async function setCachedProposal(proposal: ProposalFix): Promise<void> {
  await withRedis(
    r => r.set(`ff1:llm:propose:${proposal.issueId}`, JSON.stringify(proposal), { EX: TTL.proposal }),
    undefined,
  );
}

// ── Validation result cache ───────────────────────────────────────────────

export interface ValidationResult {
  patchHash:  string;
  command:    string;
  exitCode:   number;
  output:     string;
  durationMs: number;
  passed:     boolean;
  createdAt:  string;
}

export async function getCachedValidation(patchHash: string): Promise<ValidationResult | null> {
  return withRedis(async r => {
    const v = (await r.get(`ff1:validation:${patchHash}`)) as string | null;
    return v ? (JSON.parse(v) as ValidationResult) : null;
  }, null);
}

export async function setCachedValidation(result: ValidationResult): Promise<void> {
  await withRedis(
    r => r.set(`ff1:validation:${result.patchHash}`, JSON.stringify(result), { EX: TTL.validation }),
    undefined,
  );
}

// ── Audit run record (lightweight, not full Postgres) ────────────────────

export async function recordAuditRun(run: {
  id:         string;
  totalErrors: number;
  durationMs: number;
  summary:    Record<string, number>;
}): Promise<void> {
  const key = `ff1:audit:run:${run.id}`;
  await withRedis(
    r => r.set(key, JSON.stringify({ ...run, createdAt: new Date().toISOString() }), { EX: TTL.diagnostics }),
    undefined,
  );
}

// ── Stats ─────────────────────────────────────────────────────────────────

export async function ff1CacheStats(): Promise<{
  connected: boolean;
  keysByPrefix: Record<string, number>;
}> {
  const fallback: { connected: boolean; keysByPrefix: Record<string, number> } =
    { connected: false, keysByPrefix: {} };
  return withRedis(async r => {
    const keys = (await r.keys('ff1:*')) as string[];
    const byPrefix: Record<string, number> = {};
    for (const k of keys) {
      const prefix = k.split(':').slice(0, 3).join(':');
      byPrefix[prefix] = (byPrefix[prefix] ?? 0) + 1;
    }
    return { connected: true as boolean, keysByPrefix: byPrefix };
  }, fallback);
}
