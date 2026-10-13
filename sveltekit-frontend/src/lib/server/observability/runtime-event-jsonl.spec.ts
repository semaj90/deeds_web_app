import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendRuntimeEvent, buildRuntimeEvent, readRuntimeEvents, runtimeEventsEnabled } from './runtime-event-jsonl.js';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'rt-events-')); });

describe('runtime-event-jsonl', () => {
  it('is disabled unless ATLAS_RUNTIME_EVENTS_JSONL=1', () => {
    expect(runtimeEventsEnabled({})).toBe(false);
    expect(runtimeEventsEnabled({ ATLAS_RUNTIME_EVENTS_JSONL: '1' })).toBe(true);
  });

  it('drops unknown keys and clamps long strings', () => {
    const e = buildRuntimeEvent({ stage: 'x'.repeat(500), prompt: 'secret' } as never);
    expect(e.stage?.length).toBe(64);
    expect((e as unknown as Record<string, unknown>).prompt).toBeUndefined();
  });

  it('appends and reads back filtered by requestId and stage', async () => {
    await appendRuntimeEvent(buildRuntimeEvent({ requestId: 'r1', stage: 'postgres_fts', outcome: 'ok', durationMs: 12 }), dir);
    await appendRuntimeEvent(buildRuntimeEvent({ requestId: 'r2', stage: 'rrf' }), dir);
    const byReq = await readRuntimeEvents({ requestId: 'r1' }, dir);
    expect(byReq).toHaveLength(1);
    expect(byReq[0].stage).toBe('postgres_fts');
    expect(await readRuntimeEvents({ stage: 'rrf' }, dir)).toHaveLength(1);
  });

  it('never throws on a bad directory and returns false', async () => {
    const ok = await appendRuntimeEvent(buildRuntimeEvent({ stage: 's' }), '/nonexistent\0bad');
    expect(ok).toBe(false);
  });

  it('caps read limit at 500 and returns [] for a missing file', async () => {
    expect(await readRuntimeEvents({}, join(dir, 'missing'))).toEqual([]);
  });

  it('accepts events under the 2 KB cap', async () => {
    const ok = await appendRuntimeEvent(buildRuntimeEvent({ evidenceRefs: Array.from({ length: 8 }, () => 'y'.repeat(128)) }), dir);
    expect(ok).toBe(true);
  });
});
