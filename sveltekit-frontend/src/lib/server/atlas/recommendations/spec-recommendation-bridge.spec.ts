import { describe, expect, it } from 'vitest';
import { buildSpecRecommendation, buildSpecRecommendations } from './spec-recommendation-bridge.js';

describe('spec recommendation bridge', () => {
  it('maps a verified spec into a patch-ready recommendation', () => {
    const draft = buildSpecRecommendation({
      specId: 'phase-108e-qdrant-v2',
      title: 'Qdrant dense retrieval v2',
      status: 'ACTIVE_VERIFIED',
      sourceRef: 'docs/openspec/phase-108e/spec.md',
      featureId: 'feature:qdrant-dense-v2',
      featureLabel: 'Qdrant dense retrieval v2',
      targetFiles: ['sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts'],
      evidenceRefs: ['docs/reports/phase108e-proof.json'],
    });

    expect(draft.dryRun).toBe(true);
    expect(draft.status).toBe('ACTIVE_VERIFIED');
    expect(draft.action).toBe('stop_evidence_sufficient');
    expect(draft.recommendation.decision).toBe('patch_existing');
    expect(draft.recommendation.permission_level).toBe('patch_allowed');
    expect(draft.recommendation.normalized_source_ref).toBe('docs/openspec/phase-108e/spec.md');
    expect(draft.recommendation.evidence.rg_matches).toContain('docs/reports/phase108e-proof.json');
  });

  it('keeps blocked or superseded specs in a read-only open-task state', () => {
    const draft = buildSpecRecommendation({
      specId: 'phase-legacy-384',
      title: 'Legacy 384 lane',
      status: 'SUPERSEDED',
      sourceRef: 'docs/openspec/legacy/spec.md',
      doNotDo: ['promote 384 as canonical'],
    });

    expect(draft.action).toBe('open_blocked_task');
    expect(draft.recommendation.decision).toBe('ask_permission');
    expect(draft.recommendation.permission_level).toBe('read_only');
    expect(draft.recommendation.do_not_do).toContain('promote 384 as canonical');
  });

  it('maps unwired implementations into repair-oriented dry runs', () => {
    const drafts = buildSpecRecommendations([
      {
        specId: 'gsd-domain-labeler',
        title: 'Domain classifier wiring',
        status: 'IMPLEMENTED_UNWIRED',
        sourceRef: 'scripts/atlas/derive-gsd-ids.mjs',
      },
    ]);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.action).toBe('repair_qdrant_identity_bridge');
    expect(drafts[0]?.recommendation.decision).toBe('create_card');
    expect(drafts[0]?.recommendation.gemma4.risk).toBe('medium');
  });
});
