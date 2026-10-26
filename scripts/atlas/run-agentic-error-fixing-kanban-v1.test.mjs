import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const planner = path.join(root, 'scripts/atlas/run-agentic-error-fixing-v1.mjs');
const boardBuilder = path.join(root, 'scripts/atlas/build-error-fixing-kanban-tasks-v1.mjs');

test('audit gates and a timed-out pipeline stage retain distinct evidence in the Kanban preview', () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'atlas-error-kanban-'));
  try {
    const diagnosticsPath = path.join(tempDir, 'gates.txt');
    const planPath = path.join(tempDir, 'plan.json');
    const boardPath = path.join(tempDir, 'board.json');
    const lines = [
      'SYMBOLS_RESOLVED=PARTIAL_PROVEN 18,881 of 20,744 processed; 704 unprocessed.',
      'SEMANTIC_OWNER_PROVEN=PARTIAL_PROVEN row-level provenance absent; api_key=secret-value.',
      'LATENT_FAMILY_PROVEN=PARTIAL_PROVEN input snapshot digest missing.',
      'PROJECTIONS_CHECKSUM_ALIGNED=NOT_PROVEN no per-run checksum receipt.',
      'BITFROST_KEYS_DERIVABLE=NOT_PROVEN zero admitted v1 keys.',
      'ACE_EVIDENCE_GROUNDED=NOT_PROVEN retrieval-to-ContextManifest readback missing.',
      'TURBOVEC_DRY_RUN_TIMEOUT=TIMEOUT Graphify downstream dry-run stage exceeded 180 seconds.',
      'GRAPHIFY_LIFECYCLE_STALE=STALE lifecycle receipt remains RUNNING for a September execution; no matching process is live.',
      'TURBOVEC_RUNTIME_ALIGNMENT=PARTIAL_PROVEN Python TurboVec health on :8791 reports indexed=0 dim=64 bits=4 turbovec=false; workload requires an admitted index before clustering.',
      'TURBOVEC_CANDIDATE_ORDINAL_BRIDGE=BLOCKED Qdrant codebase_chunks_768 has 328348 points; bounded sample 1000/1000 has no CandidateOrdinal and exact chunk_id join to the 100000-entry current chunk map matches 0/1000.',
      'TURBOVEC_SYNTHETIC_FALLBACK=BLOCKED scripts/atlas/kanban-turbovec-consolidation.mts used pseudo-embeddings and hash-derived cluster IDs when dependencies were unavailable.',
      'PGVECTOR_EXACT_HNSW_REPLAY=PARTIAL_PROVEN 2 queries top-k=5 exact sequential scan vs HNSW index: Recall@5 1.0 on both; row revision columns null and embedding recipe provenance unqualified, diagnostic only.',
    ];
    writeFileSync(diagnosticsPath, `${lines.join('\n')}\n`);

    execFileSync(process.execPath, [planner, '--file', diagnosticsPath, '--report', planPath, '--offline'], { cwd: root });
    const plan = JSON.parse(readFileSync(planPath, 'utf8'));
    assert.equal(plan.modelResolution.status, 'SKIPPED_OFFLINE');
    assert.equal(plan.candidateCount, 12);
    assert.deepEqual(new Set(plan.candidates.map((candidate) => candidate.gateId)), new Set([
      'SYMBOLS_RESOLVED',
      'SEMANTIC_OWNER_PROVEN',
      'LATENT_FAMILY_PROVEN',
      'PROJECTIONS_CHECKSUM_ALIGNED',
      'BITFROST_KEYS_DERIVABLE',
      'ACE_EVIDENCE_GROUNDED',
      'TURBOVEC_DRY_RUN_TIMEOUT',
      'GRAPHIFY_LIFECYCLE_STALE',
      'TURBOVEC_RUNTIME_ALIGNMENT',
      'TURBOVEC_CANDIDATE_ORDINAL_BRIDGE',
      'TURBOVEC_SYNTHETIC_FALLBACK',
      'PGVECTOR_EXACT_HNSW_REPLAY',
    ]));
    assert.ok(plan.candidates.every((candidate) => candidate.diagnostic));
    assert.ok(!JSON.stringify(plan).includes('secret-value'));
    assert.equal(plan.candidates.find((candidate) => candidate.gateId === 'PGVECTOR_EXACT_HNSW_REPLAY')?.kind, 'RETRIEVAL_OR_PROJECTION');
    assert.equal(plan.candidates.find((candidate) => candidate.gateId === 'GRAPHIFY_LIFECYCLE_STALE')?.kind, 'GRAPH_OR_GPU');
    assert.equal(plan.candidates.find((candidate) => candidate.gateId === 'TURBOVEC_RUNTIME_ALIGNMENT')?.kind, 'RETRIEVAL_OR_PROJECTION');
    assert.equal(plan.candidates.find((candidate) => candidate.gateId === 'TURBOVEC_CANDIDATE_ORDINAL_BRIDGE')?.kind, 'RETRIEVAL_OR_PROJECTION');

    writeFileSync(boardPath, JSON.stringify({ generated: 'fixture', tasks: [{ id: 'keep-me', origin: 'other' }] }));
    execFileSync(process.execPath, [boardBuilder, '--input', planPath, '--board', boardPath], { cwd: root });
    const board = JSON.parse(readFileSync(boardPath, 'utf8'));
    const tasks = board.tasks.filter((task) => task.origin === 'agentic_error_fixing_v1');
    const gateIds = new Set(plan.candidates.map((candidate) => candidate.gateId));
    assert.equal(tasks.length, 12);
    assert.ok(board.tasks.some((task) => task.id === 'keep-me'));
    assert.deepEqual(new Set(tasks.map((task) => task.reason_codes.find((code) => gateIds.has(code)))), gateIds);
    for (const task of tasks) {
      const gateId = task.reason_codes.find((code) => gateIds.has(code));
      assert.ok(gateId);
      assert.ok(task.evidence_refs.some((evidence) => evidence.startsWith(`${gateId}=`)));
      assert.equal(task.status, 'PROPOSED');
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('merge mode adds a new diagnostic without replacing existing agentic proposals', () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'atlas-error-kanban-merge-'));
  try {
    const planPath = path.join(tempDir, 'plan.json');
    const boardPath = path.join(tempDir, 'board.json');
    const existingTask = {
      id: 'err-fix:existing-timeout',
      origin: 'agentic_error_fixing_v1',
      status: 'PROPOSED',
      reason_codes: ['TIMEOUT', 'TURBOVEC_DRY_RUN_TIMEOUT'],
    };
    const unrelatedTask = { id: 'err-fix:existing-other', origin: 'agentic_error_fixing_v1', status: 'PROPOSED', reason_codes: ['OTHER_GATE'] };
    execFileSync(process.execPath, [planner, '--text', 'TURBOVEC_DRY_RUN_TIMEOUT=TIMEOUT TurboVec downstream dry-run timed out after 180 seconds.', '--report', planPath, '--offline'], { cwd: root });
    writeFileSync(boardPath, JSON.stringify({ tasks: [existingTask, unrelatedTask] }));

    execFileSync(process.execPath, [boardBuilder, '--input', planPath, '--board', boardPath, '--merge'], { cwd: root });
    const board = JSON.parse(readFileSync(boardPath, 'utf8'));
    assert.ok(!board.tasks.some((task) => task.id === existingTask.id));
    assert.ok(board.tasks.some((task) => task.id === unrelatedTask.id));
    const timeoutTasks = board.tasks.filter((task) => task.reason_codes?.includes('TURBOVEC_DRY_RUN_TIMEOUT'));
    assert.equal(timeoutTasks.length, 1);
    assert.equal(timeoutTasks[0].status, 'PROPOSED');

    execFileSync(process.execPath, [boardBuilder, '--input', planPath, '--board', boardPath, '--merge'], { cwd: root });
    const rerun = JSON.parse(readFileSync(boardPath, 'utf8'));
    assert.equal(rerun.tasks.filter((task) => task.reason_codes?.includes('TURBOVEC_DRY_RUN_TIMEOUT')).length, 1);
    assert.ok(rerun.tasks.some((task) => task.id === unrelatedTask.id));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('structured Graphify eligibility produces gate-specific non-dispatching proposals', () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'atlas-graphify-eligibility-'));
  try {
    const diagnosticsPath = path.join(tempDir, 'eligibility.json');
    const planPath = path.join(tempDir, 'plan.json');
    const boardPath = path.join(tempDir, 'board.json');
    const previewPath = path.join(tempDir, 'preview.json');
    const report = {
      schema: 'atlas.graphify-current-run-eligibility.v1',
      runningRunCount: 0,
      staleRunCount: 19,
      currentRunCount: 0,
      receiptConsistency: {
        selectedExecutionId: 'selected-run-id',
        dailyExecutionId: 'daily-run-id',
      },
      blockers: [
        'DECISION_DAILY_EXECUTION_ID_MISMATCH',
        'AUTHORITY_TABLE_DOES_NOT_CONFIRM_DECISION_RECEIPT',
        'CURRENT_RUN_NOT_ESTABLISHED',
        'REPOSITORY_REVISION_NOT_CURRENT',
      ],
      canonicalAuthority: false,
      writesPerformed: false,
    };
    writeFileSync(diagnosticsPath, `${JSON.stringify(report, null, 2)}\n`);

    execFileSync(process.execPath, [planner, '--file', diagnosticsPath, '--report', planPath, '--offline'], { cwd: root });
    const plan = JSON.parse(readFileSync(planPath, 'utf8'));
    assert.equal(plan.candidateCount, 4);
    assert.deepEqual(plan.candidates.map((candidate) => candidate.gateId), [...report.blockers].sort());
    assert.ok(plan.candidates.every((candidate) => candidate.kind === 'GRAPH_OR_GPU'));
    assert.ok(plan.candidates.every((candidate) => candidate.owner === 'Graphify lifecycle authority'));
    assert.ok(plan.candidates.every((candidate) => candidate.diagnostic.includes('selected-run-id') && candidate.diagnostic.includes('daily-run-id')));
    assert.ok(plan.candidates.every((candidate) => candidate.status === 'PROPOSED' && candidate.mutationAllowed === false));
    assert.equal(plan.canonicalAuthority, false);
    assert.equal(plan.writesPerformed, false);

    const boardBefore = JSON.stringify({ generated: 'fixture', tasks: [{ id: 'keep', origin: 'other' }] });
    writeFileSync(boardPath, boardBefore);
    execFileSync(process.execPath, [boardBuilder, '--input', planPath, '--board', boardPath, '--dry-run', '--merge', '--receipt', previewPath], { cwd: root });
    assert.equal(readFileSync(boardPath, 'utf8'), boardBefore);
    const preview = JSON.parse(readFileSync(previewPath, 'utf8'));
    assert.equal(preview.candidateCount, 4);
    assert.equal(preview.boardWritesPerformed, false);
    assert.equal(preview.databaseWritesPerformed, false);
    assert.equal(preview.dispatchPerformed, false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('dry-run retains board bytes and emits non-dispatching preview receipt', () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'atlas-error-preview-'));
  try {
    const planPath = path.join(tempDir, 'plan.json');
    const boardPath = path.join(tempDir, 'board.json');
    const receiptPath = path.join(tempDir, 'receipt.json');
    execFileSync(process.execPath, [planner, '--text', 'GRAPHIFY_GATE=BLOCKED Source lineage unproven.', '--report', planPath, '--offline'], { cwd: root });
    const before = JSON.stringify({ tasks: [{ id: 'preserve', status: 'done' }] });
    writeFileSync(boardPath, before);
    execFileSync(process.execPath, [boardBuilder, '--input', planPath, '--board', boardPath, '--dry-run', '--receipt', receiptPath], { cwd: root });
    assert.equal(readFileSync(boardPath, 'utf8'), before);
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    assert.equal(receipt.status, 'BOARD_PREVIEW');
    assert.equal(receipt.boardWritesPerformed, false);
    assert.equal(receipt.databaseWritesPerformed, false);
    assert.equal(receipt.dispatchPerformed, false);
    assert.match(receipt.planFileChecksum, /^sha256:[a-f0-9]{64}$/);
  } finally { rmSync(tempDir, { recursive: true, force: true }); }
});

test('invalid proposal authority, duplicate IDs, and malformed board cannot overwrite existing tasks', () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'atlas-error-rejection-'));
  try {
    const planPath = path.join(tempDir, 'plan.json');
    const boardPath = path.join(tempDir, 'board.json');
    execFileSync(process.execPath, [planner, '--text', 'GRAPHIFY_GATE=BLOCKED Source lineage unproven.', '--report', planPath, '--offline'], { cwd: root });
    const valid = JSON.parse(readFileSync(planPath, 'utf8'));
    const before = JSON.stringify({ tasks: [{ id: 'preserve' }] });
    for (const mutate of [
      (plan) => { plan.candidates[0].status = 'DONE'; },
      (plan) => { plan.candidates[0].mutationAllowed = true; },
      (plan) => { plan.canonicalAuthority = true; },
      (plan) => { plan.candidates.push(plan.candidates[0]); },
    ]) {
      const invalid = structuredClone(valid);
      mutate(invalid);
      writeFileSync(planPath, JSON.stringify(invalid));
      writeFileSync(boardPath, before);
      assert.throws(() => execFileSync(process.execPath, [boardBuilder, '--input', planPath, '--board', boardPath], { cwd: root, stdio: 'pipe' }));
      assert.equal(readFileSync(boardPath, 'utf8'), before);
    }
    writeFileSync(planPath, JSON.stringify(valid));
    for (const malformed of ['not-json', JSON.stringify({ tasks: 'not-an-array' })]) {
      writeFileSync(boardPath, malformed);
      assert.throws(() => execFileSync(process.execPath, [boardBuilder, '--input', planPath, '--board', boardPath], { cwd: root, stdio: 'pipe' }));
      assert.equal(readFileSync(boardPath, 'utf8'), malformed);
    }
  } finally { rmSync(tempDir, { recursive: true, force: true }); }
});

test('receipt collision is rejected before changing board or input artifacts', () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'atlas-error-receipt-'));
  try {
    const planPath = path.join(tempDir, 'plan.json');
    const boardPath = path.join(tempDir, 'board.json');
    const receiptPath = path.join(tempDir, 'receipt.json');
    execFileSync(process.execPath, [planner, '--text', 'GRAPHIFY_GATE=BLOCKED Missing source lineage.', '--report', planPath, '--offline'], { cwd: root });
    const before = JSON.stringify({ tasks: [{ id: 'preserve' }] });
    writeFileSync(boardPath, before);
    writeFileSync(receiptPath, 'preserve receipt');
    assert.throws(() => execFileSync(process.execPath, [boardBuilder, '--input', path.join(tempDir, 'missing.json'), '--board', boardPath], { cwd: root, stdio: 'pipe' }));
    assert.equal(readFileSync(boardPath, 'utf8'), before);
    for (const target of [receiptPath, boardPath, planPath]) {
      assert.throws(() => execFileSync(process.execPath, [boardBuilder, '--input', planPath, '--board', boardPath, '--receipt', target], { cwd: root, stdio: 'pipe' }));
      assert.equal(readFileSync(boardPath, 'utf8'), before);
      assert.equal(readFileSync(receiptPath, 'utf8'), 'preserve receipt');
    }
  } finally { rmSync(tempDir, { recursive: true, force: true }); }
});
