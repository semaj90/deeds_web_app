import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (flag) => {
  const index = argv.indexOf(flag);
  return index === -1 ? null : argv[index + 1] ?? null;
};

const repoRoot = resolve(valueOf('--repo-root') ?? process.cwd());
const eventFile = valueOf('--event-file');
const eventJson = valueOf('--event-json');
const dryRun = has('--dry-run') || !has('--apply');

if ((!eventFile && !eventJson) || (eventFile && eventJson)) {
  throw new Error('Provide exactly one of --event-file <path> or --event-json <json>');
}

const eventInput = JSON.parse(eventFile ? await readFile(resolve(repoRoot, eventFile), 'utf8') : eventJson);
const { tsImport } = await import('tsx/esm/api');
const { workflowActionEventSchema } = await tsImport(
  '../../packages/parent-atlas/src/core/workflow-action-event.ts',
  import.meta.url,
);
const parsedEvent = workflowActionEventSchema.safeParse(eventInput);
if (!parsedEvent.success) {
  const issues = parsedEvent.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`);
  throw new Error(`RUN_RECEIPT_INVALID: canonical WorkflowActionEventV1: ${issues.join('; ')}`);
}
const event = parsedEvent.data;
const openspecChange = event.metadata.openspecChange;
if (event.kind !== 'completed') throw new Error('RUN_RECEIPT_INVALID: kind must be completed');
if (typeof openspecChange !== 'string' || !/^[-a-zA-Z0-9_]+$/.test(openspecChange)) {
  throw new Error('RUN_RECEIPT_INVALID: openspecChange must be a safe change name');
}

const changesRoot = resolve(repoRoot, 'openspec/changes');
const changeRoot = resolve(changesRoot, openspecChange);
const relativeChange = relative(changesRoot, changeRoot);
if (relativeChange.startsWith('..') || relativeChange.includes(':')) {
  throw new Error('RUN_RECEIPT_INVALID: change path escapes openspec/changes');
}

const tasksPath = resolve(changeRoot, 'tasks.md');
const receiptsPath = resolve(changeRoot, 'receipts.jsonl');
if (!existsSync(tasksPath)) throw new Error(`RUN_RECEIPT_INVALID: missing ${tasksPath}`);

const identity = `${event.workflowId}\u0000${event.workflowRevision}\u0000${event.actionId}\u0000${event.sequence}`;
const existingText = existsSync(receiptsPath) ? await readFile(receiptsPath, 'utf8') : '';
const existingEvents = existingText
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line, index) => {
    try {
      return { event: JSON.parse(line), index };
    } catch {
      throw new Error(`RUN_RECEIPT_INVALID: malformed receipts.jsonl line ${index + 1}`);
    }
  });
const duplicate = existingEvents.find(({ event: candidate }) =>
  `${candidate.workflowId}\u0000${candidate.workflowRevision}\u0000${candidate.actionId}\u0000${candidate.sequence}` === identity
);

if (duplicate) {
  const same = JSON.stringify(duplicate.event) === JSON.stringify(event);
  if (!same) throw new Error('RUN_RECEIPT_CONFLICT: identity already exists with different payload');
  console.log(JSON.stringify({
    schema: 'atlas.agentic-run-receipt-record.v1',
    status: 'NO_OP_ALREADY_RECORDED',
    dryRun,
    identity: { workflowId: event.workflowId, workflowRevision: event.workflowRevision, actionId: event.actionId, sequence: event.sequence },
    writesPerformed: false,
  }, null, 2));
  process.exit(0);
}

const tasksText = await readFile(tasksPath, 'utf8');
const operation = typeof event.metadata.operation === 'string' ? event.metadata.operation : 'completed';
const state = typeof event.metadata.state === 'string' ? event.metadata.state : 'succeeded';
const bullet = `- ${event.workflowId}@r${event.workflowRevision}/${event.actionId}#${event.sequence}: ${operation} (state=${state})`;
let nextTasksText = tasksText;
const heading = /^## Run Receipts\s*$/m;
if (heading.test(tasksText)) {
  const match = heading.exec(tasksText);
  const afterHeading = (match?.index ?? 0) + (match?.[0].length ?? 0);
  const nextHeading = /^##\s+/m.exec(tasksText.slice(afterHeading));
  const insertAt = nextHeading ? afterHeading + nextHeading.index : tasksText.length;
  const prefix = tasksText.slice(0, insertAt).replace(/\s*$/, '\n');
  const suffix = tasksText.slice(insertAt).replace(/^\s*/, '\n');
  nextTasksText = `${prefix}${bullet}${suffix}`;
} else {
  nextTasksText = `${tasksText.replace(/\s*$/, '\n\n')}## Run Receipts\n${bullet}\n`;
}

const nextReceiptsText = `${existingText}${existingText && !existingText.endsWith('\n') ? '\n' : ''}${JSON.stringify(event)}\n`;
const result = {
  schema: 'atlas.agentic-run-receipt-record.v1',
  status: dryRun ? 'DRY_RUN_WOULD_RECORD' : 'RECORDED',
  dryRun,
  identity: { workflowId: event.workflowId, workflowRevision: event.workflowRevision, actionId: event.actionId, sequence: event.sequence },
  targets: {
    tasksPath,
    receiptsPath,
    tasksChanged: nextTasksText !== tasksText,
    receiptsChanged: nextReceiptsText !== existingText,
  },
  writesPerformed: !dryRun,
};

if (!dryRun) {
  await mkdir(dirname(receiptsPath), { recursive: true });
  await writeFile(tasksPath, nextTasksText, 'utf8');
  await writeFile(receiptsPath, nextReceiptsText, 'utf8');
}
console.log(JSON.stringify(result, null, 2));
