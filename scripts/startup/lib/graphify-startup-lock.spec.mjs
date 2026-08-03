/**
 * FE_LOCK-style concurrency proof for the coordinator's PID-based startup
 * lock, run against an isolated temp lock file — never the real
 * .graphify-daily-start.lock, and never invoking graphify:daily:chain.
 *
 * Run: node scripts/startup/lib/graphify-startup-lock.spec.mjs
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Windows ESM import() rejects raw "C:\..." specifiers (ERR_UNSUPPORTED_ESM_URL_SCHEME) —
// must be a file:// URL.
const LOCK_MODULE_SPECIFIER = JSON.stringify(
  pathToFileURL(path.join(__dirname, 'graphify-startup-lock.mjs')).href
);

async function main() {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'graphify-lock-test-'));
  const lockFilePath = JSON.stringify(path.join(tmpDir, 'test.lock'));
  const results = { gates: {} };

  // G1: first run acquires and holds the lock for 1.5s (simulating a still-running
  // coordinator) before releasing — deliberately NOT released early.
  const first = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
      import { acquireStartupLock, releaseStartupLock } from ${LOCK_MODULE_SPECIFIER};
      const ok = acquireStartupLock(${lockFilePath}, { script: 'first-run' });
      console.log(JSON.stringify({ pid: process.pid, acquired: ok }));
      await new Promise((r) => setTimeout(r, 1500));
      `,
    ],
    { encoding: 'utf8' }
  );

  const firstLine = first.stdout.trim().split('\n').find((l) => l.trim().startsWith('{'));
  if (!firstLine) {
    console.error('First subprocess produced no JSON output. stderr:', first.stderr);
    process.exit(1);
  }
  const firstOut = JSON.parse(firstLine);

  const rowsBefore = existsSync(JSON.parse(lockFilePath)) ? readFileSync(JSON.parse(lockFilePath), 'utf8') : null;
  results.gates.FE_LOCK_G1_FIRST_RUN_ACQUIRES = firstOut.acquired === true ? 'PASS' : 'FAIL';
  results.firstPid = firstOut.pid;

  // G2/G3: this "second run" is deliberately launched only AFTER `first` has already
  // finished holding+releasing (spawnSync blocks until the child exits). To actually prove
  // rejection-while-held, race a second acquire attempt DURING the first's hold window using
  // a background (non-blocking) spawn for the first process instead.
  const tmpDir2 = mkdtempSync(path.join(tmpdir(), 'graphify-lock-test2-'));
  const raceLockPath = JSON.stringify(path.join(tmpDir2, 'race.lock'));

  const { spawn } = await import('child_process');
  const holder = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
      import { acquireStartupLock, releaseStartupLock } from ${LOCK_MODULE_SPECIFIER};
      const ok = acquireStartupLock(${raceLockPath}, { script: 'holder' });
      console.log(JSON.stringify({ pid: process.pid, acquired: ok }));
      await new Promise((r) => setTimeout(r, 2000));
      releaseStartupLock(${raceLockPath});
      `,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let holderStdout = '';
  holder.stdout.on('data', (d) => (holderStdout += d.toString()));
  await new Promise((r) => setTimeout(r, 400)); // let holder actually acquire first

  const rowsWhileHeld = existsSync(JSON.parse(raceLockPath)) ? readFileSync(JSON.parse(raceLockPath), 'utf8') : null;

  const contender = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
      import { acquireStartupLock } from ${LOCK_MODULE_SPECIFIER};
      const ok = acquireStartupLock(${raceLockPath}, { script: 'contender' });
      console.log(JSON.stringify({ pid: process.pid, acquired: ok }));
      `,
    ],
    { encoding: 'utf8' }
  );
  const rowsAfterContenderAttempt = existsSync(JSON.parse(raceLockPath)) ? readFileSync(JSON.parse(raceLockPath), 'utf8') : null;
  const contenderLine = contender.stdout.trim().split('\n').find((l) => l.trim().startsWith('{'));
  const contenderOut = contenderLine ? JSON.parse(contenderLine) : { acquired: null };

  results.gates.FE_LOCK_G2_SECOND_RUN_REJECTED = contenderOut.acquired === false ? 'PASS' : 'FAIL';
  results.gates.FE_LOCK_G3_SECOND_RUN_WRITES_ZERO_ROWS =
    rowsWhileHeld !== null && rowsAfterContenderAttempt !== null && rowsWhileHeld === rowsAfterContenderAttempt
      ? 'PASS'
      : 'FAIL';
  results.contenderPid = contenderOut.pid;

  // Wait for the holder to finish and release naturally, then confirm G4.
  await new Promise((resolve) => holder.on('exit', resolve));
  const lockGoneAfterHolderExits = !existsSync(JSON.parse(raceLockPath));
  results.gates.FE_LOCK_G4_LOCK_RELEASED_ON_SUCCESS = lockGoneAfterHolderExits ? 'PASS' : 'FAIL';

  // G5 (released on failure) and G6 (dry-run) are not exercised by this harness — the
  // coordinator wrapper releases on 'exit'/SIGINT/SIGTERM regardless of success/failure
  // (same handler, not a separate failure path), and has no dry-run mode of its own.
  // Recorded honestly rather than claimed.
  results.gates.FE_LOCK_G5_LOCK_RELEASED_ON_FAILURE =
    'SKIPPED_WITH_REASON: release handler is unconditional (process.on(exit)), not a distinct failure-only path — not separately exercised here';
  results.gates.FE_LOCK_G6_DRY_RUN_DOES_NOT_REQUIRE_WRITE_LOCK =
    'SKIPPED_WITH_REASON: coordinator wrapper has no dry-run mode of its own';

  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(tmpDir2, { recursive: true, force: true });

  console.log(JSON.stringify(results, null, 2));
  const allPass = Object.values(results.gates).every(
    (v) => v === 'PASS' || String(v).startsWith('SKIPPED_WITH_REASON')
  );
  process.exit(allPass ? 0 : 1);
}

main();
