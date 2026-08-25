/**
 * Resolves a temporalRevisionCoordinateSchema-shaped `workspace_revision`
 * (see packages/parent-atlas/src/core/temporal-action-ledger.ts) from the
 * existing workspace-source-binding observation artifact, WITHOUT
 * recomputing it.
 *
 * Design decision recorded in
 * openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md
 * (`## TABLE-AUDIT-02`, "Option A" chosen over "Option B"): the
 * sourceManifestDigest-based `workspaceRevision` contract
 * (buildWorkspaceRevisionRecordV1) is the stronger identity, but
 * recomputing it per caller (it enumerates + digests the whole tracked
 * source tree) is too expensive for a pipeline that may run every few
 * minutes. This module reads the existing periodic snapshot
 * (docs/reports/workspace-source-binding-observation.json, produced by
 * sveltekit-frontend/scripts/atlas/observe-workspace-source-binding.mts)
 * and only claims PROVEN authority when that snapshot is fresh — a
 * stale snapshot degrades to UNPROVEN rather than silently claiming an
 * out-of-date revision was current. This is the honesty rule the
 * temporal ledger's own schema is built around.
 */
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_OBSERVATION_RELATIVE_PATH = 'docs/reports/workspace-source-binding-observation.json';
export const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h — the artifact is a periodic snapshot, not a live query

/**
 * @param {{ repoRoot?: string, observationPath?: string, maxAgeMs?: number, now?: number }} [options]
 * @returns {{ coordinate: { value: string|null, authority: 'PROVEN'|'UNPROVEN', evidence_refs: string[] }, reason: string, ageMs: number|null }}
 */
export function resolveWorkspaceRevisionCoordinate(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const observationPath = path.resolve(repoRoot, options.observationPath ?? DEFAULT_OBSERVATION_RELATIVE_PATH);
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = options.now ?? Date.now();

  if (!fs.existsSync(observationPath)) {
    return {
      coordinate: { value: null, authority: 'UNPROVEN', evidence_refs: [] },
      reason: 'observation_artifact_missing',
      ageMs: null,
    };
  }

  let record;
  try {
    const parsed = JSON.parse(fs.readFileSync(observationPath, 'utf8'));
    record = parsed?.record;
  } catch (err) {
    return {
      coordinate: { value: null, authority: 'UNPROVEN', evidence_refs: [] },
      reason: `observation_artifact_unreadable: ${err.message}`,
      ageMs: null,
    };
  }

  if (!record?.workspaceRevision || !record?.generatedAt) {
    return {
      coordinate: { value: null, authority: 'UNPROVEN', evidence_refs: [] },
      reason: 'observation_record_incomplete',
      ageMs: null,
    };
  }

  const ageMs = now - Date.parse(record.generatedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > maxAgeMs) {
    return {
      coordinate: { value: null, authority: 'UNPROVEN', evidence_refs: [] },
      reason: `observation_stale: age=${Math.round(ageMs / 60000)}min > max=${Math.round(maxAgeMs / 60000)}min`,
      ageMs,
    };
  }

  return {
    coordinate: {
      value: record.workspaceRevision,
      authority: 'PROVEN',
      evidence_refs: [path.relative(repoRoot, observationPath)],
    },
    reason: record.dirty
      ? 'observation_fresh_dirty_worktree (uncommitted changes present at observation time)'
      : 'observation_fresh_clean_worktree',
    ageMs,
  };
}
