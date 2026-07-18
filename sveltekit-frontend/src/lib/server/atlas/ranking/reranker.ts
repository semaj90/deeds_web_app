/**
 * Atlas ranking layer — interface-only bridge.
 *
 * Re-exports the canonical Reranker interface from packages/atlas/contracts
 * so that atlas/* adapters can import from a local path without crossing
 * the packages/ boundary at call-sites.
 *
 * Implementations live in src/lib/server/retrieval/ and adapt behind
 * this interface via createAtlasReranker() in index.ts.
 */

export type {
  RerankCandidate,
  RerankRequest,
} from '../../../../../../packages/atlas/contracts/rerank-request.js';

export type {
  RerankResult,
  RerankResultItem,
  Reranker,
} from '../../../../../../packages/atlas/contracts/rerank-result.js';
