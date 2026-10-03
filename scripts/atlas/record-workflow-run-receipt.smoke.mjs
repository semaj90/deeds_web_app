import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./record-workflow-run-receipt.mjs', import.meta.url));
const root = await mkdtemp(join(tmpdir(), 'atlas-workflow-receipt-'));
const changeRoot = join(root, 'openspec', 'changes', 'smoke-change');
const journalPath = 'tmp/workflow-journal.jsonl';
const journalAbsolute = join(root, journalPath);
const outputPath = 'docs/reports/workflow-receipt-audit.json';

const canonicalEvent = {
  schema: 'atlas.workflow-action.v1',
  workflowId: 'wf-smoke',
  workflowRevision: 1,
  runId: 'run-smoke',
  sequence: 7,
  actionId: 'workflow-complete',
  dagNodeId: 'node:workflow-complete',
  attempt: 1,
  lane: 'validator',
  kind: 'completed',
  receiptId: 'receipt:workflow-complete',
  evidenceRefs: ['evidence:smoke'],
  metadata: { state: 'succeeded', operation: 'smoke workflow', progress: { fraction: 1 } },
  producerRevision: 'smoke-producer-v1',
};

await mkdir(changeRoot, { recursive: true });
await mkdir(join(root, 'tmp'), { recursive: true });
await writeFile(join(changeRoot, 'tasks.md'), '# Smoke\n', 'utf8');
await writeFile(journalAbsolute, `${JSON.stringify(canonicalEvent)}\n${JSON.stringify({ workflowId: 'wf-smoke', kind: 'tool_call', toolCall: true })}\n`, 'utf8');

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, '--repo-root', root, '--journal', journalPath, '--openspec-change', 'smoke-change', '--output', outputPath, ...args], {
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
  const dryRun = await run(['--dry-run']);
  if (dryRun.code !== 0) throw new Error(`canonical dry-run command failed: ${dryRun.stderr}`);
  const dryResult = JSON.parse(dryRun.stdout);
  if (dryResult.status !== 'DRY_RUN_READY' || dryResult.writesPerformed) {
    throw new Error(`canonical dry-run failed: ${dryRun.stderr}`);
  }

  const applied = await run(['--apply']);
  if (applied.code !== 0) throw new Error(`canonical apply command failed: ${applied.stderr}`);
  const appliedResult = JSON.parse(applied.stdout);
  if (appliedResult.status !== 'RECORDED' || !appliedResult.writesPerformed) {
    throw new Error(`canonical apply failed: ${applied.stderr}`);
  }
  const receipts = await readFile(join(changeRoot, 'receipts.jsonl'), 'utf8');
  const rows = receipts.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  if (rows.length !== 1 || rows[0].schema !== 'atlas.workflow-action.v1') {
    throw new Error('ledger did not contain exactly one canonical event');
  }
  if (rows[0].runId !== canonicalEvent.runId || rows[0].sequence !== canonicalEvent.sequence
    || rows[0].metadata.openspecChange !== 'smoke-change') {
    throw new Error('canonical workflow identity or OpenSpec binding changed');
  }

  const blockedJournal = join(root, 'tmp', 'incomplete-journal.jsonl');
  await writeFile(blockedJournal, `${JSON.stringify({ workflowId: 'wf-incomplete', state: 'completed' })}\n`, 'utf8');
  const blocked = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, '--repo-root', root, '--journal', 'tmp/incomplete-journal.jsonl', '--openspec-change', 'smoke-change', '--output', 'docs/reports/incomplete-audit.json', '--apply'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
  const blockedResult = JSON.parse(blocked.stdout);
  if (blocked.code !== 2 || blockedResult.status !== 'BLOCKED_UNQUALIFIED_CANONICAL_EVENT'
    || blockedResult.writesPerformed || blockedResult.qualifiedWorkflowCount !== 0) {
    throw new Error(`incomplete event did not fail closed: ${blocked.stderr}`);
  }

  const finalReceipts = await readFile(join(changeRoot, 'receipts.jsonl'), 'utf8');
  if (finalReceipts.trim().split(/\r?\n/).length !== 1) throw new Error('blocked event modified the receipt ledger');
  console.log('record-workflow-run-receipt: canonical apply + incomplete-event fail-closed PASS');
} finally {
  await rm(root, { recursive: true, force: true });
}
