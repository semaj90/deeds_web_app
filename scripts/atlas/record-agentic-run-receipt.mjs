#!/usr/bin/env node
/**
 * Record one canonical WorkflowActionEventV1 against an OpenSpec change.
 * Default is dry-run; --apply is required before touching openspec/.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const value = process.argv[i];
  if (value === '--apply' || value === '--dry-run') args.set(value, true);
  else if (value.startsWith('--')) args.set(value, process.argv[++i]);
}

const change = String(args.get('--openspec-change') ?? '').trim();
const inputPath = String(args.get('--input') ?? '').trim();
const apply = args.has('--apply');
if (!change || !inputPath) {
  console.error('Usage: node scripts/atlas/record-agentic-run-receipt.mjs --openspec-change <change> --input <event.json> [--apply]');
  process.exit(1);
}

const event = JSON.parse(readFileSync(inputPath, 'utf8'));
const errors = [];
if (event.schema !== 'atlas.workflow-action.v1') errors.push('SCHEMA_MISMATCH');
if (event.kind !== 'completed') errors.push('EVENT_NOT_COMPLETED');
if (!event.workflowId || !event.actionId || !Number.isInteger(event.sequence)) errors.push('EVENT_IDENTITY_MISSING');
if (!event.openspecChange) errors.push('OPENSPEC_BINDING_MISSING');
if (event.openspecChange && event.openspecChange !== change) errors.push('OPENSPEC_BINDING_MISMATCH');
if (event.progress?.etaMs !== undefined && (!Number.isFinite(event.progress.etaMs) || event.progress.etaMs < 0)) errors.push('INVALID_ETA');
if (errors.length) {
  console.error(`RECEIPT_REJECTED ${errors.join(',')}`);
  process.exit(2);
}

const changeDir = join(process.cwd(), 'openspec', 'changes', change);
const tasksPath = join(changeDir, 'tasks.md');
const receiptsPath = join(changeDir, 'receipts.jsonl');
if (!existsSync(tasksPath)) {
  console.error(`OPENSPEC_TASKS_MISSING ${tasksPath}`);
  process.exit(2);
}

const eventKey = `${event.workflowId}:${event.actionId}:${event.sequence}`;
const existing = existsSync(receiptsPath)
  ? readFileSync(receiptsPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
  : [];
if (existing.some((item) => item && `${item.workflowId}:${item.actionId}:${item.sequence}` === eventKey)) {
  console.log(`RECEIPT_NOOP ${eventKey}`);
  process.exit(0);
}

const receiptLine = JSON.stringify(event);
const progress = event.progress?.fraction ?? (
  event.progress?.completedUnits != null && event.progress?.totalUnits > 0
    ? event.progress.completedUnits / event.progress.totalUnits
    : event.state === 'succeeded' ? 1 : null
);
const eta = event.progress?.etaMs == null ? 'unavailable' : `${event.progress.etaMs}ms`;
const bullet = `- ${event.emittedAt ?? new Date().toISOString()} — workflow \`${event.workflowId}\`, action \`${event.actionId}\`, sequence ${event.sequence}; progress=${progress == null ? 'unavailable' : `${Math.round(progress * 100)}%`}; ETA=${eta}; event=${eventKey}`;
const tasksText = readFileSync(tasksPath, 'utf8');
const section = tasksText.includes('## Run Receipts')
  ? `${tasksText.trimEnd()}\n${bullet}\n`
  : `${tasksText.trimEnd()}\n\n## Run Receipts\n\n${bullet}\n`;

console.log(`RECEIPT_READY ${eventKey} apply=${apply}`);
if (!apply || args.has('--dry-run')) {
  console.log(`would append ${receiptsPath}`);
  console.log(`would update ${tasksPath}`);
  process.exit(0);
}
writeFileSync(receiptsPath, `${existsSync(receiptsPath) ? readFileSync(receiptsPath, 'utf8').trimEnd() + '\n' : ''}${receiptLine}\n`, 'utf8');
writeFileSync(tasksPath, section, 'utf8');
console.log(`RECEIPT_RECORDED ${eventKey}`);
