import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolve where an extractor reads source bytes from. Default is the working tree. When
 * ATLAS_GRAPHIFY_SOURCE_SNAPSHOT_ROOT is set it must be the materialized admitted snapshot:
 * a single 64-hex directory directly under .tmp/workspace-source-snapshots, whose name equals the
 * admitted snapshotRevision, with the admission bound to the requested workspaceRevision.
 * Fails closed on any mismatch; it never falls back to the working tree once the variable is set.
 */
export function resolveSourceReadRootV1({ repoRoot, env, workspaceRevision, admission }) {
  const raw = String(env?.ATLAS_GRAPHIFY_SOURCE_SNAPSHOT_ROOT ?? '').trim();
  if (!raw) return { root: repoRoot, mode: 'WORKING_TREE', snapshotRevision: null };
  const base = path.resolve(repoRoot, '.tmp', 'workspace-source-snapshots');
  const root = path.resolve(raw);
  const relative = path.relative(base, root);
  if (!/^[0-9a-f]{64}$/.test(relative)) throw new Error('SOURCE_SNAPSHOT_ROOT_NOT_A_MATERIALIZED_SNAPSHOT');
  if (!admission || admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true) {
    throw new Error('SOURCE_SNAPSHOT_ROOT_ADMISSION_INVALID');
  }
  if (admission.snapshotRevision !== `sha256:${relative}`) throw new Error('SOURCE_SNAPSHOT_ROOT_REVISION_MISMATCH');
  if (!workspaceRevision || admission.workspaceRevision !== workspaceRevision) {
    throw new Error('SOURCE_SNAPSHOT_ROOT_WORKSPACE_REVISION_MISMATCH');
  }
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error('SOURCE_SNAPSHOT_ROOT_MISSING');
  return { root, mode: 'MATERIALIZED_ADMITTED_SNAPSHOT', snapshotRevision: admission.snapshotRevision };
}
