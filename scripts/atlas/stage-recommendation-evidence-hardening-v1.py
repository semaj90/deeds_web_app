#!/usr/bin/env python3
"""Generate a compatibility-checked patch against Parent Atlas's existing owner.

Default: print unified diff; no repository mutation.
--apply: update the existing TypeScript module and add focused Vitest tests.
Only works against the exact expected source structure; refuses drift.
"""
from __future__ import annotations
import argparse, difflib, pathlib, sys

REL = pathlib.Path('sveltekit-frontend/src/lib/server/atlas/recommendations/recommendation-evidence-bundle-v1.ts')
TEST_REL = pathlib.Path('sveltekit-frontend/src/lib/server/atlas/recommendations/recommendation-evidence-bundle-readback-v1.spec.ts')

ORIGINAL_COMPILE = '''  const bundleChecksum = sha256(parsed);
  return RecommendationEvidenceBundleV1Schema.parse({ ...parsed, bundleChecksum });
}'''

REPLACED_COMPILE = '''  const bundleChecksum = sha256(parsed);
  const result = RecommendationEvidenceBundleV1Schema.parse({ ...parsed, bundleChecksum });
  verifyRecommendationEvidenceBundleV1(result);
  return result;
}'''

EXTRA = '''/**
 * Independently verifies a deserialized recommendation evidence envelope.
 * Does NOT prove external provider receipts, source-column lineage, or GPU execution;
 * those remain the responsibilities of the original producers and admission gates.
 *
 * Hash compatibility: v1's composer hashes the complete object with its
 * bundleChecksum temporarily set to 64 zeroes. Preserve this existing rule.
 */
export function verifyRecommendationEvidenceBundleV1(input: RecommendationEvidenceBundleV1): void {
  const bundle = RecommendationEvidenceBundleV1Schema.parse(input);
  const expectedChecksum = sha256({ ...bundle, bundleChecksum: '0'.repeat(64) });
  if (expectedChecksum !== bundle.bundleChecksum) {
    throw new Error('RECOMMENDATION_BUNDLE_CHECKSUM_MISMATCH');
  }
  const ordinalSet = new Set(bundle.candidateOrdinals);
  if (ordinalSet.size !== bundle.candidateOrdinals.length) {
    throw new Error('RECOMMENDATION_BUNDLE_DUPLICATE_ORDINAL');
  }
  if (bundle.sample && bundle.sample.ordinalMapChecksum !== bundle.ordinalMapChecksum) {
    throw new Error('RECOMMENDATION_BUNDLE_SAMPLE_ORDINAL_DRIFT');
  }

  const assertReceiptBinding = (receipt: RecommendationEvidenceReceiptV1, kind: string) => {
    if (receipt.workspaceRevision !== bundle.workspaceRevision) {
      throw new Error(`RECOMMENDATION_${kind}_WORKSPACE_REVISION_MISMATCH`);
    }
    if (receipt.sourceRevision !== bundle.sourceRevision) {
      throw new Error(`RECOMMENDATION_${kind}_SOURCE_REVISION_MISMATCH`);
    }
    if (receipt.representationRevision !== bundle.representationRevision) {
      throw new Error(`RECOMMENDATION_${kind}_REPRESENTATION_REVISION_MISMATCH`);
    }
    if (receipt.graphRevision !== null && bundle.graphRevision !== null && receipt.graphRevision !== bundle.graphRevision) {
      throw new Error(`RECOMMENDATION_${kind}_GRAPH_REVISION_MISMATCH`);
    }
  };

  if (bundle.knn) {
    assertReceiptBinding(bundle.knn, 'KNN');
    if (bundle.knn.hits.length > bundle.knn.topK) {
      throw new Error('RECOMMENDATION_KNN_TOPK_EXCEEDED');
    }
    const ranks = new Set<number>();
    const ordinals = new Set<number>();
    for (const hit of bundle.knn.hits) {
      if (hit.rank > bundle.knn.topK || ranks.has(hit.rank) || ordinals.has(hit.candidateOrdinal)) {
        throw new Error('RECOMMENDATION_KNN_DUPLICATE_OR_INVALID_RANK');
      }
      ranks.add(hit.rank);
      ordinals.add(hit.candidateOrdinal);
    }
  }

  for (const receipt of bundle.graph) {
    assertReceiptBinding(receipt, 'GRAPH');
    if (new Set(receipt.candidateOrdinals).size !== receipt.candidateOrdinals.length) {
      throw new Error('RECOMMENDATION_GRAPH_DUPLICATE_ORDINAL');
    }
  }
  for (const receipt of bundle.domain) {
    assertReceiptBinding(receipt, 'DOMAIN');
  }
}

'''
# No new registry: alias the already existing schema type for shared receipt validation.
EXTRA = EXTRA.replace('RecommendationEvidenceReceiptV1', 'RecommendationEvidenceReceiptV1')
# Existing schema is exported but its type alias is not: infer from the schema instead.
EXTRA = EXTRA.replace('receipt: RecommendationEvidenceReceiptV1', 'receipt: import(\'zod\').z.infer<typeof RecommendationEvidenceReceiptV1Schema>')

TEST = '''import { describe, expect, it } from 'vitest';
import {
  compileRecommendationEvidenceBundleV1,
  verifyRecommendationEvidenceBundleV1,
} from './recommendation-evidence-bundle-v1.js';

const H = 'a'.repeat(64);
const BASE = {
  schema: 'atlas.recommendation-evidence-bundle.v1' as const,
  requestId: 'readback-fixture', subjectRef: 'packet:fixture',
  workspaceRevision: 'workspace-r1', sourceRevision: 'source-r1',
  graphRevision: 'graph-r1', representationId: 'semantic_768' as const,
  representationRevision: 'semantic-r1', semanticChecksum: H,
  ordinalMapChecksum: H, candidateOrdinals: [0, 1],
  sample: null, graph: [], knn: null, domain: [],
  okfSchemaRevision: 'okf-r1', okfFeatureIds: ['domain.fit'],
  parameters: { topK: 10, graphHops: 1, sampleRank: 2, synthesisBudgetTokens: 2048 },
  canonicalWritesAllowed: false as const, retrievalVoteAdded: false as const,
  identityAuthority: false as const,
};
const KNN = {
  receiptId: 'knn-receipt-1', producer: 'fixture', producerRevision: 'producer-r1',
  workspaceRevision: BASE.workspaceRevision, sourceRevision: BASE.sourceRevision,
  graphRevision: BASE.graphRevision, representationRevision: BASE.representationRevision,
  checksum: H, kind: 'KNN_TOPK' as const, metric: 'COSINE_SIMILARITY' as const,
  topK: 2, ordinalMapChecksum: H,
  hits: [
    { candidateOrdinal: 0, canonicalId: 'cid:0', rank: 1, score: 0.8 },
    { candidateOrdinal: 1, canonicalId: 'cid:1', rank: 2, score: 0.6 },
  ],
};

describe('recommendation evidence bundle independent readback', () => {
  it('verifies a real v1 compositor checksum on a replayed bundle', () => {
    const out = compileRecommendationEvidenceBundleV1({ ...BASE, knn: KNN });
    expect(() => verifyRecommendationEvidenceBundleV1(JSON.parse(JSON.stringify(out)))).not.toThrow();
  });
  it('rejects payload tampering even when the schema still parses', () => {
    const out = compileRecommendationEvidenceBundleV1(BASE);
    expect(() => verifyRecommendationEvidenceBundleV1({ ...out, okfFeatureIds: ['changed'] })).toThrow('RECOMMENDATION_BUNDLE_CHECKSUM_MISMATCH');
  });
  it('rejects duplicate selected ordinals during composition', () => {
    expect(() => compileRecommendationEvidenceBundleV1({ ...BASE, candidateOrdinals: [0, 0] })).toThrow('RECOMMENDATION_BUNDLE_DUPLICATE_ORDINAL');
  });
  it('rejects sample ordinal-map drift', () => {
    expect(() => compileRecommendationEvidenceBundleV1({ ...BASE,
      sample: {
        schema: 'atlas.sample-query-matrix.v1' as const, matrixRole: 'LATENT_ROUTING' as const,
        rows: 2, columns: 64, samplingAxis: 'ROW' as const,
        samplingPolicy: 'LENGTH_SQUARED' as const, normalization: 'ROW_L2' as const,
        candidateSnapshotRevision: 'snapshot-r1', ordinalMapChecksum: 'b'.repeat(64),
        canonicalIdentityAuthority: false as const, retrievalVoteAdded: false as const,
        matrixChecksum: H,
      },
    })).toThrow('RECOMMENDATION_BUNDLE_SAMPLE_ORDINAL_DRIFT');
  });
  it('rejects KNN evidence from another source revision', () => {
    expect(() => compileRecommendationEvidenceBundleV1({ ...BASE,
      knn: { ...KNN, sourceRevision: 'source-r2' },
    })).toThrow('RECOMMENDATION_KNN_SOURCE_REVISION_MISMATCH');
  });
  it('rejects duplicated KNN rank', () => {
    expect(() => compileRecommendationEvidenceBundleV1({ ...BASE,
      knn: { ...KNN, hits: KNN.hits.map(x => ({...x, rank: 1})) },
    })).toThrow('RECOMMENDATION_KNN_DUPLICATE_OR_INVALID_RANK');
  });
  it('rejects a KNN result beyond its declared topK', () => {
    expect(() => compileRecommendationEvidenceBundleV1({ ...BASE,
      knn: { ...KNN, topK: 1 },
    })).toThrow('RECOMMENDATION_KNN_TOPK_EXCEEDED');
  });
  it('does not upgrade the result to canonical or authorize writes', () => {
    const out = compileRecommendationEvidenceBundleV1(BASE);
    expect(out.canonicalWritesAllowed).toBe(false);
    expect(out.identityAuthority).toBe(false);
    expect(out.retrievalVoteAdded).toBe(false);
  });
});
'''

# Fix type: z is already imported as a value, use z.infer directly.
EXTRA = EXTRA.replace("import('zod').z.infer", "z.infer")


def make_patch(src: str) -> str:
    if 'export function verifyRecommendationEvidenceBundleV1' in src:
        raise ValueError('ALREADY_HARDENED: refuse duplicate changes')
    if src.count(ORIGINAL_COMPILE) != 1:
        raise ValueError('EXPECTED_COMPOSER_SHAPE_NOT_FOUND: refuse drift')
    new = src.replace(ORIGINAL_COMPILE, REPLACED_COMPILE, 1)
    marker = 'export function recommendationEvidenceFeatureWeightV1('
    if new.count(marker) != 1:
        raise ValueError('EXPECTED_WEIGHT_FUNCTION_NOT_FOUND: refuse drift')
    new = new.replace(marker, EXTRA + marker, 1)
    return new


def main() -> None:
    ap=argparse.ArgumentParser()
    ap.add_argument('--repo-root',default='.')
    ap.add_argument('--apply',action='store_true',help='explicitly modify source file and write new spec')
    ap.add_argument('--out',help='optional diff file path (wx, no overwrite)')
    opt=ap.parse_args()
    root=pathlib.Path(opt.repo_root).resolve()
    target=root/REL
    original=target.read_text(encoding='utf8')
    updated=make_patch(original)
    diff=''.join(difflib.unified_diff(original.splitlines(keepends=True),updated.splitlines(keepends=True),fromfile='a/'+REL.as_posix(),tofile='b/'+REL.as_posix()))
    if opt.out:
        out=pathlib.Path(opt.out)
        out.parent.mkdir(parents=True,exist_ok=True)
        with out.open('x',encoding='utf8') as f:f.write(diff)
    if opt.apply:
        if (root/TEST_REL).exists(): raise ValueError('SPEC_ALREADY_EXISTS: refuse overwrite')
        target.write_text(updated,encoding='utf8')
        (root/TEST_REL).write_text(TEST,encoding='utf8')
        print(f'APPLIED {REL}; CREATED {TEST_REL} (tests NOT_RUN)')
    else:
        sys.stdout.write(diff)
        sys.stderr.write('DRY_RUN_ONLY: no source modifications\n')

if __name__=='__main__': main()
