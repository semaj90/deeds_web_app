import { ATLAS_CANONICAL_SEMANTIC_DIMENSION } from './qdrant-semantic-projection.js';

export interface AtlasSemantic512CorpusRowV1 {
  packetKey: string;
  /** Live atlas_packets currently has no canonical source_revision column. */
  sourceRevision?: string | null;
  sourceRef?: string | null;
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
  sourceRevision: string | null;
  sourceRef: string | null;
  symbolVersionId: string | null;
  treeNodeId: string | null;
  featureLabel: string | null;
  cosineDistance: number;
  cosineSimilarity: number;
}

export interface AtlasSemantic512ExactReceiptV1 {
  schema: 'atlas.semantic512-exact-knn-receipt.v1';
  operation: 'knn.exact';
  backend: 'cuvs.neighbors.brute_force';
  metric: 'cosine';
  algorithmRevision: string;
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
  if (input.query.vector.length !== ATLAS_CANONICAL_SEMANTIC_DIMENSION) throw new Error('ATLAS_SEMANTIC512_QUERY_DIMENSION');
  if (input.corpus.length === 0 || input.corpus.length > 512) throw new Error(`ATLAS_SEMANTIC512_CORPUS_COUNT:${input.corpus.length}`);
  if (!Number.isInteger(input.topK) || input.topK < 1 || input.topK > input.corpus.length) {
    throw new Error(`ATLAS_SEMANTIC512_TOPK:${input.topK}`);
  }
  const seen = new Set<string>();
  for (const [index, row] of input.corpus.entries()) {
    // packet_key is enough to keep GPU row identity deterministic. Source
    // freshness is a separate mutation-awareness proof, not a KNN prerequisite.
    if (!row.packetKey?.trim()) throw new Error(`ATLAS_SEMANTIC512_IDENTITY:${index}`);
    if (row.vector.length !== ATLAS_CANONICAL_SEMANTIC_DIMENSION) throw new Error(`ATLAS_SEMANTIC512_CORPUS_DIMENSION:${index}`);
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
      const response = await fetch(`${baseUrl}/v1/semantic512/knn/exact`, {
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
      if (receipt.representationId !== 'semantic_512' || receipt.dimension !== 512 || receipt.metric !== 'cosine') {
        throw new Error('ATLAS_SEMANTIC512_RECEIPT_CONTRACT_MISMATCH');
      }
      return receipt;
    },
  };
}
