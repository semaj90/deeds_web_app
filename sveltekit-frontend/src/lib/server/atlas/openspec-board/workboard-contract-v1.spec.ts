import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  loadOpenSpecWorkboardV1,
  projectTask,
  OpenSpecWorkboardContractError,
  OpenSpecWorkboardV1Schema,
} from './workboard-contract-v1';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../../../..');
const LIVE_ARTIFACT = path.join(REPO_ROOT, 'docs/reports/openspec-workboard-v1.json');

describe('OpenSpecWorkboardContractV1 against the live canonical artifact', () => {
  it('loads and validates deterministically, exposing a stable checksum', async () => {
    const first = await loadOpenSpecWorkboardV1(LIVE_ARTIFACT);
    const second = await loadOpenSpecWorkboardV1(LIVE_ARTIFACT);
    expect(first.revision.workboardChecksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.revision.workboardChecksum).toBe(second.revision.workboardChecksum);
  });

  it('exact total/complete/open/actionable/waiting/superseded parity against the artifact\'s own summary', async () => {
    const { workboard } = await loadOpenSpecWorkboardV1(LIVE_ARTIFACT);
    const tasks = workboard.taskInventory;
    expect(tasks.length).toBe(workboard.summary.totalTasks);
    expect(tasks.filter((t) => t.executionState === 'DONE').length).toBe(workboard.summary.completedTasks);
    expect(tasks.filter((t) => t.state === 'OPEN').length).toBe(workboard.summary.openTasks);
    expect(tasks.filter((t) => t.executionState === 'ACTIONABLE').length).toBe(workboard.summary.actionableTasks);
    expect(tasks.filter((t) => t.executionState === 'WAITING_ON_DEPENDENCY').length).toBe(workboard.summary.waitingTasks);
    expect(tasks.filter((t) => t.executionState === 'SUPERSEDED_OR_HISTORICAL').length).toBe(workboard.summary.supersededTasks);
  });

  it('no duplicate stableKey across the whole artifact (the reliable canonical identity)', async () => {
    const { workboard } = await loadOpenSpecWorkboardV1(LIVE_ARTIFACT);
    const keys = workboard.taskInventory.map((t) => t.stableKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('no duplicate logicalTaskKey among the rows where it is non-null (it is legitimately null on most rows)', async () => {
    const { workboard } = await loadOpenSpecWorkboardV1(LIVE_ARTIFACT);
    const nonNull = workboard.taskInventory.map((t) => t.logicalTaskKey).filter((k): k is string => k !== null);
    expect(new Set(nonNull).size).toBe(nonNull.length);
    // Documents the real, verified-live shape rather than assuming logicalTaskKey is always present.
    expect(nonNull.length).toBeLessThan(workboard.taskInventory.length);
  });

  it('taskInventory is a flat array of task objects, not nested groups', async () => {
    const { workboard } = await loadOpenSpecWorkboardV1(LIVE_ARTIFACT);
    expect(Array.isArray(workboard.taskInventory)).toBe(true);
    for (const t of workboard.taskInventory.slice(0, 50)) {
      expect(typeof t.taskKey).toBe('string');
      expect(typeof t.text).toBe('string');
    }
  });

  it('projectTask never invents a STEP label absent from the artifact', async () => {
    const { workboard } = await loadOpenSpecWorkboardV1(LIVE_ARTIFACT);
    const projected = workboard.taskInventory.slice(0, 100).map(projectTask);
    for (const p of projected) {
      if (p.step !== null) expect(p.step).toMatch(/^STEP-\d{2}/);
    }
  });

  it('fails closed on a missing file', async () => {
    await expect(loadOpenSpecWorkboardV1(path.join(REPO_ROOT, 'docs/reports/does-not-exist-v1.json')))
      .rejects.toBeInstanceOf(OpenSpecWorkboardContractError);
  });

  it('fails closed on malformed JSON', async () => {
    const tmp = path.join(REPO_ROOT, 'sveltekit-frontend/.tmp-workboard-contract-spec-malformed.json');
    await fs.mkdir(path.dirname(tmp), { recursive: true });
    await fs.writeFile(tmp, '{ not valid json', 'utf8');
    try {
      await expect(loadOpenSpecWorkboardV1(tmp)).rejects.toBeInstanceOf(OpenSpecWorkboardContractError);
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
  });

  it('fails closed on a shape mismatch (wrong schema literal)', async () => {
    const tmp = path.join(REPO_ROOT, 'sveltekit-frontend/.tmp-workboard-contract-spec-wrongshape.json');
    await fs.mkdir(path.dirname(tmp), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify({ schema: 'not.the.right.schema', generatedAt: 'x', source: 'x', summary: {}, taskInventory: [] }), 'utf8');
    try {
      const result = OpenSpecWorkboardV1Schema.safeParse(JSON.parse(await fs.readFile(tmp, 'utf8')));
      expect(result.success).toBe(false);
      await expect(loadOpenSpecWorkboardV1(tmp)).rejects.toBeInstanceOf(OpenSpecWorkboardContractError);
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
  });
});
