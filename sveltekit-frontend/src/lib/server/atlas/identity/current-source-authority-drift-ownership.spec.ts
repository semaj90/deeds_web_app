import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CURRENT_SOURCE_AUTHORITY_SCHEMA, SEALER_ARTIFACT_SCHEMA, classifyCurrentSourcesV1, classifyLiveDriftV1, keyOf, membershipSetChecksumV1 } from './current-source-authority-v1';
import { createHash } from 'node:crypto';

// vitest runs with cwd = sveltekit-frontend; scripts live one level up.
const repo = (rel: string) => resolve(process.cwd(), '..', rel);
const read = (rel: string) => readFileSync(repo(rel), 'utf8');

describe('live working-tree drift is a separate, diagnostic predicate (S01-07A)', () => {
  const refs = ['a', 'b', 'c', 'd', 'e'];
  const rows = [
    { sourceRef: 'a', status: 'EXACT_CURRENT_BINDING' },
    { sourceRef: 'b', status: 'CURRENT_BINDING_MISMATCH', mismatchReasons: ['CONTENT_DIGEST_MISMATCH'] },
    { sourceRef: 'c', status: 'EXCLUDED_SUBMODULE' },
    { sourceRef: 'd', status: 'SOURCE_UNAVAILABLE' },
    // 'e' has no planner row at all
  ];

  it('maps planner labels onto the live vocabulary, preserves the original labels, and never treats an unobserved source as exact', () => {
    const d = classifyLiveDriftV1(refs, rows);
    expect(d.liveExactMatch).toBe(1);
    expect(d.changedSinceSeal).toBe(1);
    expect(d.excludedNestedRepository).toBe(1);
    expect(d.unavailable).toBe(1);
    expect(d.notObserved).toBe(1);
    expect(d.driftCount).toBe(4);
    expect(d.plannerLabelCounts).toEqual({ EXACT_CURRENT_BINDING: 1, CURRENT_BINDING_MISMATCH: 1, EXCLUDED_SUBMODULE: 1, SOURCE_UNAVAILABLE: 1 });
    expect(d.affectsAuthorityProof).toBe(false);
    expect(d.mustBeRespectedByFutureLiveCanary).toBe(true);
  });

  it('an unknown planner label or a duplicated planner row is LIVE_NOT_OBSERVED, not exact', () => {
    expect(classifyLiveDriftV1(['a'], [{ sourceRef: 'a', status: 'SOMETHING_NEW' }]).notObserved).toBe(1);
    expect(classifyLiveDriftV1(['a'], [{ sourceRef: 'a', status: 'EXACT_CURRENT_BINDING' }, { sourceRef: 'a', status: 'EXACT_CURRENT_BINDING' }]).liveExactMatch).toBe(0);
  });

  it('planner rows outside the sealed cohort are counted but never widen the cohort', () => {
    const d = classifyLiveDriftV1(['a'], [{ sourceRef: 'a', status: 'EXACT_CURRENT_BINDING' }, { sourceRef: 'zzz', status: 'EXACT_CURRENT_BINDING' }]);
    expect(d.admitted).toBe(1);
    expect(d.plannerRowsOutsideCohort).toBe(1);
  });

  it('sealed authority does not depend on drift: the sealed classification/checksum are identical whatever the planner says', () => {
    const digestOf = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
    const WS = `sha256:${'a'.repeat(64)}`;
    const SNAP = `sha256:${'5'.repeat(64)}`;
    const d1 = digestOf('one');
    const snap = { sourceIdentityKey: keyOf('repo:root', 'a.ts'), repositoryId: 'repo:root', repositoryRelativePath: 'a.ts', sourceRef: 'a.ts', sourceRevision: `sha256:${d1}`, contentDigest: d1, byteLength: 3 };
    const mem = { repositoryId: 'repo:root', repositoryRelativePath: 'a.ts', sourceRef: 'a.ts', workspaceRevision: WS, codeSourceRevision: `sha256:${d1}`, contentHash: d1, byteLength: 3 };
    const set = membershipSetChecksumV1([snap.sourceIdentityKey]);
    const input = {
      admitted: { workspaceId: 'w', workspaceRevision: WS, snapshotRevision: SNAP, sourceCount: 1, membershipChecksum: set, admissionStatus: 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED', admissionAuthority: true },
      snapshot: { snapshotRevision: SNAP, selfDigestValid: true, workspaceRevisionClaim: null, canonicalAuthorityClaim: false, violations: 0, membershipChecksum: set, sources: [snap] },
      preflight: { workspaceRevisionCandidate: WS, snapshotRevision: SNAP, sourceCount: 1, membershipChecksum: set },
      membership: [mem],
    };
    const sealed = classifyCurrentSourcesV1(input);
    // Heavy drift on the live side changes nothing about the sealed result (the two functions share no state).
    classifyLiveDriftV1(['a.ts'], [{ sourceRef: 'a.ts', status: 'CURRENT_BINDING_MISMATCH' }]);
    const sealedAgain = classifyCurrentSourcesV1(input);
    expect(sealedAgain).toEqual(sealed);
    expect(sealed.status).toBe('CURRENT_SOURCE_AUTHORITY_PROVEN');
  });
});

describe('artifact ownership: sealer and S01-07 cohort proof never share a file or a schema (S01-07A)', () => {
  const SEALER = 'scripts/atlas/seal-current-source-authority-v1.mjs';
  const AUDIT = 'scripts/atlas/audit-current-source-authority-v1.mts';
  const SEALER_FILE = 'docs/reports/current-source-authority-v1.json';
  const COHORT_POINTER = 'docs/reports/current-source-authority-cohort-v1.json';

  it('the two schema ids and roles are distinct', () => {
    expect(SEALER_ARTIFACT_SCHEMA).toBe('atlas.current-source-authority.v1');
    expect(CURRENT_SOURCE_AUTHORITY_SCHEMA).toBe('atlas.current-source-authority-cohort.v1');
    expect(CURRENT_SOURCE_AUTHORITY_SCHEMA).not.toBe(SEALER_ARTIFACT_SCHEMA);
  });

  it('the sealer writes only current-source-authority-v1.json', () => {
    const src = read(SEALER);
    expect(src).toContain("'current-source-authority-v1.json'");
    expect(src).not.toContain('current-source-authority-cohort');
  });

  it('the S01-07 audit writes only current-source-authority-cohort-v1* and never names the sealer file as an output', () => {
    const src = read(AUDIT);
    // every writeFileSync target in the audit
    const targets = [...src.matchAll(/writeFileSync\(\s*(?:resolve\(ROOT,\s*)?([^,]+),/g)].map((m) => m[1].trim());
    expect(targets.length).toBeGreaterThan(0);
    expect(src).not.toContain(`'${SEALER_FILE}'`);
    expect(src).toContain(COHORT_POINTER.replace('docs/reports/', ''));
    expect(src).toContain('current-source-authority-cohort-v1.${receiptChecksum');
    // the audit reads the sealer schema string nowhere as its own output schema
    expect(src).not.toContain(SEALER_ARTIFACT_SCHEMA);
  });

  it('the sealer-owned artifact on disk still carries the sealer schema and gate (not overwritten by the cohort proof)', () => {
    if (!existsSync(repo(SEALER_FILE))) return;
    const artifact = JSON.parse(read(SEALER_FILE));
    expect(artifact.schema).toBe(SEALER_ARTIFACT_SCHEMA);
    expect(artifact.gate).toBe('CURRENT-SOURCE-OWNER-RECONCILIATION-01');
  });

  it('the cohort pointer on disk carries the cohort schema and role', () => {
    if (!existsSync(repo(COHORT_POINTER))) return;
    const pointer = JSON.parse(read(COHORT_POINTER));
    expect(pointer.schema).toBe(CURRENT_SOURCE_AUTHORITY_SCHEMA);
    expect(pointer.role).toBe('S01_07_COHORT_PROOF');
  });
});
