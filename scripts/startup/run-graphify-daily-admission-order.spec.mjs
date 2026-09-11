import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, 'run-graphify-daily-startup.mjs'), 'utf8');

test('ordinary daily apply chain remains downstream of canonical admission and lifecycle open', () => {
  const admission = source.indexOf('PROMOTION_ADMISSION_SCRIPT');
  const admissionCall = source.indexOf("execSync(PROMOTION_ADMISSION_SCRIPT");
  const lifecycleOpen = source.indexOf("graphify-daily-lifecycle-open-v1.mjs");
  const chain = source.indexOf('execSync(dailyChainScript');
  assert.ok(admission >= 0 && admissionCall > admission);
  assert.ok(lifecycleOpen > admissionCall);
  assert.ok(chain > lifecycleOpen);
  assert.match(source, /ATLAS_GRAPHIFY_TERMINAL_AUTHORIZATION === TERMINAL_RUN_AUTHORIZATION/);
  assert.match(source, /DAILY_CHAIN_TERMINAL_SCRIPT = 'npm run graphify:daily:dry'/);
  assert.match(source, /snapshotTerminalRunAuthorized\s*\?\s*DAILY_CHAIN_TERMINAL_SCRIPT/);
});

test('lifecycle failures are not converted into degraded-success continuation', () => {
  assert.doesNotMatch(source, /Lifecycle open\/bind degraded; continuing daily chain/);
  assert.doesNotMatch(source, /Lifecycle completion degraded; daily chain already succeeded/);
});

test('daily gate uses verdict-enforcing wrapper, not the zero-exit audit directly', () => {
  assert.match(source, /require-canonical-projection-admission-v1\.mjs/);
  assert.doesNotMatch(source, /PROMOTION_ADMISSION_SCRIPT\s*=\s*['"]node scripts\/atlas\/audit-canonical-projection-fabric\.mjs/);
});

test('terminal authorization cannot enter the fallback mutation path', () => {
  assert.match(source, /!allowFallback\s*\|\|\s*process\.env\.ATLAS_GRAPHIFY_TERMINAL_AUTHORIZATION === TERMINAL_RUN_AUTHORIZATION/);
});
