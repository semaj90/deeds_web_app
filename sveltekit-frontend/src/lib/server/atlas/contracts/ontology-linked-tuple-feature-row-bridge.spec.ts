import { describe, expect, it } from 'vitest';
import { buildOntologyLinkedTuplesFromFeatureRow } from './ontology-linked-tuple-v1.js';

describe('FeatureRow ontology tuple bridge', () => {
  it.each([undefined, 'ACTIVE_VERIFIED'] as const)(
    'keeps tuple evidence gated when FeatureRow state is %s',
    (evidenceState) => {
      const featureRow = {
        identity: {
          packet_key: 'packet:fixture',
          source_ref: 'src/fixture.ts',
          file_path: 'src/fixture.ts',
          feature_id: 'fixture.feature',
          title_id: null,
          tree_node_id: null,
        },
        evidence_state: evidenceState,
        domain_class: 'utility',
        secondary_domains: [],
        ontology_ids: ['ontology:fixture'],
        concept_ids: ['concept:fixture'],
        lexical: null,
      } as Parameters<typeof buildOntologyLinkedTuplesFromFeatureRow>[0]['featureRow'];

      const tuples = buildOntologyLinkedTuplesFromFeatureRow({
        featureRow,
        packetKey: 'packet:fixture',
        sourceRef: 'src/fixture.ts',
        featureLabel: 'Fixture feature',
        sourceTables: ['atlas_feature_matrix_rows'],
      });

      expect(tuples.length).toBeGreaterThan(0);
      expect(tuples.every((tuple) => tuple.evidenceState === 'GATED')).toBe(true);
      expect(tuples.some((tuple) => tuple.confidence === 0.95)).toBe(false);
    }
  );
});
