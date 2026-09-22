import { describe, expect, it } from 'vitest';
import { classifyPopulationAction, KIND_POLICY } from '../../../../../scripts/atlas/lib/symbol-population-policy.mjs';

// SYMBOL-REGISTRY-POPULATION-PREVIEW-01 focused tests, per the review that scoped this gate.

describe('classifyPopulationAction (fail-closed population admission)', () => {
  it('UNKNOWN cannot promote', () => {
    const r = classifyPopulationAction({ symbolKind: 'UNKNOWN' }, { status: 'REGISTRY_MISSING' }, true);
    expect(r.action).toBe('REJECT_UNKNOWN_KIND');
    expect(r.proposedRegistryInsert).toBe(false);
  });

  it('VARIABLE policy is enforced (CONDITIONAL, unproven -> rejected, never bulk-admitted)', () => {
    expect(KIND_POLICY.VARIABLE).toBe('CONDITIONAL');
    const r = classifyPopulationAction({ symbolKind: 'VARIABLE' }, { status: 'REGISTRY_MISSING' }, true);
    expect(r.action).toBe('REJECT_KIND_POLICY');
    expect(r.proposedRegistryInsert).toBe(false);
  });

  it('legacy workspace:0 (REVISION_MISMATCH) cannot satisfy current revision -- never EXACT', () => {
    const r = classifyPopulationAction({ symbolKind: 'FUNCTION' }, { status: 'REVISION_MISMATCH' }, true);
    expect(r.action).toBe('LEGACY_LOGICAL_SYMBOL_CONTINUITY_UNPROVEN');
    expect(r.action).not.toBe('EXACT_CURRENT_VERSION_EXISTS');
    expect(r.proposedRegistryInsert).toBe(false);
  });

  it('wrong sourceRevision fails closed (same as legacy case, distinct real-revision mismatch)', () => {
    const r = classifyPopulationAction({ symbolKind: 'CLASS' }, { status: 'REVISION_MISMATCH' }, true);
    expect(r.proposedRegistryInsert).toBe(false);
    expect(r.proposedVersionInsert).toBe(false);
  });

  it('wrong span fails closed', () => {
    const r = classifyPopulationAction({ symbolKind: 'METHOD' }, { status: 'SPAN_MISMATCH' }, true);
    expect(r.action).toBe('REJECT_SPAN');
    expect(r.proposedRegistryInsert).toBe(false);
  });

  it('ambiguous logical-symbol resolution fails closed', () => {
    const r = classifyPopulationAction({ symbolKind: 'FUNCTION' }, { status: 'AMBIGUOUS' }, true);
    expect(r.action).toBe('AMBIGUOUS_LOGICAL_SYMBOL');
    expect(r.proposedRegistryInsert).toBe(false);
  });

  it('EXACT resolution proposes ZERO writes (reuse, not duplicate creation) -- golden control invariant', () => {
    const r = classifyPopulationAction({ symbolKind: 'FUNCTION' }, { status: 'EXACT', symbolVersionId: 'sv1', stableSymbolId: 'ss1' }, true);
    expect(r.action).toBe('EXACT_CURRENT_VERSION_EXISTS');
    expect(r.proposedRegistryInsert).toBe(false);
    expect(r.proposedVersionInsert).toBe(false);
  });

  it('a genuinely new eligible-kind observation with no registry row proposes NEW_LOGICAL_SYMBOL_AND_VERSION ONLY when upstream file identity is resolved', () => {
    const blocked = classifyPopulationAction({ symbolKind: 'FUNCTION' }, { status: 'REGISTRY_MISSING' }, false);
    expect(blocked.action).toBe('REJECT_FILE_IDENTITY');
    expect(blocked.blocker).toBe('BLOCKED_UPSTREAM_FILE_IDENTITY');
    expect(blocked.proposedRegistryInsert).toBe(false);

    const unblocked = classifyPopulationAction({ symbolKind: 'FUNCTION' }, { status: 'REGISTRY_MISSING' }, true);
    expect(unblocked.action).toBe('NEW_LOGICAL_SYMBOL_AND_VERSION');
    expect(unblocked.proposedRegistryInsert).toBe(true);
  });

  it('a new sourceRevision does not automatically mint a new stable_symbol_id -- REVISION_MISMATCH stays continuity-unproven, never auto-versioned', () => {
    // Same file, same name, different revision -- must NOT silently become EXISTING_LOGICAL_SYMBOL_NEW_VERSION.
    const r = classifyPopulationAction({ symbolKind: 'CLASS' }, { status: 'REVISION_MISMATCH' }, true);
    expect(r.action).not.toBe('EXISTING_LOGICAL_SYMBOL_NEW_VERSION');
    expect(r.action).toBe('LEGACY_LOGICAL_SYMBOL_CONTINUITY_UNPROVEN');
  });

  it('same name in a different file does not imply the same stable symbol -- REGISTRY_MISSING for that file classifies independently of name', () => {
    // classifyObservation() (tested separately) already scopes registry rows by source_ref, so a
    // same-named symbol in an unrelated file never contributes candidate rows here -- this test
    // locks the population layer's corresponding behavior: no name-only shortcut exists.
    const r = classifyPopulationAction({ symbolKind: 'FUNCTION' }, { status: 'REGISTRY_MISSING' }, true);
    expect(r.action).toBe('NEW_LOGICAL_SYMBOL_AND_VERSION'); // never resolves via name against another file's rows
  });

  it('is deterministic for identical inputs', () => {
    const observation = { symbolKind: 'FUNCTION' };
    const resolution = { status: 'EXACT', symbolVersionId: 'sv1', stableSymbolId: 'ss1' };
    const a = classifyPopulationAction(observation, resolution, true);
    const b = classifyPopulationAction(observation, resolution, true);
    expect(a).toEqual(b);
  });
});
