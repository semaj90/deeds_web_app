/**
 * Cross-Store Identity Parity Verifier
 *
 * Phase 1: Postgres-only validation
 * Phase 2+: Qdrant, Neo4j, Redis connections required
 *
 * Validates that packet_key, source_ref, content_hash are consistent across stores.
 */

import { db } from '$lib/server/db/client.js';
import { atlasPackets } from '$lib/server/db/schema-postgres.js';
import { sql } from 'drizzle-orm';

export interface CrossStoreIdentityResult {
  gate_name: string;
  status: 'NOT_EXECUTED' | 'PASS' | 'FAIL';
  overall_pass: boolean;
  parity_result: {
    postgres_count: number;
    qdrant_count: number;
    neo4j_count: number;
    redis_count: number;
    matches: number;
    missing_somewhere: string[];
  };
  qdrant_proof: {
    checked: boolean;
    verified_count: number;
    errors: string[];
  };
  neo4j_proof: {
    checked: boolean;
    verified_count: number;
    errors: string[];
  };
  redis_proof: {
    checked: boolean;
    verified_count: number;
    errors: string[];
  };
  failure_reasons: string[];
}

export async function verifyIdentityCrossStoreParitySchema(): Promise<CrossStoreIdentityResult> {
  const result: CrossStoreIdentityResult = {
    gate_name: 'ATLAS_CROSS_STORE_IDENTITY_PROVEN',
    status: 'NOT_EXECUTED',
    overall_pass: false,
    parity_result: {
      postgres_count: 0,
      qdrant_count: 0,
      neo4j_count: 0,
      redis_count: 0,
      matches: 0,
      missing_somewhere: [],
    },
    qdrant_proof: {
      checked: false,
      verified_count: 0,
      errors: [],
    },
    neo4j_proof: {
      checked: false,
      verified_count: 0,
      errors: [],
    },
    redis_proof: {
      checked: false,
      verified_count: 0,
      errors: [],
    },
    failure_reasons: [],
  };

  try {
    // Phase 1: Postgres validation
    console.log('[Phase 1] Validating Postgres packet identity...');

    // Count 1: Total Postgres packets
    const postgresRows = await db
      .select({
        packet_key: atlasPackets.packetKey,
        source_ref: atlasPackets.sourceRef,
        feature_id: atlasPackets.featureId,
        content_hash: sql<string>`encode(digest(${atlasPackets.summary}::text, 'sha256'), 'hex')`,
      })
      .from(atlasPackets)
      .where(sql`${atlasPackets.packetKey} IS NOT NULL`)
      .limit(100000);

    result.parity_result.postgres_count = postgresRows.length;
    console.log(`[Phase 1] Found ${postgresRows.length} Postgres packets with packet_key`);

    if (postgresRows.length === 0) {
      result.failure_reasons.push('No packets with packet_key found in Postgres');
      return result;
    }

    // Phase 2+: Qdrant validation (deferred)
    console.log('[Phase 2+] Qdrant validation deferred (requires active connection)');
    result.qdrant_proof.errors.push('Qdrant connection validation deferred to Phase 2');

    // Phase 2+: Neo4j validation (deferred)
    console.log('[Phase 2+] Neo4j validation deferred (requires active connection)');
    result.neo4j_proof.errors.push('Neo4j connection validation deferred to Phase 2');

    // Phase 2+: Redis validation (deferred)
    console.log('[Phase 2+] Redis validation deferred (requires active connection)');
    result.redis_proof.errors.push('Redis connection validation deferred to Phase 2');

    // Summary
    result.parity_result.matches = postgresRows.length;
    result.parity_result.missing_somewhere = [];
    result.status = 'NOT_EXECUTED';

    console.log('\n[Gate Status] ATLAS_CROSS_STORE_IDENTITY_PROVEN');
    console.log(`  Postgres packets: ${result.parity_result.postgres_count}`);
    console.log(`  Qdrant validation: DEFERRED (Phase 2+)`);
    console.log(`  Neo4j validation: DEFERRED (Phase 2+)`);
    console.log(`  Redis validation: DEFERRED (Phase 2+)`);
    console.log(`\n[Recommendation] Run Phase 2 gate when Qdrant, Neo4j, Redis are available:`);
    console.log(`  1. Fetch ${result.parity_result.postgres_count} Qdrant points by packet_key payload`);
    console.log(`  2. Verify source_ref and content_hash match Postgres rows`);
    console.log(`  3. Validate Neo4j nodes resolve to same packet_key tree_node_id`);
    console.log(`  4. Check Redis centroid cache alignment`);
    console.log(`\nPass criterion: ≥95% match across all five counts`);

    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    result.failure_reasons.push(`Phase 1 validation failed: ${errorMsg}`);
    result.status = 'FAIL';
    return result;
  }
}
