#!/usr/bin/env node
/**
 * Pre-sweep gate: is the server on :5173 the one the manifest describes, and is it the app?
 *
 * Exit 0 only when ALL hold: manifest status is "running"; its PID is alive; that PID is the
 * current listener on the port; /api/health verifies as Parent Atlas. Otherwise exit 1 with a
 * reason code, so a sweep never analyses logs from the wrong process.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveListenerPid, probeParentAtlasServer } from './active-server-manifest.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, '../..');
const manifestPath = process.env.ACTIVE_SERVER_MANIFEST ?? path.join(FRONTEND_ROOT, 'logs', 'qa', 'active-server.json');

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

export async function verifyActiveServer(manifestFile = manifestPath) {
  if (!existsSync(manifestFile)) return { ok: false, code: 'MANIFEST_MISSING' };
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  } catch {
    return { ok: false, code: 'MANIFEST_UNREADABLE' };
  }
  if (manifest.status !== 'running') return { ok: false, code: 'MANIFEST_NOT_RUNNING', status: manifest.status };
  if (!Number.isInteger(manifest.pid) || !isAlive(manifest.pid)) return { ok: false, code: 'PID_NOT_ALIVE' };
  const listener = resolveListenerPid(manifest.port);
  if (listener !== manifest.pid) return { ok: false, code: 'PID_NOT_LISTENER', listener };
  const probe = await probeParentAtlasServer(manifest.port);
  if (!probe.ok) return { ok: false, code: 'NOT_PARENT_ATLAS', reason: probe.reason };
  return { ok: true, code: 'VERIFIED', pid: manifest.pid, port: manifest.port, started_at: manifest.started_at, revision: manifest.revision, stdout_log: manifest.stdout_log };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await verifyActiveServer();
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}
