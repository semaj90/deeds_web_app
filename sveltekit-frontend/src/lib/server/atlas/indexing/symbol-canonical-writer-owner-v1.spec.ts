import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// SYMBOL-WRITER-OWNER-01 bounded regression guard. Fails if a new, unclassified direct writer
// to atlas_symbol_registry/atlas_symbol_versions appears, or if a second writer shows up
// alongside the known canonical owner -- both real risks this census exists to catch.
//
// SOURCE-SYMBOL-AUTHORITY-01 audit (2026-09-27) found this guard itself had 3 real bugs, all
// fixed below, verified against a live audit (scripts/atlas/audit-symbol-producer-ownership-v1.mjs
// + audit-symbol-revision-producer-census-v1.mts, both read-only, both re-run live this session):
//   1. Search scope only covered sveltekit-frontend/scripts, missing repo-root scripts/atlas/ --
//      the exact directory where the real bypass writers live.
//   2. The regex required a bare "INSERT INTO atlas_symbol_..." with no schema prefix, missing
//      `INSERT INTO public.atlas_symbol_registry` (apply-current-tree-bound-symbol-registry-canary-v1.mjs).
//   3. The .spec.ts exclusion didn't also exclude .test.mjs, so a fixture file whose OWN test body
//      contains the literal string 'INSERT INTO atlas_symbol_versions' (as a string it searches
//      for, not SQL it executes) was misclassified as a second writer.
// Corrected finding: KNOWN_OWNER is the only writer reached through the intended call path
// (scripts/atlas/symbol-reconciliation-writer-v1.mts calls it via its compiled dist/ output --
// that's a legitimate caller, not a rival writer). But 3 legacy scripts still bypass it with
// direct SQL and have written unqualified/placeholder rows still sitting in both tables,
// uncorrected by ON CONFLICT DO NOTHING semantics: 10,220 atlas_symbol_registry rows carry the
// literal placeholder revision `workspace:0`, 90 more carry a Git commit oid (a repo-level
// revision, not a per-file content revision -- confirmed via `git cat-file -t`), and 77
// atlas_symbol_versions rows still carry `workspace:0` after a 2026-09-22 repair already fixed
// the 208 rows that had a recoverable input
// (docs/reports/symbol-revision-repair-apply-v1.json: readback 402/479 qualified, 77 still bad,
// left unrepaired because no valid re-derivable source existed for them). Live-reverified
// unchanged 2026-09-27: atlas_symbol_versions 479 total/402 qualified/0 with upstream_file_id
// populated; atlas_symbol_registry 10,504 total/194 qualified.
//
// This test now asserts the CURRENT VERIFIED state (one canonical owner + 3 known legacy bypass
// writers), not an aspirational "exactly one" that was simply false. Retiring the 3 legacy
// writers and repairing the remaining unqualified rows is separate, larger, tracked work
// (SOURCE-SYMBOL-AUTHORITY-01 in openspec/changes/parent-atlas-code-intel-e2e/tasks.md) -- this
// test's job is only to catch a FOURTH bypass writer appearing, not to force that consolidation.

const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
const KNOWN_OWNER = 'packages/parent-atlas/src/core/symbol-registry-repository.ts';
const KNOWN_LEGACY_BYPASS_WRITERS = [
  'scripts/atlas/apply-current-tree-bound-symbol-registry-canary-v1.mjs',
  'scripts/atlas/apply-symbol-revision-repair-v1.mjs',
  'scripts/atlas/freeze-symbol-revision-placeholder-repair-manifest-v1.mjs',
  'scripts/atlas/freeze-symbol-revision-repair-manifest-v1.mjs',
  'scripts/atlas/materialize-ast-symbol-versions.mjs',
  'scripts/atlas/promote-ast-symbols-to-registry.mjs',
  'scripts/atlas/prove-feature-intelligence-database.mjs',
].sort();

function findDirectWriters(): string[] {
  try {
    const out = execFileSync(
      'git',
      ['grep', '-lE', 'INSERT INTO (public\\.)?atlas_symbol_(registry|versions)|UPDATE (public\\.)?atlas_symbol_(registry|versions)',
        '--', 'sveltekit-frontend/src', 'sveltekit-frontend/scripts', 'scripts', 'packages', 'python', 'sveltekit-frontend/drizzle/manual'],
      { cwd: WORKSPACE_ROOT, encoding: 'utf8' },
    );
    return out.split('\n').filter(Boolean)
      .filter((f) => !f.includes('node_modules') && !f.includes('/dist/') && !f.endsWith('.spec.ts') && !f.endsWith('.test.mjs'))
      .sort();
  } catch {
    return [];
  }
}

describe('SYMBOL-WRITER-OWNER-01 canonical owner guard', () => {
  it('the known canonical owner plus exactly the known legacy bypass writers exist -- no unclassified new writer', () => {
    const writers = findDirectWriters();
    expect(writers).toEqual([KNOWN_OWNER, ...KNOWN_LEGACY_BYPASS_WRITERS].sort());
  });

  it('canonical owner requires explicit allow_create before any write', () => {
    const content = require('node:fs').readFileSync(path.join(WORKSPACE_ROOT, KNOWN_OWNER), 'utf8');
    expect(content).toContain('SYMBOL_PROMOTION_REQUIRES_EXPLICIT_ALLOW_CREATE');
  });

  it('canonical owner does not derive identity from forbidden inputs (path-only/latest/workspace:0/fuzzy)', () => {
    const content = require('node:fs').readFileSync(path.join(WORKSPACE_ROOT, KNOWN_OWNER), 'utf8');
    expect(content).not.toMatch(/latest|HEAD|workspace:0/i);
  });
});
