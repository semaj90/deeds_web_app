#!/usr/bin/env node

import { access, readFile, rename, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const RECEIPT_HEADING = '## Run Receipts';
const OPEN_SPEC_SLUG = /^[a-z0-9][a-z0-9-]*$/;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.length || value.trim() !== value) {
    throw new Error(`${field} must be a non-empty trimmed string`);
  }
  return value;
}

export function workflowReceiptIdentity(event) {
  return `${requiredString(event.workflowId, 'workflowId')}:${requiredString(event.actionId, 'actionId')}:${event.sequence}`;
}

/**
 * Recorder-specific admission checks. The WorkflowActionEventV1 owner remains
 * `sveltekit-frontend/src/lib/server/atlas/workflow/workflow-action-event-v1.ts`;
 * this function only verifies the subset required to safely bind a completed
 * event to an OpenSpec ledger.
 */
export function validateRecordableWorkflowAction(event) {
  if (!isRecord(event)) throw new Error('event must be a JSON object');
  if (event.schema !== 'atlas.workflow-action.v1') throw new Error('schema must be atlas.workflow-action.v1');
  requiredString(event.workflowId, 'workflowId');
  requiredString(event.actionId, 'actionId');
  requiredString(event.dagNodeId, 'dagNodeId');
  requiredString(event.operation, 'operation');
  const change = requiredString(event.openspecChange, 'openspecChange');
  if (!OPEN_SPEC_SLUG.test(change)) throw new Error('openspecChange must be a safe OpenSpec slug');
  if (!Number.isInteger(event.workflowRevision) || event.workflowRevision < 1) throw new Error('workflowRevision must be a positive integer');
  if (!Number.isInteger(event.sequence) || event.sequence < 1) throw new Error('sequence must be a positive integer');
  if (event.kind !== 'completed') throw new Error('only kind=completed events may be recorded');
  if (event.state !== 'succeeded') throw new Error('only state=succeeded events may be recorded');
  if (!['acp', 'a2a'].includes(event.lane)) throw new Error('agentic run receipts require lane=acp or lane=a2a');
  if (event.tokensUsed !== undefined && (!Number.isInteger(event.tokensUsed) || event.tokensUsed < 0)) {
    throw new Error('tokensUsed must be a non-negative integer');
  }
  if (event.filesEdited !== undefined) {
    if (!Array.isArray(event.filesEdited)) throw new Error('filesEdited must be an array');
    for (const file of event.filesEdited) requiredString(file, 'filesEdited[]');
  }
  return event;
}

function parseJsonl(text, path) {
  const rows = [];
  for (const [index, raw] of text.split(/\r?\n/u).entries()) {
    if (!raw.trim()) continue;
    try {
      rows.push(JSON.parse(raw));
    } catch (error) {
      throw new Error(`${path}:${index + 1}: invalid JSONL (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  return rows;
}

function durationMs(event) {
  if (!event.startedAt || !event.finishedAt) return null;
  const start = Date.parse(event.startedAt);
  const finish = Date.parse(event.finishedAt);
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish < start) return null;
  return finish - start;
}

function receiptBullet(event) {
  const identity = workflowReceiptIdentity(event);
  const details = [
    `lane ${event.lane}`,
    event.tokensUsed === undefined ? null : `${event.tokensUsed.toLocaleString('en-US')} tokens`,
    Array.isArray(event.filesEdited) ? `${new Set(event.filesEdited).size} files edited` : null,
    durationMs(event) === null ? null : `${durationMs(event)} ms`
  ].filter(Boolean).join(' · ');
  return `- <!-- atlas-workflow-receipt:${identity} --> \`${identity}\` — ${event.operation}${details ? ` · ${details}` : ''}`;
}

export function updateTasksWithReceipt(tasksText, event) {
  const marker = `<!-- atlas-workflow-receipt:${workflowReceiptIdentity(event)} -->`;
  if (tasksText.includes(marker)) return { text: tasksText, changed: false };
  const bullet = receiptBullet(event);
  const normalized = tasksText.endsWith('\n') ? tasksText : `${tasksText}\n`;
  const headingIndex = normalized.indexOf(RECEIPT_HEADING);
  if (headingIndex === -1) {
    return { text: `${normalized}\n${RECEIPT_HEADING}\n\n${bullet}\n`, changed: true };
  }
  const afterHeading = headingIndex + RECEIPT_HEADING.length;
  const nextSection = normalized.indexOf('\n## ', afterHeading);
  const insertAt = nextSection === -1 ? normalized.length : nextSection;
  const prefix = normalized.slice(0, insertAt).replace(/\s*$/u, '');
  const suffix = normalized.slice(insertAt);
  return { text: `${prefix}\n${bullet}\n${suffix}`, changed: true };
}

export function updateJsonlWithReceipt(jsonlText, event, ledgerPath = 'receipts.jsonl') {
  const identity = workflowReceiptIdentity(event);
  const rows = parseJsonl(jsonlText, ledgerPath);
  if (rows.some((row) => isRecord(row) && workflowReceiptIdentity(row) === identity)) {
    return { text: jsonlText, changed: false };
  }
  const normalized = jsonlText && !jsonlText.endsWith('\n') ? `${jsonlText}\n` : jsonlText;
  return { text: `${normalized}${JSON.stringify(event)}\n`, changed: true };
}

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return '';
    throw error;
  }
}

function within(root, target) {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith('/') && !rel.startsWith('\\'));
}

async function atomicWrite(path, content) {
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temp, content, 'utf8');
  await rename(temp, path);
}

export async function recordAgenticRunReceipt({ repoRoot, event, dryRun = false }) {
  validateRecordableWorkflowAction(event);
  const changesRoot = resolve(repoRoot, 'openspec', 'changes');
  const changeRoot = resolve(changesRoot, event.openspecChange);
  if (!within(changesRoot, changeRoot)) throw new Error('resolved OpenSpec path escapes openspec/changes');

  const tasksPath = resolve(changeRoot, 'tasks.md');
  await access(tasksPath, fsConstants.R_OK);
  const ledgerPath = resolve(changeRoot, 'receipts.jsonl');
  const [tasksText, jsonlText] = await Promise.all([readFile(tasksPath, 'utf8'), readOptional(ledgerPath)]);
  const tasksUpdate = updateTasksWithReceipt(tasksText, event);
  const ledgerUpdate = updateJsonlWithReceipt(jsonlText, event, ledgerPath);
  const changed = tasksUpdate.changed || ledgerUpdate.changed;

  const result = {
    schema: 'atlas.agentic-run-record-result.v1',
    identity: workflowReceiptIdentity(event),
    openspecChange: event.openspecChange,
    dryRun,
    changed,
    tasksChanged: tasksUpdate.changed,
    ledgerChanged: ledgerUpdate.changed,
    tasksPath: relative(repoRoot, tasksPath).replaceAll('\\', '/'),
    ledgerPath: relative(repoRoot, ledgerPath).replaceAll('\\', '/')
  };

  if (dryRun || !changed) {
    return { ...result, tasksPreview: tasksUpdate.changed ? tasksUpdate.text : undefined, ledgerPreview: ledgerUpdate.changed ? ledgerUpdate.text : undefined };
  }

  if (ledgerUpdate.changed) await atomicWrite(ledgerPath, ledgerUpdate.text);
  if (tasksUpdate.changed) await atomicWrite(tasksPath, tasksUpdate.text);
  return result;
}

function parseArgs(argv) {
  const args = { eventPath: null, repoRoot: process.cwd(), dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--event') args.eventPath = argv[++i] ?? null;
    else if (arg === '--repo-root') args.repoRoot = argv[++i] ?? args.repoRoot;
    else if (!arg.startsWith('-') && !args.eventPath) args.eventPath = arg;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!args.eventPath) throw new Error('usage: record-agentic-run-receipt.mjs --event <workflow-action.json> [--repo-root <path>] [--dry-run]');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const eventPath = resolve(args.repoRoot, args.eventPath);
  const event = JSON.parse(await readFile(eventPath, 'utf8'));
  const result = await recordAgenticRunReceipt({ repoRoot: resolve(args.repoRoot), event, dryRun: args.dryRun });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const direct = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (direct) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
