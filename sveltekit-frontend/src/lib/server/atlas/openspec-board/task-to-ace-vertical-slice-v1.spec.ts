// @vitest-environment node
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as taskReceiptView from './task-receipt-view-v1.js';
import {
  matchesCurrentTaskSourceIndexRowV1,
  resolveCurrentGraphRevisionForWorkspaceV1,
  runTaskToAceVerticalSliceV1,
} from './task-to-ace-vertical-slice-v1.js';

describe('matchesCurrentTaskSourceIndexRowV1', () => {
  const expected = {
    sourceRef: 'openspec/changes/sample/tasks.md#L12',
    changeId: 'sample',
    sourceLine: 12,
    taskRevision: `sha256:${'f'.repeat(64)}`,
  };
  const row = {
    source_ref: expected.sourceRef,
    change_id: expected.changeId,
    source_line: expected.sourceLine,
    task_hash: expected.taskRevision,
    identity_status: 'DECLARED_ID',
  };

  it('requires exact source, change, line, revision, and resolved identity', () => {
    expect(matchesCurrentTaskSourceIndexRowV1(row, expected)).toBe(true);
    expect(matchesCurrentTaskSourceIndexRowV1(null, expected)).toBe(false);
    expect(matchesCurrentTaskSourceIndexRowV1({ ...row, task_hash: `sha256:${'0'.repeat(64)}` }, expected)).toBe(false);
    expect(matchesCurrentTaskSourceIndexRowV1({ ...row, identity_status: 'AMBIGUOUS' }, expected)).toBe(false);
  });

  it('carries the anchored task reference from the workboard through index readback', async () => {
    const view = vi.spyOn(taskReceiptView, 'readOpenSpecTaskReceiptView');
    const taskKey = 'sample:DOC-14';
    view.mockResolvedValue({
      status: 'FOUND',
      task: { key: taskKey, text: 'Review documentation', sourceRef: expected.sourceRef, revision: expected.taskRevision, checkboxState: 'Open' },
      identity: {
        workboardTaskId: taskKey,
        logicalTaskKey: taskKey,
        stableKey: taskKey,
        sourceRef: 'openspec/changes/sample/tasks.md',
        sourceFileSha256: expected.taskRevision,
        workboardSnapshotSha256: expected.taskRevision,
      },
      current: null,
      staleCount: 0,
    });

    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...row, source_ref: 'openspec/changes/sample/tasks.md#L13' }] });
    const pool = { query };
    try {
      const result = await runTaskToAceVerticalSliceV1({ taskKey, pool });
      expect(query).toHaveBeenNthCalledWith(1, expect.any(String), [expected.sourceRef]);
      expect(result.status).toBe('BLOCKED_NO_ADMITTED_SOURCE_CHUNKS');

      const substituted = await runTaskToAceVerticalSliceV1({ taskKey, pool });
      expect(substituted.status).toBe('BLOCKED_TASK_SOURCE_INDEX_MISMATCH');
      expect(substituted.contextManifest).toBeNull();
      expect(query).toHaveBeenCalledTimes(3);

      const targetSourceRef = 'src/lib/server/atlas/openspec-board/task-to-ace-vertical-slice-v1.ts';
      const sourceBytes = await fs.readFile(path.resolve(targetSourceRef));
      query.mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [{
          source_ref: targetSourceRef,
          source_revision: `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`,
          workspace_revision: expected.taskRevision,
        }] })
        .mockRejectedValueOnce(new Error('simulated graph query failure'));
      const unavailable = await runTaskToAceVerticalSliceV1({ taskKey, pool, targetSourceRef, repoRoot: process.cwd() });
      expect(unavailable.status).toBe('BLOCKED_GRAPH_SNAPSHOT_READBACK_FAILED');
      expect(unavailable.blocker).toBe('GRAPH_SNAPSHOT_QUERY_FAILED');
      expect(unavailable.contextManifest).toBeNull();
      expect(query).toHaveBeenCalledTimes(6);
    } finally {
      view.mockRestore();
    }
  });
});

describe('resolveCurrentGraphRevisionForWorkspaceV1', () => {
  const workspaceRevision = `sha256:${'a'.repeat(64)}`;
  const validRow = {
    status: 'VALIDATED',
    workspace_revision: workspaceRevision,
    source_inventory_revision: `sha256:${'b'.repeat(64)}`,
    graph_revision: 'c'.repeat(64),
    revision_checksum: 'd'.repeat(64),
    node_count: 2,
    edge_count: 1,
  };

  it('returns only a sealed validated graph revision for the exact workspace', () => {
    expect(resolveCurrentGraphRevisionForWorkspaceV1([validRow], workspaceRevision)).toBe(`sha256:${'c'.repeat(64)}`);
    expect(resolveCurrentGraphRevisionForWorkspaceV1([{ ...validRow, status: 'SUPERSEDED' }], workspaceRevision)).toBeNull();
    expect(resolveCurrentGraphRevisionForWorkspaceV1([{ ...validRow, workspace_revision: `sha256:${'e'.repeat(64)}` }], workspaceRevision)).toBeNull();
    expect(resolveCurrentGraphRevisionForWorkspaceV1([{ ...validRow, source_inventory_revision: null }], workspaceRevision)).toBeNull();
    expect(resolveCurrentGraphRevisionForWorkspaceV1([{ ...validRow, edge_count: 0 }], workspaceRevision)).toBeNull();
  });
});

const repoRoot = path.resolve(process.cwd(), '..');
const dbUrl = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

describe('Task-to-ACE Vertical Slice (P0 Canonical Readback + P1 Error-Agent Receipt)', () => {
  let pool: pg.Pool;
  let dbReachable = false;

  beforeAll(async () => {
    pool = new pg.Pool({
      connectionString: dbUrl,
      max: 1,
      connectionTimeoutMillis: 3000,
      options: '-c default_transaction_read_only=on',
    });
    try {
      await pool.query('SELECT 1');
      dbReachable = true;
    } catch {
      dbReachable = false;
    }
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
  });

  it('fails closed without fabricating rows when a task ledger has zero PROVEN chunks in codebase_chunk_index', async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const res = await runTaskToAceVerticalSliceV1({
      taskKey: 'parent-atlas-candidate-feature-execution-fabric:QUEUE-01A',
      targetSourceRef: 'nonexistent/unindexed-ledger-file.md',
      onlyTargetSourceRef: true,
      repoRoot,
      pool,
    });
    console.info('Live missing-source probe:', res.status);
    if (res.status === 'BLOCKED_TASK_SOURCE_INDEX_MISMATCH') {
      expect(res.contextManifest).toBeNull();
      expect(res.canonicalAuthority).toBe(false);
      expect(res.writesPerformed).toBe(false);
      return;
    }
    expect(res.status).toBe('BLOCKED_NO_ADMITTED_SOURCE_CHUNKS');
    expect(res.provenChunks).toHaveLength(0);
    expect(res.contextManifest).toBeNull();
    expect(res.canonicalAuthority).toBe(false);
    expect(res.writesPerformed).toBe(false);
  });

  it('uses a real graph snapshot and otherwise blocks the live task-to-ACE slice', async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const result = await runTaskToAceVerticalSliceV1({
      taskKey: 'parent-atlas-ml-graph-retrieval-convergence:ML-CPU-01',
      targetSourceRef: 'scripts/atlas/train-policy-reranker.py',
      tokenBudget: 512,
      errorSignature: 'TS2345: vertical slice verified proof',
      repoRoot,
      pool,
    });
    console.info('Live graph-dependent probe:', result.status);

    if (result.status === 'BLOCKED_NO_CURRENT_GRAPH_SNAPSHOT') {
      const workspaceRevision = result.provenChunks[0]!.workspaceRevision;
      const { rows } = await pool.query(
        `SELECT status, count(*)::int AS total,
                (count(*) FILTER (WHERE workspace_revision = $1))::int AS workspace_matches
           FROM public.atlas_graph_snapshots_v2 GROUP BY status ORDER BY status`,
        [workspaceRevision],
      );
      console.info('Live graph snapshot inventory:', JSON.stringify({ workspaceRevision, statuses: rows }));
    }

    if (result.status === 'BLOCKED_TASK_SOURCE_INDEX_MISMATCH'
      || result.status === 'BLOCKED_NO_CURRENT_GRAPH_SNAPSHOT'
      || result.status === 'BLOCKED_REPRESENTATION_REVISION_UNQUALIFIED'
      || result.status === 'BLOCKED_WORKSPACE_REVISION_MISMATCH') {
      expect(result.blocker).toBeTruthy();
      expect(result.contextManifest).toBeNull();
      expect(result.errorAgentReplay).toBeNull();
      expect(result.canonicalAuthority).toBe(false);
      expect(result.writesPerformed).toBe(false);
      return;
    }

    expect(result.status).toBe('ADMITTED_AND_REPLAYED');
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);

    // P0: Task source index + disk-verified PROVEN codebase_chunk_index readback
    expect(result.task?.key).toBe('parent-atlas-ml-graph-retrieval-convergence:ML-CPU-01');
    expect(result.taskSourceIndexRow?.source_ref).toBe('openspec/changes/parent-atlas-ml-graph-retrieval-convergence/tasks.md#L23');
    expect(result.provenChunks.length).toBeGreaterThanOrEqual(1);
    const primaryChunk = result.provenChunks[0]!;
    expect(primaryChunk.sourceRef).toBe('scripts/atlas/train-policy-reranker.py');
    expect(primaryChunk.diskSha256Matched).toBe(true);

    // Verify independent disk sha256 matches the admitted chunk's sourceRevision
    const diskBytes = await fs.readFile(path.join(repoRoot, primaryChunk.sourceRef));
    const expectedSha = `sha256:${createHash('sha256').update(diskBytes).digest('hex')}`;
    expect(primaryChunk.sourceRevision).toBe(expectedSha);

    // P0: Domain proposal & ACE ContextManifest admission within token budget
    expect(result.domainTupleProposal.status).toBe('PROPOSAL_ONLY');
    expect(result.domainTupleProposal.rows[0]?.sourceRevision).toBe(result.task?.revision);
    expect(result.contextManifest).not.toBeNull();
    expect(result.contextManifest!.v1.tokenBudget).toBe(512);
    expect(result.contextManifest!.v1.evidenceRefs.length).toBeGreaterThanOrEqual(1);

    // P1: Error-Agent execution spine closed with matching receipt checksum + ACP proposal
    expect(result.errorAgentReplay?.closedStatus).toBe('COMPLETE');
    expect(result.errorAgentReplay?.completedSteps).toBe(1);
    expect(result.errorAgentReplay?.receiptOutputChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.errorAgentReplay?.receiptEnvelopeChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.acpProposal).toMatchObject({
      admission: 'PROPOSAL_ONLY',
      canonicalAuthority: false,
      writesPerformed: false,
    });
  });
});
