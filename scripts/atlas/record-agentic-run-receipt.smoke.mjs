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
  actionId: 'RUN_TESTS',
  sequence: 1,
  kind: 'completed',
  state: 'succeeded',
  operation: 'smoke receipt',
  openspecChange: 'smoke-change',
});

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, '--repo-root', root, '--event-json', event, ...args], {
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
  const first = await run(['--apply']);
  if (first.code !== 0 || !JSON.parse(first.stdout).writesPerformed) throw new Error(`first apply failed: ${first.stderr}`);
  const second = await run(['--apply']);
  if (second.code !== 0 || JSON.parse(second.stdout).status !== 'NO_OP_ALREADY_RECORDED') {
    throw new Error(`idempotent replay failed: ${second.stderr}`);
  }
  const tasks = await readFile(join(changeRoot, 'tasks.md'), 'utf8');
  const receipts = await readFile(join(changeRoot, 'receipts.jsonl'), 'utf8');
  if ((tasks.match(/## Run Receipts/g) ?? []).length !== 1) throw new Error('receipt heading duplicated');
  if (receipts.trim().split(/\r?\n/).length !== 1) throw new Error('receipt ledger duplicated');
  console.log('record-agentic-run-receipt: apply + idempotent replay PASS');
} finally {
  await rm(root, { recursive: true, force: true });
}
