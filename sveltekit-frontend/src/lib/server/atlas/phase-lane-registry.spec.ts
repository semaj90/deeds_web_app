import { describe, expect, it } from 'vitest';
import {
  buildParentAtlasPhaseLaneReport,
  getParentAtlasPhaseLane,
  getParentAtlasPhaseLaneSnapshot,
  listParentAtlasPhaseLanes,
} from './phase-lane-registry.js';

describe('parent atlas phase lane registry', () => {
  it('exposes the phase 11-25 mock ladder with canonical semantic_768 identity', () => {
    const snapshot = getParentAtlasPhaseLaneSnapshot();

    expect(snapshot.summary.total).toBe(15);
    expect(snapshot.summary.canonicalRepresentationId).toBe('semantic_768');
    expect(snapshot.summary.canonicalDimension).toBe(768);
    expect(snapshot.phases).toHaveLength(15);
    expect(snapshot.phases.every((phase) => phase.execution_mode === 'mock')).toBe(true);
    expect(snapshot.phases.every((phase) => phase.canonical_representation_id === 'semantic_768')).toBe(true);
    expect(snapshot.phases.every((phase) => phase.canonical_dimension === 768)).toBe(true);
  });

  it('keeps the live phase statuses and open-gaps explicit', () => {
    const phase14 = getParentAtlasPhaseLane(14);
    const phase25 = getParentAtlasPhaseLane(25);

    expect(phase14?.status).toBe('implemented');
    expect(phase25?.status).toBe('eval-only');
    expect(phase25?.open_gaps).toContain('evaluation only; not yet graded');
  });

  it('summarizes the mock ladder as a readable report', () => {
    const report = buildParentAtlasPhaseLaneReport();

    expect(report).toContain('Parent Atlas phase lanes: 15');
    expect(report).toContain('14. Redis exact-card cache policy');
    expect(report).toContain('25. PPO');
  });

  it('returns defensive copies for the phase list', () => {
    const first = listParentAtlasPhaseLanes();
    first[0] = {
      ...first[0],
      title: 'mutated',
    };

    const second = listParentAtlasPhaseLanes();
    expect(second[0]?.title).toBe('Engram / Gemma4 memory wiring');
  });
});
