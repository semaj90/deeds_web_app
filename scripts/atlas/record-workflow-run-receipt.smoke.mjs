import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./record-workflow-run-receipt.mjs', import.meta.url));
const root = await mkdtemp(join(tmpdir(), 'atlas-workflow-run-receipt-'));
const changeRoot = join(root, 'openspec', 'changes', 'smoke-change');
const journal = join(root, 'journal.jsonl');
await (await import('node:fs/promises')).mkdir(changeRoot, { recursive: true });
await writeFile(join(changeRoot, 'tasks.md'), '# Smoke\n', 'utf8');
await writeFile(journal, [
  JSON.stringify({ workflowId: 'wf-smoke', kind: 'workflow-start', agentLabel: 'smoke', tokensUsed: 4 }),
  JSON.stringify({ workflowId: 'wf-smoke', kind: 'tool-call', toolCall: true, tokensUsed: 6 }),
  JSON.stringify({ workflowId: 'wf-smoke', kind: 'workflow-complete', status: 'succeeded', durationMs: 12 }),
].join('\n') + '\n', 'utf8');

const run = () => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [
    script, '--repo-root', root, '--journal', 'journal.jsonl',
    '--openspec-change', 'smoke-change', '--output', 'report.json', '--dry-run',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => resolve({ code, stdout, stderr }));
});

try {
  const result = await run();
  if (result.code !== 0) throw new Error(result.stderr);
  const receipt = JSON.parse(result.stdout);
  if (receipt.workflowCount !== 1 || receipt.innerEventsGrouped !== 1 || receipt.writesPerformed) {
    throw new Error('workflow receipt grouping or write guard failed');
  }
  const report = JSON.parse(await readFile(join(root, 'report.json'), 'utf8'));
  if (report.events[0].tokensUsed !== 10 || report.events[0].durationMs !== 12) {
    throw new Error('usage aggregation failed');
  }
  console.log('record-workflow-run-receipt: dry-run grouping PASS');
} finally {
  await rm(root, { recursive: true, force: true });
}
