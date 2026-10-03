import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./record-agentic-run-receipt.mjs', import.meta.url));
const root = await mkdtemp(join(tmpdir(), 'atlas-run-receipt-'));
const changeRoot = join(root, 'openspec', 'changes', 'smoke-change');
await writeFile(join(changeRoot, 'tasks.md'), '# Smoke\n', 'utf8').catch(async (error) => {
  if (error.code !== 'ENOENT') throw error;
  await (await import('node:fs/promises')).mkdir(changeRoot, { recursive: true });
  await writeFile(join(changeRoot, 'tasks.md'), '# Smoke\n', 'utf8');
});

const event = JSON.stringify({
  schema: 'atlas.workflow-action.v1',
  workflowId: 'wf-smoke',
  workflowRevision: 1,
  runId: 'run-smoke',
  actionId: 'RUN_TESTS',
  sequence: 1,
  dagNodeId: 'node:smoke',
  attempt: 1,
  lane: 'validator',
  kind: 'completed',
  receiptId: 'receipt:smoke',
  metadata: { state: 'succeeded', operation: 'smoke receipt', openspecChange: 'smoke-change' },
  producerRevision: 'smoke-v1',
});

function run(args, eventJson = event) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, '--repo-root', root, '--event-json', eventJson, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

try {
  const invalidEvent = JSON.parse(event);
  delete invalidEvent.runId;
  const rejected = await run(['--apply'], JSON.stringify(invalidEvent));
  if (rejected.code === 0 || !rejected.stderr.includes('canonical WorkflowActionEventV1')) {
    throw new Error('noncanonical event was not rejected before write');
  }
  if ((await readFile(join(changeRoot, 'tasks.md'), 'utf8')) !== '# Smoke\n') {
    throw new Error('invalid event modified tasks.md');
  }

  const first = await run(['--apply']);
  if (first.code !== 0 || !JSON.parse(first.stdout).writesPerformed) throw new Error(`first apply failed: ${first.stderr}`);
  const second = await run(['--apply']);
  if (second.code !== 0 || JSON.parse(second.stdout).status !== 'NO_OP_ALREADY_RECORDED') {
    throw new Error(`idempotent replay failed: ${second.stderr}`);
  }
  const nextRevision = JSON.parse(event);
  nextRevision.workflowRevision = 2;
  nextRevision.runId = 'run-smoke-revision-2';
  const revisionApply = await run(['--apply'], JSON.stringify(nextRevision));
  if (revisionApply.code !== 0 || !JSON.parse(revisionApply.stdout).writesPerformed) {
    throw new Error(`new workflow revision was incorrectly deduplicated: ${revisionApply.stderr}`);
  }
  const revisionReplay = await run(['--apply'], JSON.stringify(nextRevision));
  if (revisionReplay.code !== 0 || JSON.parse(revisionReplay.stdout).status !== 'NO_OP_ALREADY_RECORDED') {
    throw new Error(`same-revision idempotent replay failed: ${revisionReplay.stderr}`);
  }
  const conflictingReplay = { ...nextRevision, runId: 'different-run-same-canonical-coordinate' };
  const conflict = await run(['--apply'], JSON.stringify(conflictingReplay));
  if (conflict.code === 0 || !conflict.stderr.includes('RUN_RECEIPT_CONFLICT')) {
    throw new Error('different payload under the same canonical receipt coordinate was not rejected');
  }
  const tasks = await readFile(join(changeRoot, 'tasks.md'), 'utf8');
  const receipts = await readFile(join(changeRoot, 'receipts.jsonl'), 'utf8');
  if ((tasks.match(/## Run Receipts/g) ?? []).length !== 1) throw new Error('receipt heading duplicated');
  if (receipts.trim().split(/\r?\n/).length !== 2) throw new Error('receipt ledger must contain one row per workflow revision');
  if ((tasks.match(/wf-smoke@r[12]\/RUN_TESTS#1/g) ?? []).length !== 2) throw new Error('human receipt summary omitted workflow revision');
  console.log('record-agentic-run-receipt: apply + same-revision replay + cross-revision identity + conflict rejection PASS');
} finally {
  await rm(root, { recursive: true, force: true });
}
