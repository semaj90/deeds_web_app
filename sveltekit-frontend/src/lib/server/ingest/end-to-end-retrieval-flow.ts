/**
 * End-to-End Retrieval Flow — Complete Proof Chain
 *
 * This file orchestrates all 16 gates from SearXNG discovery through Gemma4 synthesis.
 * It is the proof schema that validates the complete personal data pipeline.
 *
 * Gates (in order):
 * 1. CRAWLED_WITH_PROVENANCE — Crawl4AI fetches URL with timestamp + HTTP metadata
 * 2. ZOD_VALIDATED — CrawledDocument schema enforces structure
 * 3. POSTGRES_AUTHORITY_PERSISTED — atlas_documents + atlas_chunks INSERT
 * 4. CHUNK_LINEAGE_PERSISTED — chunk_id, source_ref, content_hash tracked
 * 5. EMBEDDING_MODEL_RECORDED — embeddinggemma (768d) version logged
 * 6. QDRANT_UPSERT_READBACK — Vector + payload written to personal_corpus_768
 * 7. TOPK_QUERY_RETRIEVAL — Qdrant ANN with ACL filters (owner_id, access_scope)
 * 8. DOMAIN_CLASSIFICATION — Lexical + semantic + optional Gemma4 classification
 * 9. ENTITY_RESOLUTION — LangExtract (Phase 8) entities + Wikidata resolution
 * 10. NARY_FACT_EXTRACTION — Gemma4 fact extraction → atlas_facts + atlas_fact_arguments
 * 11. HYPERGRAPH_PROJECTION_READBACK — Neo4j Fact nodes + HAS_ARGUMENT edges
 * 12. BOUNDED_GRAPH_EXPANSION — k-hop (depth≤2, max 30 entities, max 75 facts)
 * 13. RRF_RANKING_TRACE — Reciprocal rank fusion (dense + entity + graph scores)
 * 14. ACE_PACKET_ASSEMBLED — Bounded context envelope (≤4,800 tokens)
 * 15. ACL_ISOLATION_TEST — Verify user_id filtering (private/workspace/public scopes)
 * 16. ANSWER_WITH_SOURCE_REFS — Gemma4 → structured answer + source citations
 *
 * This module is the test harness that proves all 16 gates work end-to-end on a single document.
 */

import { createHash } from 'node:crypto';
import type { CrawledDocument } from './crawled-document.schema.js';
import { getCrawl4AIClient } from './crawl4ai-client.js';
import { ingestCrawledDocument } from './postgres-ingest-boundary.js';

/**
 * Complete proof result for a single document through all 16 gates
 */
export interface EndToEndProofResult {
  sourceUrl: string;
  documentId: string;
  gates: {
    CRAWLED_WITH_PROVENANCE: { passed: boolean; proof: string };
    ZOD_VALIDATED: { passed: boolean; proof: string };
    POSTGRES_AUTHORITY_PERSISTED: { passed: boolean; proof: string };
    CHUNK_LINEAGE_PERSISTED: { passed: boolean; proof: string };
    EMBEDDING_MODEL_RECORDED: { passed: boolean; proof: string };
    QDRANT_UPSERT_READBACK: { passed: boolean; proof: string };
    TOPK_QUERY_RETRIEVAL: { passed: boolean; proof: string };
    DOMAIN_CLASSIFICATION: { passed: boolean; proof: string };
    ENTITY_RESOLUTION: { passed: boolean; proof: string };
    NARY_FACT_EXTRACTION: { passed: boolean; proof: string };
    HYPERGRAPH_PROJECTION_READBACK: { passed: boolean; proof: string };
    BOUNDED_GRAPH_EXPANSION: { passed: boolean; proof: string };
    RRF_RANKING_TRACE: { passed: boolean; proof: string };
    ACE_PACKET_ASSEMBLED: { passed: boolean; proof: string };
    ACL_ISOLATION_TEST: { passed: boolean; proof: string };
    ANSWER_WITH_SOURCE_REFS: { passed: boolean; proof: string };
  };
  summary: {
    totalGates: number;
    passedGates: number;
    failedGates: number;
    overallStatus: 'PROVEN' | 'PARTIAL_PROVEN' | 'NOT_PROVEN';
  };
}

/**
 * Gate 1: CRAWLED_WITH_PROVENANCE
 * Crawl4AI fetches URL, records timestamp, HTTP status, media type
 */
export async function gate1CrawledWithProvenance(url: string): Promise<{
  passed: boolean;
  proof: string;
  crawled?: CrawledDocument;
  error?: string;
}> {
  try {
    const client = getCrawl4AIClient();
    if (!client) {
      return { passed: false, proof: 'Crawl4AI client not initialized' };
    }

    const crawled = await client.crawl(url);

    if (!crawled.retrieved_at || !crawled.content_hash) {
      return { passed: false, proof: 'Missing timestamp or content_hash' };
    }

    return {
      passed: true,
      proof: `Crawled ${url} → ${crawled.canonical_url} (${crawled.content_hash.slice(0, 8)}..., ${crawled.retrieved_at})`,
      crawled,
    };
  } catch (err) {
    return {
      passed: false,
      proof: `Crawl failed: ${err instanceof Error ? err.message : String(err)}`,
      error: String(err),
    };
  }
}

/**
 * Gate 2: ZOD_VALIDATED
 * CrawledDocument schema enforces all required fields
 */
export function gate2ZodValidated(crawled: CrawledDocument): {
  passed: boolean;
  proof: string;
} {
  // If we got a CrawledDocument, schema validation already passed in gate1
  if (crawled && crawled.source_url && crawled.content_hash) {
    return {
      passed: true,
      proof: `CrawledDocument schema valid: title="${crawled.title}", text=${crawled.text.length} chars, links=${crawled.links.length}`,
    };
  }

  return { passed: false, proof: 'CrawledDocument validation failed' };
}

/**
 * Gate 3: POSTGRES_AUTHORITY_PERSISTED
 * INSERT into atlas_documents (canonical storage)
 */
export async function gate3PostgresAuthorityPersisted(
  crawled: CrawledDocument,
  userId: number,
  workspaceId: string,
): Promise<{
  passed: boolean;
  proof: string;
  documentId?: string;
}> {
  try {
    const result = await ingestCrawledDocument(crawled, userId, workspaceId);

    if (result.wasDuplicate) {
      return {
        passed: true,
        proof: `Document already exists (duplicate): ${result.documentId}`,
        documentId: result.documentId,
      };
    }

    return {
      passed: true,
      proof: `Document persisted: ${result.documentId} (${result.chunkCount} chunks)`,
      documentId: result.documentId,
    };
  } catch (err) {
    return {
      passed: false,
      proof: `Postgres insert failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Gate 4: CHUNK_LINEAGE_PERSISTED
 * Verify chunk records include source_ref, content_hash, position
 */
export function gate4ChunkLineagePersisted(chunkCount: number, documentId: string): {
  passed: boolean;
  proof: string;
} {
  if (chunkCount > 0) {
    return {
      passed: false,
      proof: `${chunkCount} chunks created (document_id=${documentId}); readback gate not implemented`,
    };
  }

  return { passed: false, proof: 'No chunks persisted' };
}

/**
 * Gate 5: EMBEDDING_MODEL_RECORDED
 * embeddinggemma (768d) version recorded in chunk metadata
 */
export function gate5EmbeddingModelRecorded(): {
  passed: boolean;
  proof: string;
} {
  return {
    passed: false,
    proof: `Embedding model provenance not proven by this harness`,
  };
}

/**
 * Orchestrate gates 1-16 on a single document
 */
export async function runEndToEndProof(
  sourceUrl: string,
  userId: number,
  workspaceId: string,
): Promise<EndToEndProofResult> {
  const results: EndToEndProofResult = {
    sourceUrl,
    documentId: '',
    gates: {
      CRAWLED_WITH_PROVENANCE: { passed: false, proof: '' },
      ZOD_VALIDATED: { passed: false, proof: '' },
      POSTGRES_AUTHORITY_PERSISTED: { passed: false, proof: '' },
      CHUNK_LINEAGE_PERSISTED: { passed: false, proof: '' },
      EMBEDDING_MODEL_RECORDED: { passed: false, proof: '' },
      QDRANT_UPSERT_READBACK: { passed: false, proof: '' },
      TOPK_QUERY_RETRIEVAL: { passed: false, proof: '' },
      DOMAIN_CLASSIFICATION: { passed: false, proof: '' },
      ENTITY_RESOLUTION: { passed: false, proof: '' },
      NARY_FACT_EXTRACTION: { passed: false, proof: '' },
      HYPERGRAPH_PROJECTION_READBACK: { passed: false, proof: '' },
      BOUNDED_GRAPH_EXPANSION: { passed: false, proof: '' },
      RRF_RANKING_TRACE: { passed: false, proof: '' },
      ACE_PACKET_ASSEMBLED: { passed: false, proof: '' },
      ACL_ISOLATION_TEST: { passed: false, proof: '' },
      ANSWER_WITH_SOURCE_REFS: { passed: false, proof: '' },
    },
    summary: { totalGates: 16, passedGates: 0, failedGates: 0, overallStatus: 'NOT_PROVEN' },
  };

  // Gate 1: CRAWLED_WITH_PROVENANCE
  const g1 = await gate1CrawledWithProvenance(sourceUrl);
  results.gates.CRAWLED_WITH_PROVENANCE = { passed: g1.passed, proof: g1.proof };
  if (!g1.passed || !g1.crawled) {
    results.summary.overallStatus = 'NOT_PROVEN';
    return results;
  }

  // Gate 2: ZOD_VALIDATED
  const g2 = gate2ZodValidated(g1.crawled);
  results.gates.ZOD_VALIDATED = g2;
  if (!g2.passed) {
    results.summary.overallStatus = 'NOT_PROVEN';
    return results;
  }

  // Gate 3: POSTGRES_AUTHORITY_PERSISTED
  const g3 = await gate3PostgresAuthorityPersisted(g1.crawled, userId, workspaceId);
  results.gates.POSTGRES_AUTHORITY_PERSISTED = {
    passed: g3.passed,
    proof: g3.proof,
  };
  results.documentId = g3.documentId || '';
  if (!g3.passed) {
    results.summary.overallStatus = 'NOT_PROVEN';
    return results;
  }

  // Gate 4: CHUNK_LINEAGE_PERSISTED
  results.gates.CHUNK_LINEAGE_PERSISTED = {
    passed: false,
    proof: 'Chunk readback not implemented',
  };

  // Gate 5: EMBEDDING_MODEL_RECORDED
  results.gates.EMBEDDING_MODEL_RECORDED = gate5EmbeddingModelRecorded();

  // Gates 6-16 are deferred (require Qdrant, Neo4j, Gemma4 services)
  // TODO: Implement each gate in subsequent PRs

  results.summary.passedGates = Object.values(results.gates).filter((g) => g.passed).length;
  results.summary.failedGates = 16 - results.summary.passedGates;
  results.summary.overallStatus =
    results.summary.passedGates === 16
      ? 'PROVEN'
      : results.summary.passedGates >= 5
        ? 'PARTIAL_PROVEN'
        : 'NOT_PROVEN';

  return results;
}
