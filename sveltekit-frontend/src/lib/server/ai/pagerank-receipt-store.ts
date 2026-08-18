/**
 * Persistence seam for PageRank execution receipts.
 *
 * TODO(INTEGRATION): implement with the existing Parent Atlas Postgres
 * provenance/receipt owner after schema reconciliation. No new table is created
 * by this stub.
 */

export interface PageRankExecutionReceiptRecordV1 {
  schema: 'atlas.pagerank-execution-receipt.v1';
  receiptId: string;
  graphRevision: string;
  projectionRevision: string;
  projectionHash: string;
  configHash: string;
  resultHash: string;
  backend: 'NETWORKX' | 'CUGRAPH' | 'NEO4J_GDS';
  mode: 'GLOBAL' | 'PERSONALIZED';
  alpha: number;
  maxIterations: number;
  tolerance: number;
  elapsedMs: number;
  nodeCount: number;
  edgeCount: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface PageRankReceiptStore {
  put(receipt: PageRankExecutionReceiptRecordV1): Promise<void>;
  get(receiptId: string): Promise<PageRankExecutionReceiptRecordV1 | null>;
  findComparable(input: {
    graphRevision: string;
    projectionHash: string;
    configHash: string;
  }): Promise<PageRankExecutionReceiptRecordV1[]>;
}

export class UnconfiguredPageRankReceiptStore implements PageRankReceiptStore {
  async put(): Promise<void> {
    throw new Error('PAGERANK_RECEIPT_STORE_NOT_CONFIGURED');
  }
  async get(): Promise<null> { return null; }
  async findComparable(): Promise<PageRankExecutionReceiptRecordV1[]> { return []; }
}

// TODO(TEST-LATER): choose the existing canonical receipt/provenance table owner.
// TODO(TEST-LATER): add an idempotent unique identity over backend + projectionHash + configHash + resultHash.
// TODO(TEST-LATER): persist backend/library revisions and CUDA/RAPIDS version in metadata.
