import { describe, expect, it } from 'vitest';
import {
  assertRepresentationDerivationDagV1,
  buildRepresentationDerivationDagV1,
} from '../../../../../../scripts/atlas/representation-derivation-dag-v1.mts';

describe('RepresentationDerivationDagV1', () => {
  it('rebuilds a deterministic checksum from the existing representation owners', () => {
    const first = buildRepresentationDerivationDagV1();
    const second = buildRepresentationDerivationDagV1();
    expect(first).toEqual(second);
    expect(first.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.canonicalAuthority).toBe(false);
  });

  it('keeps equal-dimension semantic MRL and AE vectors in separate lineages', () => {
    const dag = buildRepresentationDerivationDagV1();
    expect(dag.nodes.filter((node) => node.representationId === 'semantic_768')).toHaveLength(1);
    const mrl = dag.nodes.find((node) => node.nodeKey === 'semantic-mrl/semantic_mrl_256');
    const latent = dag.nodes.find((node) => node.nodeKey === 'ae-candidate/latent_256');
    expect(mrl).toMatchObject({
      representationFamily: 'SEMANTIC_EMBEDDING',
      dimensions: 256,
      parentNodeKey: 'semantic-canonical/semantic_768',
      parentRepresentationId: 'semantic_768',
    });
    expect(latent).toMatchObject({
      representationFamily: 'AUTOENCODER_LATENT',
      dimensions: 256,
      parentNodeKey: 'semantic-canonical/semantic_768',
      parentRepresentationId: 'semantic_768',
      status: 'UNTRAINED_CANDIDATE',
    });
    expect(mrl?.nodeKey).not.toBe(latent?.nodeKey);
  });

  it('preserves historical and candidate AE derivations without conflating their shared IDs', () => {
    const dag = buildRepresentationDerivationDagV1();
    expect(dag.nodes.find((node) => node.nodeKey === 'historical-v3/latent_128'))
      .toMatchObject({ derivation: 'NESTED_PREFIX_L2_RENORMALIZE' });
    expect(dag.nodes.find((node) => node.nodeKey === 'ae-candidate/latent_128'))
      .toMatchObject({ derivation: 'LEARNED', parentRepresentationId: 'latent_256' });
    expect(dag.nodes.find((node) => node.nodeKey === 'ae-candidate/latent_64'))
      .toMatchObject({
        derivation: 'NESTED_PREFIX_L2_RENORMALIZE',
        parentRepresentationId: 'latent_128',
      });
    expect(dag.unresolvedConflicts).toContainEqual({
      representationId: 'latent_128',
      lineageIds: ['ae-candidate', 'historical-v3'],
      disposition: 'LINEAGE_QUALIFICATION_REQUIRED',
    });
    expect(dag.unresolvedConflicts.some((conflict) => conflict.representationId === 'semantic_768')).toBe(false);
  });

  it('keeps clustering assignment, evidence depth, residency, and model state out of vector identity', () => {
    const dag = buildRepresentationDerivationDagV1();
    expect(dag.artifactClasses).toContainEqual({
      classId: 'KMEANS_ASSIGNMENT',
      status: 'OWNER_NOT_FOUND',
      owner: null,
      canonicalAuthority: false,
    });
    expect(dag.independentAxes).toMatchObject({
      evidenceDepth: expect.stringContaining('evidence-depth-v1.ts'),
      residencyTier: expect.stringContaining('ace-residency.ts'),
      modelExecutionState: expect.stringContaining('pass-checkpoint-v1.ts'),
    });
    expect(dag.nodes.some((node) => node.representationId === 'HOT' || node.representationId === 'COLD')).toBe(false);
  });

  it('rejects cross-family parent edges and duplicate node keys', () => {
    const dag = buildRepresentationDerivationDagV1();
    const candidate = dag.nodes.filter((node) => node.lineageId === 'ae-candidate');
    const wrongParent = candidate.map((node) => node.representationId === 'latent_128'
      ? { ...node, representationFamily: 'SEMANTIC_EMBEDDING' as const }
      : node);
    expect(() => assertRepresentationDerivationDagV1([...dag.nodes, dag.nodes[0]!]))
      .toThrow(/DUPLICATE_DAG_NODE/);
    expect(() => assertRepresentationDerivationDagV1(wrongParent))
      .toThrow(/DAG_CROSS_FAMILY_EDGE/);
  });
});
