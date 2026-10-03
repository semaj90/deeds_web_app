// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readOpenSpecAwarenessSnapshot, resetOpenSpecAwarenessCache } from './awareness';

describe('openspec awareness snapshot cache', () => {
  let dir: string;
  const previous = process.env.ATLAS_REPORTS_DIR;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-awareness-'));
    await fs.writeFile(path.join(dir, 'atlas-runtime-readiness-v1.json'), JSON.stringify({ summary: { a: 1 }, gates: [] }));
    process.env.ATLAS_REPORTS_DIR = dir;
    resetOpenSpecAwarenessCache();
  });

  afterEach(async () => {
    if (previous === undefined) delete process.env.ATLAS_REPORTS_DIR;
    else process.env.ATLAS_REPORTS_DIR = previous;
    resetOpenSpecAwarenessCache();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('returns the cached snapshot while inputs are unchanged', async () => {
    const first = await readOpenSpecAwarenessSnapshot();
    const second = await readOpenSpecAwarenessSnapshot();
    expect(second).toBe(first);
    expect(first.reports.readiness).toBe(true);
    expect(first.reports.directoryGraph).toBe(false);
  });

  it('shares one build between concurrent loads', async () => {
    const [a, b] = await Promise.all([readOpenSpecAwarenessSnapshot(), readOpenSpecAwarenessSnapshot()]);
    expect(b).toBe(a);
  });

  it('rebuilds when an input changes size', async () => {
    const first = await readOpenSpecAwarenessSnapshot();
    await fs.writeFile(
      path.join(dir, 'atlas-runtime-readiness-v1.json'),
      JSON.stringify({ summary: { a: 1, b: 2, extra: 'changes-the-size' }, gates: [] })
    );
    const second = await readOpenSpecAwarenessSnapshot();
    expect(second).not.toBe(first);
    expect(second.readiness.summary).toMatchObject({ b: 2 });
  });

  it('reflects a newly appearing report', async () => {
    const first = await readOpenSpecAwarenessSnapshot();
    expect(first.reports.challengerTournament).toBe(false);
    await fs.writeFile(path.join(dir, 'openspec-challenger-tournament-v1.json'), JSON.stringify({ comparisons: [] }));
    const second = await readOpenSpecAwarenessSnapshot();
    expect(second.reports.challengerTournament).toBe(true);
  });
});
