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

const event = JSON.parse(eventFile ? await readFile(resolve(repoRoot, eventFile), 'utf8') : eventJson);
const required = ['schema', 'workflowId', 'actionId', 'sequence', 'kind', 'openspecChange'];
for (const field of required) {
  if (event[field] === undefined || event[field] === null || event[field] === '') {
    throw new Error(`RUN_RECEIPT_INVALID: missing ${field}`);
  }
}
if (event.schema !== 'atlas.workflow-action.v1') throw new Error('RUN_RECEIPT_INVALID: schema');
if (event.kind !== 'completed') throw new Error('RUN_RECEIPT_INVALID: kind must be completed');
if (!Number.isInteger(event.sequence) || event.sequence < 1) throw new Error('RUN_RECEIPT_INVALID: sequence');
if (!/^[-a-zA-Z0-9_]+$/.test(event.openspecChange)) {
  throw new Error('RUN_RECEIPT_INVALID: openspecChange must be a safe change name');
}

const changesRoot = resolve(repoRoot, 'openspec/changes');
const changeRoot = resolve(changesRoot, event.openspecChange);
const relativeChange = relative(changesRoot, changeRoot);
if (relativeChange.startsWith('..') || relativeChange.includes(':')) {
  throw new Error('RUN_RECEIPT_INVALID: change path escapes openspec/changes');
}

const tasksPath = resolve(changeRoot, 'tasks.md');
const receiptsPath = resolve(changeRoot, 'receipts.jsonl');
if (!existsSync(tasksPath)) throw new Error(`RUN_RECEIPT_INVALID: missing ${tasksPath}`);

const identity = `${event.workflowId}\u0000${event.actionId}\u0000${event.sequence}`;
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
  `${candidate.workflowId}\u0000${candidate.actionId}\u0000${candidate.sequence}` === identity
);

if (duplicate) {
  const same = JSON.stringify(duplicate.event) === JSON.stringify(event);
  if (!same) throw new Error('RUN_RECEIPT_CONFLICT: identity already exists with different payload');
  console.log(JSON.stringify({
    schema: 'atlas.agentic-run-receipt-record.v1',
    status: 'NO_OP_ALREADY_RECORDED',
    dryRun,
    identity: { workflowId: event.workflowId, actionId: event.actionId, sequence: event.sequence },
    writesPerformed: false,
  }, null, 2));
  process.exit(0);
}

const tasksText = await readFile(tasksPath, 'utf8');
const bullet = `- ${event.workflowId}/${event.actionId}#${event.sequence}: ${event.operation ?? 'completed'} (state=${event.state ?? 'succeeded'})`;
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
  identity: { workflowId: event.workflowId, actionId: event.actionId, sequence: event.sequence },
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
