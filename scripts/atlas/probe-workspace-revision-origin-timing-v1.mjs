#!/usr/bin/env node
/** Throwaway read-only timing probe: does materializeWorkspaceRevisionOriginV1 already cover
 * the full current workspace in one call, and how long does that actually take? No writes. */
import { materializeWorkspaceRevisionOriginV1 } from '../../sveltekit-frontend/src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const t0 = performance.now();
const result = materializeWorkspaceRevisionOriginV1({
  workspaceRoot: REPO_ROOT,
  repositoryId: path.basename(REPO_ROOT),
  producerRevision: 'atlas.probe-workspace-revision-origin-timing.v1',
});
const t1 = performance.now();
console.log(JSON.stringify({
  wallMs: Math.round(t1 - t0),
  bindingsCount: result.bindings.length,
  skippedCount: result.skipped.length,
  workspaceRevision: result.record.workspaceRevision,
  dirty: result.record.dirty,
  baseCommitOid: result.record.baseCommitOid,
}, null, 2));
