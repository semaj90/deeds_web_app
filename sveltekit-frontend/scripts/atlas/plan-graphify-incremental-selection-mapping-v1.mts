#!/usr/bin/env tsx
/**
 * Read-only feasibility proof for the open question recorded in
 * parent-atlas-retrieval-lineage-dag-convergence/tasks.md under the "Downstream ledger seam
 * added 2026-09-06" note: can graphify-incremental.mjs's git-log-since-N-hours changed-file
 * selection be mapped onto the coordinator's full-workspace-revision SOURCE_SELECTION bindings
 * (materializeWorkspaceRevisionOriginV1)? This does NOT open a coordinator execution, call any
 * record*Stage function, or touch graphify-incremental.mjs -- it only measures whether the
 * mapping is feasible and what it would look like.
 *
 * Zero writes. Prints only.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { materializeWorkspaceRevisionOriginV1 } from '../../src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';
import { adaptWorkspaceBindingsToSourceSelectionV1 } from '../../src/lib/server/atlas/indexing/graphify-daily-coordinator-v1.js';
import { loadAtlasEnv } from './load-atlas-env.mjs';

loadAtlasEnv();

const SINCE_HOURS = Number(process.argv.find((a) => a.startsWith('--since-hours='))?.split('=')[1] ?? '24');
const workspaceRoot = resolve(process.cwd(), '..');

// Reproduces graphify-incremental.mjs's own Step 1 changed-file detection exactly (same git
// invocation, same extension filter, same fallback), read-only -- does not modify that script.
function discoverChangedFiles(): string[] {
  const sinceTs = new Date(Date.now() - SINCE_HOURS * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16);
  const gitOut = execSync(
    `git log --since="${sinceTs}" --name-only --pretty=format: --diff-filter=ACMR`,
    { cwd: workspaceRoot, encoding: 'utf-8' },
  );
  return [...new Set(
    gitOut.split('\n').map((f) => f.trim())
      .filter((f) => f && (f.endsWith('.ts') || f.endsWith('.svelte') || f.endsWith('.js') || f.endsWith('.mjs')))
      .map((f) => resolve(workspaceRoot, f))
      .filter((f) => existsSync(f)),
  )];
}

// graphify-incremental.mjs's own toSourceRef(): strips the sveltekit-frontend/ prefix.
function incrementalSourceRef(absPath: string): string {
  const sveltekitRoot = resolve(workspaceRoot, 'sveltekit-frontend');
  if (absPath.startsWith(sveltekitRoot)) {
    return relative(sveltekitRoot, absPath).replace(/\\/g, '/');
  }
  return relative(workspaceRoot, absPath).replace(/\\/g, '/');
}

const changedAbsPaths = discoverChangedFiles();
const incrementalRefs = new Set(changedAbsPaths.map(incrementalSourceRef));

const origin = materializeWorkspaceRevisionOriginV1({
  workspaceRoot,
  repositoryId: 'semaj90/deeds_web_app',
  producerRevision: 'plan-graphify-incremental-selection-mapping.v1',
});

// Coordinator bindings are repo-root-relative (e.g. "sveltekit-frontend/src/lib/auth.ts" or
// "scripts/atlas/foo.mjs"); graphify-incremental's own toSourceRef() strips the
// sveltekit-frontend/ prefix ONLY for paths under it and leaves everything else repo-root-relative
// -- so the correct comparison key per binding is "strip the prefix if present, else keep as-is,"
// not "always strip." An earlier version of this script only built the stripped-prefix map and
// undercounted matches for every real file outside sveltekit-frontend/ (scripts/atlas/*.mjs,
// packages/*) -- fixed here before trusting the numbers, not left as a silent undercount.
const bindingByIncrementalConventionRef = new Map<string, (typeof origin.bindings)[number]>();
for (const binding of origin.bindings) {
  const key = binding.sourceRef.startsWith('sveltekit-frontend/')
    ? binding.sourceRef.slice('sveltekit-frontend/'.length)
    : binding.sourceRef;
  bindingByIncrementalConventionRef.set(key, binding);
}

const matched: string[] = [];
const unmatched: string[] = [];
for (const ref of incrementalRefs) {
  if (bindingByIncrementalConventionRef.has(ref)) matched.push(ref);
  else unmatched.push(ref);
}

const matchedBindings = matched.map((ref) => bindingByIncrementalConventionRef.get(ref)!);
let adapterResult: { ok: true; count: number } | { ok: false; error: string };
try {
  const adapted = matchedBindings.length > 0
    ? adaptWorkspaceBindingsToSourceSelectionV1(origin.record.workspaceRevision, matchedBindings)
    : [];
  adapterResult = { ok: true, count: adapted.length };
} catch (error) {
  adapterResult = { ok: false, error: error instanceof Error ? error.message : String(error) };
}

console.log(JSON.stringify({
  schema: 'atlas.plan-graphify-incremental-selection-mapping.v1',
  writesPerformed: false,
  sinceHours: SINCE_HOURS,
  incrementalChangedFileCount: incrementalRefs.size,
  fullWorkspaceBindingCount: origin.bindings.length,
  workspaceRevision: origin.record.workspaceRevision,
  prefixMappingRequired: 'coordinator bindings are repo-root-relative (sveltekit-frontend/...); ' +
    'graphify-incremental refs are sveltekit-frontend-relative -- confirmed real, not hypothetical',
  matchedCount: matched.length,
  unmatchedCount: unmatched.length,
  unmatchedSample: unmatched.slice(0, 10),
  adapterResult,
  verdict: adapterResult.ok && unmatched.length === 0
    ? 'MAPPING_FEASIBLE_ALL_MATCHED'
    : adapterResult.ok
      ? 'MAPPING_FEASIBLE_WITH_UNMATCHED_REMAINDER'
      : 'MAPPING_BLOCKED_ADAPTER_REJECTED',
  note: 'Read-only. No coordinator execution was opened, no record*Stage function was called, ' +
    'and graphify-incremental.mjs was not modified. This only measures feasibility of the mapping.',
}, null, 2));
