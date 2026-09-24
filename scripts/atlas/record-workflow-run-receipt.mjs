import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
const receiptRecorderPath = fileURLToPath(new URL('./record-agentic-run-receipt.mjs', import.meta.url));
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
const { tsImport } = await import('tsx/esm/api');
const { workflowActionEventSchema } = await tsImport(
  '../../packages/parent-atlas/src/core/workflow-action-event.ts',
  import.meta.url,
);
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
const events = [];
const blockedGroups = [];
for (const group of [...groups.values()].sort((a, b) => a.workflowId.localeCompare(b.workflowId))) {
  const canonicalCompletions = [];
  for (const value of group.records) {
    if (value.schema !== 'atlas.workflow-action.v1') continue;
    const parsed = workflowActionEventSchema.safeParse(value);
    if (parsed.success && parsed.data.workflowId === group.workflowId && parsed.data.kind === 'completed') {
      canonicalCompletions.push(parsed.data);
    }
  }
  const terminal = canonicalCompletions.at(-1);
  if (!terminal) {
    blockedGroups.push({
      workflowId: group.workflowId,
      journalLines: group.lines,
      reason: 'NO_VALID_CANONICAL_COMPLETION_EVENT',
      note: 'No source journal record passed WorkflowActionEventV1 validation as a completed event; identity/revision fields were not synthesized.',
    });
    continue;
  }
  const evidenceHash = digest({ journal: journalAbsolute, workflowId: group.workflowId, lines: group.lines, records: group.records });
  const eventInput = {
    ...terminal,
    metadata: {
      ...terminal.metadata,
      openspecChange,
      workflowJournalEvidenceHash: evidenceHash,
      workflowJournalLineRefs: group.lines.map((line) => `journal:${journalPath}#line=${line}`),
      innerEventCount: group.innerCalls,
    },
  };
  const validated = workflowActionEventSchema.safeParse(eventInput);
  if (!validated.success) {
    blockedGroups.push({
      workflowId: group.workflowId,
      journalLines: group.lines,
      reason: 'CANONICAL_EVENT_ENRICHMENT_INVALID',
      issues: validated.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    });
    continue;
  }
  events.push(validated.data);
}

const result = {
  schema: 'atlas.workflow-run-receipt-audit.v1',
  status: groups.size === 0
    ? 'UNQUALIFIED_NO_WORKFLOW_ID'
    : blockedGroups.length > 0
      ? 'BLOCKED_UNQUALIFIED_CANONICAL_EVENT'
      : (dryRun ? 'DRY_RUN_READY' : 'APPLY_PREFLIGHT'),
  journal: journalPath,
  openspecChange,
  parsedLineCount: lines.length,
  workflowCount: groups.size,
  qualifiedWorkflowCount: events.length,
  blockedGroups,
  innerEventsGrouped: events.reduce((sum, event) => sum + Number(event.metadata.innerEventCount ?? 0), 0),
  events,
  writesPerformed: false,
  auditReportWritten: true,
  canonicalAuthority: false,
  notes: [
    'Only a source journal event that validates as a canonical completed WorkflowActionEventV1 may be bound to this OpenSpec change.',
    'Workflow/action/sequence/run/revision identity is preserved from that source event; missing fields are never synthesized.',
    'Inner agent/tool calls are supporting journal evidence, not additional OpenSpec receipts.',
    ...(groups.size === 0 ? ['No workflowId/workflow_id was present; no receipt was synthesized.'] : []),
    ...(blockedGroups.length ? ['Unqualified groups are reported and excluded; --apply refuses the entire batch if any group is blocked.'] : []),
    dryRun ? 'Dry run only; use --apply only after explicit authorization.' : 'Apply preflights every event, then delegates to the existing schema-validating idempotent recorder.',
  ],
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

if (!dryRun && blockedGroups.length > 0) {
  console.error('WORKFLOW_RECEIPT_BLOCKED: one or more groups lack a canonical completed WorkflowActionEventV1');
  process.exitCode = 2;
} else if (!dryRun && events.length > 0) {
  for (const event of events) {
    await new Promise((resolvePromise, reject) => {
      const child = spawn(process.execPath, [receiptRecorderPath, '--repo-root', repoRoot, '--event-json', JSON.stringify(event), '--dry-run'], { stdio: ['ignore', 'pipe', 'inherit'] });
      let stdout = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.once('error', reject);
      child.once('exit', (code) => {
        if (code !== 0) return reject(new Error(`workflow receipt preflight exited ${code}`));
        try {
          const preflight = JSON.parse(stdout);
          if (!['DRY_RUN_WOULD_RECORD', 'NO_OP_ALREADY_RECORDED'].includes(preflight.status)) {
            return reject(new Error(`workflow receipt preflight rejected ${preflight.status}`));
          }
          resolvePromise();
        } catch (error) {
          reject(error);
        }
      });
    });
  }
  for (const event of events) {
    await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [receiptRecorderPath, '--repo-root', repoRoot, '--event-json', JSON.stringify(event), '--apply'], { stdio: ['ignore', 'pipe', 'inherit'] });
    child.stdout.on('data', () => {});
      child.once('error', reject);
      child.once('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`workflow receipt recorder exited ${code}`)));
    });
  }
  result.status = 'RECORDED';
  result.writesPerformed = true;
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify(result, null, 2));
