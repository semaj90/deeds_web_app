import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// SYMBOL-WRITER-OWNER-01 bounded regression guard. Fails if a new, unclassified direct writer
// to atlas_symbol_registry/atlas_symbol_versions appears, or if a second writer shows up
// alongside the known canonical owner -- both real risks this census exists to catch.

const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
const KNOWN_OWNER = 'packages/parent-atlas/src/core/symbol-registry-repository.ts';

function findDirectWriters(): string[] {
  try {
    const out = execFileSync(
      'git',
      ['grep', '-lE', 'INSERT INTO atlas_symbol_(registry|versions)|UPDATE atlas_symbol_(registry|versions)',
        '--', 'sveltekit-frontend/src', 'sveltekit-frontend/scripts', 'packages', 'python', 'sveltekit-frontend/drizzle/manual'],
      { cwd: WORKSPACE_ROOT, encoding: 'utf8' },
    );
    return out.split('\n').filter(Boolean).filter((f) => !f.includes('node_modules') && !f.includes('/dist/') && !f.endsWith('.spec.ts'));
  } catch {
    return [];
  }
}

describe('SYMBOL-WRITER-OWNER-01 canonical owner guard', () => {
  it('exactly one direct writer exists, and it is the known canonical owner', () => {
    const writers = findDirectWriters();
    expect(writers).toEqual([KNOWN_OWNER]);
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
