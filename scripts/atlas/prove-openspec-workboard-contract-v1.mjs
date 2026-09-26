#!/usr/bin/env node
/**
 * OCP-01 proof: loads the live canonical workboard artifact through the new typed contract
 * (sveltekit-frontend/src/lib/server/atlas/openspec-board/workboard-contract-v1.ts) and writes a receipt.
 * READ ONLY -- reads docs/reports/openspec-workboard-v1.json, writes only this receipt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA = 'atlas.openspec-workboard-contract-receipt.v1';
const artifactPath = path.join(root, 'docs/reports/openspec-workboard-v1.json');

const frontendRequire = createRequire(path.join(root, 'sveltekit-frontend', 'package.json'));
const { register } = await import(pathToFileURL(frontendRequire.resolve('tsx/esm/api')).href);
register();
const contract = await import(pathToFileURL(path.join(root, 'sveltekit-frontend/src/lib/server/atlas/openspec-board/workboard-contract-v1.ts')).href);

let result;
try {
  const { workboard, revision } = await contract.loadOpenSpecWorkboardV1(artifactPath);
  const tasks = workboard.taskInventory;
  const parity = {
    total: tasks.length === workboard.summary.totalTasks,
    complete: tasks.filter((t) => t.executionState === 'DONE').length === workboard.summary.completedTasks,
    open: tasks.filter((t) => t.state === 'OPEN').length === workboard.summary.openTasks,
    actionable: tasks.filter((t) => t.executionState === 'ACTIONABLE').length === workboard.summary.actionableTasks,
    waiting: tasks.filter((t) => t.executionState === 'WAITING_ON_DEPENDENCY').length === workboard.summary.waitingTasks,
    superseded: tasks.filter((t) => t.executionState === 'SUPERSEDED_OR_HISTORICAL').length === workboard.summary.supersededTasks,
  };
  const stableKeys = tasks.map((t) => t.stableKey);
  const noDuplicateStableKey = new Set(stableKeys).size === stableKeys.length;
  const nonNullLogical = tasks.map((t) => t.logicalTaskKey).filter((k) => k !== null);
  const noDuplicateLogicalTaskKey = new Set(nonNullLogical).size === nonNullLogical.length;
  const flatSchema = Array.isArray(workboard.taskInventory);

  const proven = Object.values(parity).every(Boolean) && noDuplicateStableKey && noDuplicateLogicalTaskKey && flatSchema;
  result = {
    schema: SCHEMA, generatedAt: new Date().toISOString(),
    artifactPath: path.relative(root, artifactPath), workboardChecksum: revision.workboardChecksum, workboardGeneratedAt: revision.generatedAt,
    summary: workboard.summary,
    parity, noDuplicateStableKey, noDuplicateLogicalTaskKey, logicalTaskKeyNullCount: tasks.length - nonNullLogical.length, flatSchema,
    result: proven ? 'OPENSPEC_WORKBOARD_CONTRACT_PROVEN' : 'OPENSPEC_WORKBOARD_CONTRACT_BLOCKED',
  };
} catch (error) {
  result = { schema: SCHEMA, generatedAt: new Date().toISOString(), result: 'OPENSPEC_WORKBOARD_CONTRACT_BLOCKED', error: String(error instanceof Error ? error.message : error) };
}

const body = JSON.stringify(result, null, 2);
const pointer = path.join(root, 'docs/reports/openspec-workboard-contract-v1.json');
fs.writeFileSync(pointer, body + '\n');
console.log(result.result, JSON.stringify(result.parity ?? {}), 'noDupStableKey=' + result.noDuplicateStableKey, 'noDupLogicalTaskKey=' + result.noDuplicateLogicalTaskKey);
if (result.result !== 'OPENSPEC_WORKBOARD_CONTRACT_PROVEN') process.exit(1);
