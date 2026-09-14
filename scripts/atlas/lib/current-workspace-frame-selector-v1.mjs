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
