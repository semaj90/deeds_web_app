import fs from 'node:fs';
import path from 'node:path';

export const CURRENT_WORKSPACE_FRAME_SELECTOR_REVISION = 'atlas.current-workspace-frame-selector.v1';

const clean = (value) => String(value ?? '').trim();
const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
};
const argValue = (argv, name) => {
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const workspaceRevisionFrom = (value) => {
  if (!value || typeof value !== 'object') return null;
  const direct = clean(value.workspaceRevision);
  if (direct) return direct;
  const candidate = clean(value.workspaceRevisionCandidate);
  if (candidate) return candidate;
  const sourceSnapshot = clean(value.sourceSnapshot?.workspaceRevision);
  if (sourceSnapshot) return sourceSnapshot;
  return null;
};
const snapshotRevisionFrom = (value) => {
  if (!value || typeof value !== 'object') return null;
  return clean(value.snapshotRevision)
    || clean(value.sourceSnapshot?.snapshotRevision)
    || null;
};

function admissionCandidate(value, explicitSnapshotRevision) {
  if (!value || value.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || value.authority !== true) return null;
  const workspaceRevision = clean(value.workspaceRevision);
  if (!workspaceRevision) return null;
  const snapshotRevision = snapshotRevisionFrom(value);
  if (explicitSnapshotRevision && snapshotRevision !== explicitSnapshotRevision) return null;
  return { workspaceRevision, snapshotRevision, source: 'WORKSPACE_REVISION_TOURNAMENT_ADMISSION_RECEIPT', authority: true };
}

function snapshotAuthorityCandidate(value, explicitSnapshotRevision) {
  if (!value || value.status !== 'CURRENT_SNAPSHOT_PROVEN') return null;
  const workspaceRevision = clean(value.sourceSnapshot?.workspaceRevision);
  if (!workspaceRevision) return null;
  const snapshotRevision = snapshotRevisionFrom(value);
  if (explicitSnapshotRevision && snapshotRevision !== explicitSnapshotRevision) return null;
  return { workspaceRevision, snapshotRevision, source: 'CURRENT_GRAPHIFY_SNAPSHOT_AUTHORITY_RECEIPT', authority: true };
}

function derivedCandidate(derivation, selectionPlan, explicitSnapshotRevision) {
  if (!derivation || !selectionPlan) return null;
  if (derivation.status !== 'WORKSPACE_REVISION_CANDIDATE_READY_FOR_ADMISSION') return null;
  if (selectionPlan.status !== 'SOURCE_SELECTION_PLAN_READY_NOT_ADMITTED') return null;
  if (!clean(derivation.workspaceRevisionCandidate) || derivation.workspaceRevisionCandidate !== selectionPlan.workspaceRevisionCandidate) return null;
  if (!clean(derivation.snapshotRevision) || derivation.snapshotRevision !== selectionPlan.snapshotRevision) return null;
  if (explicitSnapshotRevision && derivation.snapshotRevision !== explicitSnapshotRevision) return null;
  return {
    workspaceRevision: clean(derivation.workspaceRevisionCandidate),
    snapshotRevision: clean(derivation.snapshotRevision),
    source: explicitSnapshotRevision ? 'DERIVED_CANDIDATE_BOUND_TO_EXPLICIT_MANIFEST' : 'CURRENT_SEALED_SNAPSHOT_DERIVATION_FALLBACK',
    authority: false,
  };
}

export function resolveCurrentWorkspaceFrameV1({
  root,
  argv = process.argv.slice(2),
  env = process.env,
  requireExplicitManifest = false,
} = {}) {
  if (!root) throw new Error('CURRENT_WORKSPACE_FRAME_ROOT_REQUIRED');

  const manifestArg = argValue(argv, '--manifest') ?? env.ATLAS_WORKSPACE_SNAPSHOT_MANIFEST ?? null;
  const manifestPath = manifestArg ? path.resolve(root, manifestArg) : null;
  const manifest = manifestPath ? readJson(manifestPath) : null;
  const explicitSnapshotRevision = snapshotRevisionFrom(manifest);
  const explicitManifestWorkspaceRevision = manifest && manifest.authority === true ? workspaceRevisionFrom(manifest) : null;

  const cliWorkspaceRevision = clean(argValue(argv, '--workspace-revision')) || null;
  const envWorkspaceRevision = clean(env.ATLAS_EXPECTED_GRAPHIFY_WORKSPACE_REVISION)
    || clean(env.ATLAS_GRAPHIFY_EXPECTED_WORKSPACE_REVISION)
    || null;

  const reportPath = (name) => path.resolve(root, 'docs/reports', name);
  const admission = readJson(reportPath('workspace-revision-tournament-admission-v1.json'));
  const snapshotAuthority = readJson(reportPath('current-graphify-snapshot-authority-v1.json'));
  const derivation = readJson(reportPath('workspace-revision-from-sealed-multi-repo-snapshot-v1.json'));
  const selectionPlan = readJson(reportPath('graphify-source-selection-plan-v1.json'));

  const authoritativeCandidates = [
    admissionCandidate(admission, explicitSnapshotRevision),
    snapshotAuthorityCandidate(snapshotAuthority, explicitSnapshotRevision),
  ].filter(Boolean);
  const authoritativeRevisionSet = [...new Set(authoritativeCandidates.map((candidate) => candidate.workspaceRevision))];
  const authorityConflict = authoritativeRevisionSet.length > 1;

  let selected = null;
  if (cliWorkspaceRevision) {
    selected = { workspaceRevision: cliWorkspaceRevision, snapshotRevision: explicitSnapshotRevision, source: 'CLI_WORKSPACE_REVISION', authority: false, explicitOverride: true };
  } else if (explicitManifestWorkspaceRevision) {
    selected = { workspaceRevision: explicitManifestWorkspaceRevision, snapshotRevision: explicitSnapshotRevision, source: 'EXPLICIT_AUTHORITY_MANIFEST', authority: true, explicitOverride: true };
  } else if (envWorkspaceRevision) {
    selected = { workspaceRevision: envWorkspaceRevision, snapshotRevision: explicitSnapshotRevision, source: 'ENV_WORKSPACE_REVISION', authority: false, explicitOverride: true };
  } else if (!authorityConflict && authoritativeCandidates.length > 0) {
    selected = authoritativeCandidates[0];
  } else if (!authorityConflict) {
    selected = derivedCandidate(derivation, selectionPlan, explicitSnapshotRevision);
  }

  const blockers = [];
  if (requireExplicitManifest && !manifestPath) blockers.push('EXPLICIT_SNAPSHOT_MANIFEST_REQUIRED');
  if (manifestPath && !manifest) blockers.push('EXPLICIT_SNAPSHOT_MANIFEST_UNREADABLE');
  if (manifestPath && !explicitSnapshotRevision) blockers.push('EXPLICIT_SNAPSHOT_REVISION_MISSING');
  if (authorityConflict && !selected?.explicitOverride) blockers.push('CURRENT_REVISION_SELECTOR_CONFLICT');
  if (!selected?.workspaceRevision) blockers.push('CURRENT_WORKSPACE_REVISION_UNRESOLVED');

  return {
    schema: CURRENT_WORKSPACE_FRAME_SELECTOR_REVISION,
    status: blockers.length ? 'CURRENT_WORKSPACE_FRAME_BLOCKED' : 'CURRENT_WORKSPACE_FRAME_SELECTED',
    selectedWorkspaceRevision: selected?.workspaceRevision ?? null,
    selectedSnapshotRevision: selected?.snapshotRevision ?? explicitSnapshotRevision ?? null,
    selectedSource: selected?.source ?? null,
    selectedAuthority: selected?.authority === true,
    explicitOverride: selected?.explicitOverride === true,
    manifestPath,
    explicitSnapshotRevision,
    authoritativeCandidates,
    authoritativeRevisionSet,
    authorityConflict,
    derivedFallback: derivedCandidate(derivation, selectionPlan, explicitSnapshotRevision),
    blockers,
  };
}

/**
 * CURRENT-WORKSPACE-FRAME-AUTHORITY-SEMANTICS-01.
 *
 * `resolveCurrentWorkspaceFrameV1()` above can SELECT a frame from a CLI override, an env
 * override, or a non-authoritative derived/fallback candidate (`selectedAuthority: false` in
 * all three cases) -- that is correct and useful for driving a diagnostic audit, but a selected
 * frame is not automatically a canonically admitted one. Frame selection and frame authority are
 * two different questions; conflating them was flagged as a real risk before any canonical gate
 * consumed this selector. This function makes that distinction explicit and machine-checkable
 * without changing `resolveCurrentWorkspaceFrameV1()`'s own contract or its existing tests.
 *
 * `frameAuthoritative` is true only when: the frame was actually selected (not blocked), the
 * winning candidate itself carries `authority: true` (i.e. it came from
 * `WORKSPACE_REVISION_TOURNAMENT_ADMISSION_RECEIPT` or `CURRENT_GRAPHIFY_SNAPSHOT_AUTHORITY_RECEIPT`,
 * never CLI/env/derived), there is no unresolved authority conflict, and there are zero blockers.
 * `canonicalAuthority` / `promotionEligible` currently mirror `frameAuthoritative` one-for-one --
 * kept as separate named fields because Gate 2+ may need to add conditions that make a frame
 * authoritative-but-not-yet-promotion-eligible (e.g. pending a downstream cohort recheck) without
 * relaxing what "authoritative" itself means.
 */
export function computeWorkspaceFrameAuthorityV1(frame) {
  const frameAuthoritative = frame.status === 'CURRENT_WORKSPACE_FRAME_SELECTED'
    && frame.selectedAuthority === true
    && frame.authorityConflict === false
    && Array.isArray(frame.blockers)
    && frame.blockers.length === 0;
  return {
    schema: 'atlas.current-workspace-frame-authority.v1',
    frameAuthoritative,
    canonicalAuthority: frameAuthoritative,
    promotionEligible: frameAuthoritative,
  };
}
