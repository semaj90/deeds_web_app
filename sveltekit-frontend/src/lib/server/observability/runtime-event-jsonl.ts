/**
 * Bounded JSONL sink for atlas.runtime.event.v1 diagnostics.
 *
 * Off unless ATLAS_RUNTIME_EVENTS_JSONL=1. Never throws into the caller.
 * Size-capped with single-file rotation. Stores metadata only: no prompt text,
 * source bytes, tokens, cookies, or request bodies. Not a canonical registry.
 */
import { appendFile, readFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';

export const RUNTIME_EVENT_SCHEMA = 'atlas.runtime.event.v1' as const;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MiB before rotation
const MAX_EVENT_BYTES = 2048;
const MAX_READ_LIMIT = 500;
const DEFAULT_DIR = join(process.cwd(), '.tmp', 'atlas', 'runtime-events');
const FILE = 'runtime-events.jsonl';

export interface RuntimeEvent {
  schema: typeof RUNTIME_EVENT_SCHEMA;
  timestamp: string;
  requestId?: string | null;
  runId?: string | null;
  stage?: string | null;
  outcome?: string | null;
  durationMs?: number | null;
  eventCode?: string | null;
  sourceRevision?: string | null;
  modelRevision?: string | null;
  evidenceRefs?: string[];
}

export function runtimeEventsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ATLAS_RUNTIME_EVENTS_JSONL === '1';
}

function clampStr(v: unknown, max = 200): string | null {
  return typeof v === 'string' ? v.slice(0, max) : null;
}

/** Builds a bounded event. Unknown keys are dropped. */
export function buildRuntimeEvent(input: Partial<RuntimeEvent>): RuntimeEvent {
  return {
    schema: RUNTIME_EVENT_SCHEMA,
    timestamp: new Date().toISOString(),
    requestId: clampStr(input.requestId, 64),
    runId: clampStr(input.runId, 64),
    stage: clampStr(input.stage, 64),
    outcome: clampStr(input.outcome, 32),
    durationMs: typeof input.durationMs === 'number' && Number.isFinite(input.durationMs) ? Math.round(input.durationMs) : null,
    eventCode: clampStr(input.eventCode, 64),
    sourceRevision: clampStr(input.sourceRevision, 128),
    modelRevision: clampStr(input.modelRevision, 128),
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs.slice(0, 8).map((r) => String(r).slice(0, 128)) : [],
  };
}

export async function appendRuntimeEvent(event: RuntimeEvent, dir = DEFAULT_DIR): Promise<boolean> {
  try {
    const line = JSON.stringify(event);
    if (Buffer.byteLength(line) > MAX_EVENT_BYTES) return false;
    const path = join(dir, FILE);
    const { mkdir } = await import('node:fs/promises');
    await mkdir(dir, { recursive: true });
    try {
      if ((await stat(path)).size > MAX_BYTES) await rename(path, join(dir, `${FILE}.1`));
    } catch {
      /* file absent: nothing to rotate */
    }
    await appendFile(path, line + '\n', 'utf8');
    return true;
  } catch {
    return false; // logging failure must never break retrieval
  }
}

/** Bounded read with optional filters. Returns [] on any error. */
export async function readRuntimeEvents(
  opts: { requestId?: string; stage?: string; eventCode?: string; limit?: number } = {},
  dir = DEFAULT_DIR,
): Promise<RuntimeEvent[]> {
  try {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), MAX_READ_LIMIT);
    const text = await readFile(join(dir, FILE), 'utf8');
    const out: RuntimeEvent[] = [];
    for (const raw of text.split('\n').reverse()) {
      if (!raw) continue;
      let e: RuntimeEvent;
      try { e = JSON.parse(raw) as RuntimeEvent; } catch { continue; }
      if (e.schema !== RUNTIME_EVENT_SCHEMA) continue;
      if (opts.requestId && e.requestId !== opts.requestId) continue;
      if (opts.stage && e.stage !== opts.stage) continue;
      if (opts.eventCode && e.eventCode !== opts.eventCode) continue;
      out.push(e);
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}
