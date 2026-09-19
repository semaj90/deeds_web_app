import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (flag) => {
  const index = argv.indexOf(flag);
  return index === -1 ? null : argv[index + 1] ?? null;
};

const repoRoot = resolve(valueOf('--repo-root') ?? process.cwd());
const journalPath = valueOf('--journal');
const openspecChange = valueOf('--openspec-change');
const outputPath = resolve(repoRoot, valueOf('--output') ?? 'docs/reports/workflow-run-receipt-audit-v1.json');
const dryRun = has('--dry-run') || !has('--apply');

if (!journalPath) throw new Error('WORKFLOW_RECEIPT_INVALID: missing --journal <path>');
if (!openspecChange || !/^[-a-zA-Z0-9_]+$/.test(openspecChange)) {
  throw new Error('WORKFLOW_RECEIPT_INVALID: missing or unsafe --openspec-change');
}

const changesRoot = resolve(repoRoot, 'openspec/changes');
const changeRoot = resolve(changesRoot, openspecChange);
const relativeChange = relative(changesRoot, changeRoot);
if (relativeChange.startsWith('..') || relativeChange.includes(':')) {
  throw new Error('WORKFLOW_RECEIPT_INVALID: change path escapes openspec/changes');
}
if (!existsSync(resolve(changeRoot, 'tasks.md'))) {
  throw new Error(`WORKFLOW_RECEIPT_INVALID: missing ${resolve(changeRoot, 'tasks.md')}`);
}

const journalAbsolute = resolve(repoRoot, journalPath);
const journalText = await readFile(journalAbsolute, 'utf8');
const lines = journalText.split(/\r?\n/).filter((line) => line.trim() !== '');
const malformedLines = [];
const records = [];

for (let index = 0; index < lines.length; index += 1) {
  try {
    const value = JSON.parse(lines[index]);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      malformedLines.push(index + 1);
      continue;
    }
    records.push({ line: index + 1, value });
  } catch {
    malformedLines.push(index + 1);
  }
}

if (malformedLines.length > 0) {
  throw new Error(`WORKFLOW_RECEIPT_INVALID: malformed journal lines ${malformedLines.join(',')}`);
}

const first = (value, keys) => {
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null && value[key] !== '') return value[key];
  }
  return null;
};

const groups = new Map();
for (const record of records) {
  const value = record.value;
  const workflowId = first(value, ['workflowId', 'workflow_id']);
  if (!workflowId) continue;
  const kind = String(first(value, ['kind', 'type', 'event']) ?? '').toLowerCase();
  // Inner agent/tool events are evidence for the enclosing run, not separate receipts.
  const isInnerCall = kind.includes('agent') || kind.includes('tool') || value.agentCall === true || value.toolCall === true;
  const key = String(workflowId);
  const group = groups.get(key) ?? { workflowId: key, lines: [], records: [], innerCalls: 0 };
  group.lines.push(record.line);
  group.records.push(value);
  if (isInnerCall) group.innerCalls += 1;
  groups.set(key, group);
}

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const events = [...groups.values()].sort((a, b) => a.workflowId.localeCompare(b.workflowId)).map((group) => {
  const terminal = [...group.records].reverse().find((value) => first(value, ['state', 'status', 'outcome'])) ?? {};
  const tokenValues = group.records
    .map((value) => first(value, ['tokensUsed', 'tokens_used', 'tokenCount']))
    .filter((value) => Number.isFinite(Number(value)));
  const durationValues = group.records
    .map((value) => first(value, ['durationMs', 'duration_ms']))
    .filter((value) => Number.isFinite(Number(value)));
  const agentLabel = first(group.records[0] ?? {}, ['agentLabel', 'agent_label', 'label']);
  const evidenceHash = digest({ journal: journalAbsolute, workflowId: group.workflowId, lines: group.lines, records: group.records });
  return {
    schema: 'atlas.workflow-action.v1',
    workflowId: group.workflowId,
    actionId: 'workflow-run',
    sequence: 1,
    kind: 'completed',
    openspecChange,
    operation: 'workflow-run-receipt',
    state: String(first(terminal, ['state', 'status', 'outcome']) ?? 'succeeded'),
    ...(agentLabel ? { agentLabel: String(agentLabel) } : {}),
    ...(tokenValues.length ? { tokensUsed: tokenValues.reduce((sum, value) => sum + Number(value), 0) } : {}),
    ...(durationValues.length ? { durationMs: Math.max(...durationValues.map(Number)) } : {}),
    evidenceRefs: [`journal:${journalPath}#lines=${group.lines.join(',')}`],
    evidenceHash,
    innerEventCount: group.innerCalls,
  };
});

const result = {
  schema: 'atlas.workflow-run-receipt-audit.v1',
  status: groups.size === 0 ? 'UNQUALIFIED_NO_WORKFLOW_ID' : (dryRun ? 'DRY_RUN_READY' : 'APPLY_REQUESTED'),
  journal: journalPath,
  openspecChange,
  parsedLineCount: lines.length,
  workflowCount: events.length,
  innerEventsGrouped: events.reduce((sum, event) => sum + event.innerEventCount, 0),
  events,
  writesPerformed: false,
  canonicalAuthority: false,
  notes: [
    'One receipt is emitted per workflowId; inner agent/tool calls remain evidence.',
    'Missing usage fields are omitted rather than synthesized.',
    ...(groups.size === 0 ? ['No workflowId/workflow_id was present; no receipt was synthesized.'] : []),
    dryRun ? 'Dry run only; use --apply only after explicit authorization.' : 'Apply delegates each event to the existing idempotent recorder.',
  ],
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

if (!dryRun && events.length > 0) {
  for (const event of events) {
    await new Promise((resolvePromise, reject) => {
      const child = spawn(process.execPath, [resolve(repoRoot, 'scripts/atlas/record-agentic-run-receipt.mjs'), '--repo-root', repoRoot, '--event-json', JSON.stringify(event), '--apply'], { stdio: ['ignore', 'inherit', 'inherit'] });
      child.once('error', reject);
      child.once('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`workflow receipt recorder exited ${code}`)));
    });
  }
  result.status = 'RECORDED';
  result.writesPerformed = true;
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify(result, null, 2));
