/**
 * PID-based filesystem lock used by run-graphify-daily-startup.mjs to reject
 * concurrent coordinator starts. Extracted from the wrapper script so the
 * acquire/release/liveness logic is independently testable without invoking
 * the real graphify:daily:chain (which performs real writes across the
 * production packet corpus).
 *
 * This is NOT the PostgreSQL advisory lock originally specced for Phase 3 of
 * the Graphify recovery proof ladder (openspec/changes/
 * parent-atlas-graphify-recovery-proof-ladder/tasks.md) — it is a real,
 * already-working, single-machine PID lock. The PG advisory lock (which would
 * also cover direct standalone invocation of graphify:daily:chain's substeps,
 * bypassing this wrapper) remains a separate, larger, not-yet-built piece.
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';

export function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function releaseStartupLock(lockFilePath) {
  try {
    if (existsSync(lockFilePath)) {
      unlinkSync(lockFilePath);
    }
  } catch {
    // best-effort cleanup only
  }
}

export function acquireStartupLock(lockFilePath, meta = {}) {
  if (existsSync(lockFilePath)) {
    try {
      const existing = JSON.parse(readFileSync(lockFilePath, 'utf8'));
      const existingPid = Number(existing?.pid);
      if (Number.isInteger(existingPid) && existingPid > 0 && isProcessAlive(existingPid)) {
        return false;
      }
    } catch {
      // stale or malformed lock, replace it below
    }
    releaseStartupLock(lockFilePath);
  }

  try {
    writeFileSync(
      lockFilePath,
      JSON.stringify(
        {
          pid: process.pid,
          startedAt: new Date().toISOString(),
          ...meta,
        },
        null,
        2
      ),
      'utf8'
    );
    return true;
  } catch (error) {
    console.error(`[graphify-startup-lock] Unable to create startup lock: ${error.message}`);
    return false;
  }
}
