/**
 * Active dev-server identity for QA sweeps.
 *
 * A bare "port is open" check cannot tell a Parent Atlas server from another process,
 * and a detached launch that finds an existing server must not overwrite the manifest
 * of the server that is actually running. This module:
 *   - resolves the PID that LISTENS on the port (not the launcher or npx wrapper),
 *   - reads that PID's start time,
 *   - verifies the app identity via /api/health (JSON with status + runtimeProfile),
 *   - writes logs/qa/active-server.json atomically (tmp file + rename).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Pure parser for `netstat -ano -p TCP` output. Returns the listener PID or null. */
export function parseNetstatListenerPid(text, port) {
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.trim().match(/^TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)$/);
    if (match && Number(match[2]) === port) return Number(match[3]);
  }
  return null;
}

export function resolveListenerPid(port) {
  try {
    if (process.platform === 'win32') {
      return parseNetstatListenerPid(execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' }), port);
    }
    const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' });
    const pid = Number(out.trim().split(/\s+/)[0]);
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

/** Process start time as ISO-8601 (UTC), or null when unavailable. */
export function processStartTime(pid) {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-Command', `(Get-Process -Id ${Number(pid)}).StartTime.ToUniversalTime().ToString('o')`],
        { encoding: 'utf8' },
      );
      return out.trim() || null;
    }
    return execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Confirms the server on `port` is the Parent Atlas app. Accepts only a 200 JSON
 * response from /api/health with a string `status` and an object `runtimeProfile`.
 */
export async function probeParentAtlasServer(port, { timeoutMs = 5000 } = {}) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (res.status !== 200) return { ok: false, reason: `HTTP_${res.status}` };
    const body = await res.json();
    if (typeof body?.status !== 'string' || typeof body?.runtimeProfile !== 'object' || body.runtimeProfile === null) {
      return { ok: false, reason: 'NOT_PARENT_ATLAS_HEALTH_SHAPE' };
    }
    return { ok: true, status: body.status };
  } catch (error) {
    return { ok: false, reason: error?.name === 'TimeoutError' ? 'TIMEOUT' : 'CONNECTION_FAILED' };
  }
}

export function currentRevision(repoRoot) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

/** Atomic write: a reader never sees a partially written manifest. */
export function writeManifestAtomic(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
}

/**
 * Polls until the port is served by a verified Parent Atlas app, then publishes the manifest.
 * Writes status "running" only after verification. On timeout writes status "not_verified" so a
 * consumer never treats an unconfirmed server as healthy. Never call this for a launch that
 * found an existing server: that launch did not start Vite and must not replace the manifest.
 */
export function publishActiveServerWhenReady({ port, logPath, repoRoot, manifestPath, service = 'dev-gpu', attempts = 120, intervalMs = 1000 }) {
  let tries = 0;
  const tick = async () => {
    tries += 1;
    const pid = resolveListenerPid(port);
    const probe = pid ? await probeParentAtlasServer(port) : { ok: false, reason: 'NO_LISTENER' };
    if (probe.ok) {
      writeManifestAtomic(manifestPath, {
        service,
        port,
        pid,
        status: 'running',
        verified: { endpoint: '/api/health', serverStatus: probe.status },
        started_at: processStartTime(pid),
        revision: currentRevision(repoRoot),
        stdout_log: logPath,
        stderr_log: logPath,
        published_at: new Date().toISOString(),
      });
      return;
    }
    if (tries >= attempts) {
      writeManifestAtomic(manifestPath, {
        service,
        port,
        pid: pid ?? null,
        status: 'not_verified',
        reason: probe.reason,
        stdout_log: logPath,
        stderr_log: logPath,
        published_at: new Date().toISOString(),
      });
      return;
    }
    setTimeout(tick, intervalMs);
  };
  setTimeout(tick, intervalMs);
}
