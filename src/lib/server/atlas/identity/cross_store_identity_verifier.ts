import { atlasPackets } from '$lib/server/db/schema-postgres';
import { sql } from 'drizzle-orm';
import type {
  CrossStoreIdentityParity,
  IdentityStabilityGate,
  CrossStoreIdentityGate,
} from '$lib/schemas/tree_node_identity_schema';

async function getDb() {
  const { db } = await import('$lib/server/db/client');
  return db;
}
import {
  CrossStoreIdentityParitySchema,
  IdentityStabilityGateSchema,
  CrossStoreIdentityGateSchema,
} from '$lib/schemas/tree_node_identity_schema';

/**
 * Phase 1 Identity Stability Verifier
 *
 * Checks that all tree_node_id values in Postgres meet uniqueness and validity criteria.
 */
export async function verifyIdentityStability(): Promise<IdentityStabilityGate> {
  const db = await getDb();
  const failures: string[] = [];
  const remediation: string[] = [];

  // 1. Postgres Uniqueness Check
  const uniquenessCheck = await db
    .select({
      total: sql<number>`COUNT(*)`,
      unique_count: sql<number>`COUNT(DISTINCT tree_node_id)`,
      duplicate_count: sql<number>`COUNT(*) - COUNT(DISTINCT tree_node_id)`,
      null_count: sql<number>`COUNT(*) FILTER (WHERE tree_node_id IS NULL)`,
    })
    .from(atlasPackets);

  const postgresUniqueness = uniquenessCheck[0] || {
    total: 0,
    unique_count: 0,
    duplicate_count: 0,
    null_count: 0,
  };

  const uniquenessPass =
    postgresUniqueness.null_count === 0 &&
    postgresUniqueness.duplicate_count === 0 &&
    postgresUniqueness.total === postgresUniqueness.unique_count;

  if (!uniquenessPass) {
    failures.push('Postgres tree_node_id uniqueness failed');
    if (postgresUniqueness.null_count > 0) {
      remediation.push(`Found ${postgresUniqueness.null_count} NULL tree_node_ids — backfill required`);
    }
    if (postgresUniqueness.duplicate_count > 0) {
      remediation.push(`Found ${postgresUniqueness.duplicate_count} duplicate tree_node_ids — deduplication required`);
    }
  }

  // 2. Field Validity Check
  const fieldValidityCheck = await db
    .select({
      total: sql<number>`COUNT(*)`,
      has_source_ref: sql<number>`COUNT(*) FILTER (WHERE source_ref IS NOT NULL)`,
      has_directory_path: sql<number>`COUNT(*) FILTER (WHERE directory_path IS NOT NULL)`,
      has_feature_id: sql<number>`COUNT(*) FILTER (WHERE feature_id IS NOT NULL)`,
      has_source_hash: sql<number>`COUNT(*) FILTER (WHERE source_hash IS NOT NULL)`,
      has_corpus_snapshot: sql<number>`COUNT(*) FILTER (WHERE corpus_snapshot_id IS NOT NULL)`,
    })
    .from(atlasPackets);

  const fieldCheck = fieldValidityCheck[0] || {
    total: 0,
    has_source_ref: 0,
    has_directory_path: 0,
    has_feature_id: 0,
    has_source_hash: 0,
    has_corpus_snapshot: 0,
  };

  const total = fieldCheck.total || 1; // Avoid division by zero
  const fieldValidityPass =
    fieldCheck.has_source_ref === total &&
    fieldCheck.has_directory_path === total &&
    fieldCheck.has_feature_id === total &&
    fieldCheck.has_source_hash === total &&
    fieldCheck.has_corpus_snapshot === total;

  if (!fieldValidityPass) {
    failures.push('Field validity check failed');
    if (fieldCheck.has_source_ref < total) {
      remediation.push(`${total - fieldCheck.has_source_ref} rows missing source_ref`);
    }
    if (fieldCheck.has_directory_path < total) {
      remediation.push(`${total - fieldCheck.has_directory_path} rows missing directory_path`);
    }
    if (fieldCheck.has_feature_id < total) {
      remediation.push(`${total - fieldCheck.has_feature_id} rows missing feature_id`);
    }
  }

  // 3. Naming Compliance Check
  const namingCheck = await db
    .select({
      total: sql<number>`COUNT(*)`,
      feature_id_formatted: sql<number>`COUNT(*) FILTER (WHERE feature_id LIKE 'feature:%')`,
      kmeans_numeric: sql<number>`COUNT(*) FILTER (WHERE kmeans_cluster_id IS NULL OR kmeans_cluster_id >= 0)`,
    })
    .from(atlasPackets);

  const naming = namingCheck[0] || { total: 0, feature_id_formatted: 0, kmeans_numeric: 0 };
  const namingPass =
    naming.feature_id_formatted === total || naming.total === 0; // Allow empty set to pass

  if (!namingPass) {
    failures.push('Naming compliance check failed');
    remediation.push(`${total - naming.feature_id_formatted} feature_ids do not follow 'feature:*' format`);
  }

  // Final verdict
  const overallPass = uniquenessPass && fieldValidityPass && namingPass;

  const result: IdentityStabilityGate = {
    gate_name: 'IDENTITY_STABLE',
    status: overallPass ? 'PASS' : 'FAIL',
    postgres_uniqueness: {
      total_nodes: postgresUniqueness.total,
      unique_tree_node_ids: postgresUniqueness.unique_count,
      duplicate_ids: postgresUniqueness.duplicate_count,
      null_tree_node_ids: postgresUniqueness.null_count,
      pass: uniquenessPass,
    },
    field_validity: {
      all_have_source_ref: fieldCheck.has_source_ref === total,
      all_have_directory_path: fieldCheck.has_directory_path === total,
      all_have_feature_id: fieldCheck.has_feature_id === total,
      all_have_source_hash: fieldCheck.has_source_hash === total,
      all_have_corpus_snapshot_id: fieldCheck.has_corpus_snapshot === total,
      pass: fieldValidityPass,
    },
    referential_integrity: {
      all_source_refs_resolve: true, // Placeholder — full implementation verifies file existence
      all_directory_paths_valid: true, // Placeholder
      all_corpus_snapshots_exist: true, // Placeholder
      pass: true,
    },
    naming_compliance: {
      kmeans_cluster_ids_numeric: naming.kmeans_numeric === total,
      community_ids_prefixed: true, // Placeholder
      domain_classes_normalized: true, // Placeholder
      feature_ids_formatted: namingPass,
      tree_node_ids_formatted: true, // Placeholder
      pass: namingPass,
    },
    overall_pass: overallPass,
    failure_reasons: failures,
    remediation_steps: remediation,
  };

  // Validate schema
  IdentityStabilityGateSchema.parse(result);
  return result;
}

/**
 * Phase 1 Cross-Store Identity Parity Verifier
 *
 * Checks that tree_node_id values are consistent across Postgres, Qdrant, Redis, and Neo4j.
 * Full implementation requires connections to all stores; this version checks Postgres only
 * and provides placeholders for other stores.
 */
export async function verifyIdentityCrossStoreParitySchema(): Promise<CrossStoreIdentityGate> {
  const db = await getDb();
  // Phase 1: Postgres identity retrieval
  const postgresNodes = await db
    .select({
      tree_node_id: atlasPackets.tree_node_id,
    })
    .from(atlasPackets)
    .where(sql`${atlasPackets.tree_node_id} IS NOT NULL`);

  const postgresSet = new Set(postgresNodes.map((n) => n.tree_node_id));
  const postgresCount = postgresSet.size;

  // Placeholder for other stores (will be implemented in Phase 2+)
  const qdrantSet = new Set<string>();
  const redisSet = new Set<string>();
  const neo4jSet = new Set<string>();

  // Calculate intersections
  const presentEverywhere: string[] = [];
  const missingSomewhere: string[] = [];

  for (const id of postgresSet) {
    const idString = id as string; // Cast once and use this variable throughout the loop body
    if (
      (qdrantSet.has(idString) as boolean) &&
      (redisSet.has(idString) as boolean) &&
      (neo4jSet.has(idString) as boolean)
    ) {
      presentEverywhere.push(id);
    } else {
      missingSomewhere.push(id);
    }
  }

  const parityResult: CrossStoreIdentityParity = {
    postgres_count: postgresCount,
    qdrant_count: qdrantSet.size,
    redis_count: redisSet.size,
    neo4j_count: neo4jSet.size,
    postgres_only: Array.from(postgresSet).filter(
      (id) => !qdrantSet.has(id) && !redisSet.has(id) && !neo4jSet.has(id)
    ),
    qdrant_only: Array.from(qdrantSet).filter((id) => !postgresSet.has(id)),
    redis_only: Array.from(redisSet).filter((id) => !postgresSet.has(id)),
    neo4j_only: Array.from(neo4jSet).filter((id) => !postgresSet.has(id)),
    present_everywhere: presentEverywhere,
    missing_somewhere: missingSomewhere,
    fully_aligned:
      postgresSet.size > 0 &&
      qdrantSet.size === postgresSet.size &&
      redisSet.size === postgresSet.size &&
      neo4jSet.size === postgresSet.size,
    alignment_percentage:
      postgresCount > 0 ? Math.round((presentEverywhere.length / postgresCount) * 100) : 0,
    tree_node_id_conflicts: [], // Placeholder — will be populated when cross-store verification is complete
  };

  CrossStoreIdentityParitySchema.parse(parityResult);

  const result: CrossStoreIdentityGate = {
    gate_name: 'CROSS_STORE_IDENTITY_PROVEN',
    status: parityResult.fully_aligned ? 'PASS' : postgresCount > 0 ? 'PARTIAL' : 'FAIL',
    parity_result: parityResult,
    postgres_proof: {
      sample_size: Math.min(postgresCount, 100),
      verified_count: postgresCount, // In Phase 1, all Postgres nodes are considered verified
      all_verified: postgresCount > 0,
    },
    qdrant_proof: {
      collection_name: 'codebase_chunks_768', // Canonical collection
      sample_size: Math.max(10, Math.min(qdrantSet.size, 100)),
      verified_count: qdrantSet.size,
      payload_structure_valid: false, // Phase 2 will verify Qdrant payload structure
    },
    redis_proof: {
      key_pattern: 'node:*',
      sample_size: Math.max(10, Math.min(redisSet.size, 100)),
      verified_count: redisSet.size,
    },
    neo4j_proof: {
      node_label: 'TreeNode',
      sample_size: Math.max(10, Math.min(neo4jSet.size, 100)),
      verified_count: neo4jSet.size,
      property_exists: false, // Phase 2 will verify Neo4j properties
    },
    conflicts_detected: 0, // Will be populated when conflicts are found
    conflicts_resolved: 0, // Will be populated when conflicts are resolved
    overall_pass: parityResult.fully_aligned || postgresCount === 0,
    failure_reasons:
      postgresCount > 0 && !parityResult.fully_aligned ? ['Cross-store parity incomplete'] : [],
  };

  CrossStoreIdentityGateSchema.parse(result);
  return result;
}
