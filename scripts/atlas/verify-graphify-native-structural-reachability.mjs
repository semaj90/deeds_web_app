#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const DEFAULT_RECEIPT = path.resolve(ROOT, 'docs/reports/graphify-native-structural-reachability.json');
const receiptArg = process.argv.find((arg) => arg.startsWith('--receipt='));
const receiptPath = receiptArg
  ? path.resolve(process.cwd(), receiptArg.slice('--receipt='.length))
  : DEFAULT_RECEIPT;

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : stable(value), 'utf8').digest('hex');
}

const raw = await readFile(receiptPath, 'utf8');
const receipt = JSON.parse(raw);
const { outputChecksum, ...payload } = receipt;
const checksumValid = typeof outputChecksum === 'string' && sha256(payload) === outputChecksum;

const gates = {
  schemaValid: receipt.schema === 'atlas.graphify-native-structural-reachability.v1',
  checksumValid,
  nativeStructuralEnabled: receipt.nativeStructuralEnabled === true,
  dryRunOnly: receipt.applyRequested === false,
  symbolCreationNotRequested: receipt.allowCreateSymbolsRequested === false,
  childInvoked: receipt.invoked === true,
  childCompleted: receipt.completed === true,
  childExitZero: receipt.childExitCode === 0,
  liveReachableDryRun: receipt.status === 'LIVE_REACHABLE_DRY_RUN',
  canonicalWritesNotProven: receipt.canonicalWritesProven === false,
};

const pass = Object.values(gates).every(Boolean);
const report = {
  schema: 'atlas.graphify-native-structural-reachability-verification.v1',
  receiptPath,
  status: pass ? 'GPH17_LIVE_REACHABILITY_PROVEN' : 'GPH17_LIVE_REACHABILITY_NOT_PROVEN',
  gates,
  sourceReceiptChecksum: outputChecksum ?? null,
};

console.log(JSON.stringify(report, null, 2));
if (!pass) process.exitCode = 1;
