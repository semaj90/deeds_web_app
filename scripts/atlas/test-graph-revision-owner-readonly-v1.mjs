#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const audit = fs.readFileSync(path.join(ROOT, 'scripts/atlas/audit-graph-revision-owner-v1.mjs'), 'utf8');

test('graph revision audit executes all database reads in a rolled-back read-only transaction', () => {
  assert.match(audit, /BEGIN TRANSACTION READ ONLY/);
  assert.match(audit, /readOnlyClient\.query\('ROLLBACK'\)/);
  assert.match(audit, /if\s*\(readOnlyTransactionOpen\)\s*await readOnlyClient\.query\('ROLLBACK'\)/);
  assert.doesNotMatch(audit, /pool\.query\(/);
});
