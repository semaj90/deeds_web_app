import { SEMANTIC_512_DIMENSION } from './semantic-512.js';

export interface AtlasSemantic512CorpusRowV1 {
  packetKey: string;
  sourceRef?: string | null;
  /** Live atlas_packets currently has no canonical source_revision column. */
  sourceRevision?: string | null;
  sourceVersionReceiptId?: string | null;
  reconciliationReceiptId?: string | null;
  workspaceRevision?: number | null;
  representationRevision?: number | string | null;
  sourceRepresentationId?: string | null;
  symbolVersionId?: string | null;
  treeNodeId?: string | null;
  featureLabel?: string | null;
  vector: number[];
}

export interface AtlasSemantic512ExactRequestV1 {
  query: {
    vector: number[];
    representationId: 'semantic_512';
    representationRevision: string;
  };
  corpus: AtlasSemantic512CorpusRowV1[];
  topK: number;
  deadlineMs?: number;
}

export interface AtlasSemantic512ExactHitV1 {
  rank: number;
  rowIndex: number;
  packetKey: string;
  sourceRef: string | null;
  sourceRevision: string | null;
  sourceVersionReceiptId: string | null;
  reconciliationReceiptId: string | null;
  workspaceRevision: number | null;
  representationRevision: number | string | null;
  sourceRepresentationId: string | null;
  symbolVersionId: string | null;
  treeNodeId: string | null;
  featureLabel: string | null;
  cosineDistance: number;
  cosineSimilarity: number;
}

export interface AtlasSemantic512ExactReceiptV1 {
  schema: 'atlas.semantic512-exact-knn-receipt.v2';
  operation: 'knn.exact';
  backend: 'cuvs.neighbors.brute_force';
  metric: 'cosine';
  algorithmRevision: string;
  identityRequirement: 'packet_key';
  sourceFreshnessAuthority: 'external-mutation/source-version-receipt';
  representationId: 'semantic_512';
  representationRevision: string;
  dimension: 512;
  corpusRows: number;
  topK: number;
  identityManifestChecksum: string;
  durationMs: number;
  results: AtlasSemantic512ExactHitV1[];
}

function assertExactRequest(input: AtlasSemantic512ExactRequestV1): void {
  if (input.query.representationId !== 'semantic_512') throw new Error('ATLAS_SEMANTIC512_REPRESENTATION_REQUIRED');
  if (!input.query.representationRevision?.trim()) throw new Error('ATLAS_SEMANTIC512_REVISION_REQUIRED');
  if (input.query.vector.length !== SEMANTIC_512_DIMENSION) throw new Error('ATLAS_SEMANTIC512_QUERY_DIMENSION');
  if (input.corpus.length === 0 || input.corpus.length > 512) throw new Error(`ATLAS_SEMANTIC512_CORPUS_COUNT:${input.corpus.length}`);
  if (!Number.isInteger(input.topK) || input.topK < 1 || input.topK > input.corpus.length) {
    throw new Error(`ATLAS_SEMANTIC512_TOPK:${input.topK}`);
  }
  const seen = new Set<string>();
  for (const [index, row] of input.corpus.entries()) {
    if (!row.packetKey?.trim()) throw new Error(`ATLAS_SEMANTIC512_IDENTITY:${index}`);
    if (row.sourceRepresentationId != null && row.sourceRepresentationId !== 'semantic_512') {
      throw new Error(`ATLAS_SEMANTIC512_SOURCE_REPRESENTATION:${index}`);
    }
    if (row.vector.length !== SEMANTIC_512_DIMENSION) throw new Error(`ATLAS_SEMANTIC512_CORPUS_DIMENSION:${index}`);
    if (seen.has(row.packetKey)) throw new Error(`ATLAS_SEMANTIC512_DUPLICATE_IDENTITY:${row.packetKey}`);
    seen.add(row.packetKey);
  }
}

export function createAtlasRapidsSemantic512Client(
  baseUrl = process.env.ATLAS_RAPIDS_SIDECAR_URL ?? 'http://127.0.0.1:8098',
) {
  return {
    exactKnn: async (input: AtlasSemantic512ExactRequestV1): Promise<AtlasSemantic512ExactReceiptV1> => {
      assertExactRequest(input);
      const response = await fetch(`${baseUrl}/v1/semantic512/knn/exact-v2`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(input.deadlineMs ? Math.max(1_000, input.deadlineMs + 1_000) : 15_000),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`ATLAS_SEMANTIC512_HTTP_${response.status}:${detail}`);
      }
      const receipt = await response.json() as AtlasSemantic512ExactReceiptV1;
      if (
        receipt.schema !== 'atlas.semantic512-exact-knn-receipt.v2' ||
        receipt.representationId !== 'semantic_512' ||
        receipt.dimension !== 512 ||
        receipt.metric !== 'cosine' ||
        receipt.identityRequirement !== 'packet_key' ||
        receipt.sourceFreshnessAuthority !== 'external-mutation/source-version-receipt'
      ) {
        throw new Error('ATLAS_SEMANTIC512_RECEIPT_CONTRACT_MISMATCH');
      }
      return receipt;
    },
  };
}
