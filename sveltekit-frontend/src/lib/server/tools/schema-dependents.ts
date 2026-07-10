/**
 * Schema Dependency Intelligence Tool
 *
 * Wires: Table name → Neo4j USES_DB edges → dependent files/functions
 * → packet_key/source_ref joins → ACE context packet → migration/risk report
 *
 * Responsibility:
 * - Neo4j queries return source_ref, operation, line_num, type
 * - Postgres lookups return canonical packet_key and feature metadata
 * - No embedding or vector operations (CPU work only)
 * - ACE context packaging is separate concern
 */

import { z } from 'zod';

// Schemas
export const FindSchemaDependentsInputSchema = z.object({
  table: z.string().min(1).describe('Table name (e.g., "users")'),
  includeAce: z.boolean().default(true).describe('Include ACE context packet')
});

export type FindSchemaDependentsInput = z.infer<typeof FindSchemaDependentsInputSchema>;

export const SchemaDependent = z.object({
  source_ref: z.string().describe('File path (e.g., src/lib/server/auth.ts)'),
  operation: z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE']).describe('SQL operation type'),
  line_num: z.number().nullable().describe('Line number in source file'),
  packet_key: z.string().nullable().describe('Canonical packet_key from atlas_packets'),
  feature_id: z.string().nullable().describe('Feature identifier'),
  feature_label: z.string().nullable().describe('Human-readable feature name'),
  tree_node_id: z.string().nullable().describe('Tree node identifier'),
  risk: z.enum(['low', 'medium', 'high']).describe('Risk level for schema change')
});

export type SchemaDependent = z.infer<typeof SchemaDependent>;

export const FindSchemaDependentsResponse = z.object({
  table: z.string(),
  dependents: z.array(SchemaDependent),
  summary: z.object({
    total: z.number(),
    reads: z.number(),
    writes: z.number(),
    deletes: z.number(),
    high_risk_count: z.number()
  }),
  ace_context: z.boolean().describe('Whether ACE context packet was built'),
  migration_risk: z.string().describe('Migration risk assessment')
});

export type FindSchemaDependentsResponse = z.infer<typeof FindSchemaDependentsResponse>;

/**
 * Classify risk level based on operation and file characteristics
 */
function classifyRisk(operation: string, sourceRef: string): 'low' | 'medium' | 'high' {
  // High risk: writes in auth/critical paths
  if ((operation === 'INSERT' || operation === 'UPDATE' || operation === 'DELETE') &&
      (sourceRef.includes('auth') || sourceRef.includes('security') || sourceRef.includes('payment'))) {
    return 'high';
  }
  // Medium risk: any write operation
  if (operation === 'INSERT' || operation === 'UPDATE' || operation === 'DELETE') {
    return 'medium';
  }
  // Low risk: reads
  return 'low';
}

/**
 * Find schema dependents: table → Neo4j USES_DB edges → dependent files
 * 
 * This is the core data dependency intelligence. Returns file-level impacts
 * for schema migration planning and risk assessment.
 */
export async function findSchemaDependents(
  input: FindSchemaDependentsInput,
  deps: {
    neo4j?: any;
    postgres?: any;
  }
): Promise<FindSchemaDependentsResponse> {
  const { table, includeAce } = input;

  if (!deps.neo4j || !deps.postgres) {
    throw new Error('Neo4j and Postgres dependencies required');
  }

  // Step 1: Query Neo4j for USES_DB edges
  const neoQuery = `
    MATCH (f:CodebaseFile)-[r:USES_DB]->(t:Table {name: $table})
    RETURN f.path AS source_ref,
           r.operation AS operation,
           r.line_num AS line_num,
           r.type AS type
    ORDER BY r.operation DESC, f.path ASC
  `;

  let neoResults: any[] = [];
  try {
    const session = deps.neo4j.session?.();
    const result = await session?.run(neoQuery, { table });
    neoResults = result?.records?.map((r: any) => ({
      source_ref: r.get('source_ref'),
      operation: r.get('operation'),
      line_num: r.get('line_num'),
      type: r.get('type')
    })) || [];
    await session?.close?.();
  } catch (error) {
    console.warn(`Neo4j query failed for table ${table}:`, error);
    // Non-blocking: fall through with empty results
  }

  // Step 2: Join to Postgres atlas_packets for canonical metadata
  const dependents: SchemaDependent[] = [];
  const seenSourceRefs = new Set<string>();

  for (const neoRow of neoResults) {
    if (seenSourceRefs.has(neoRow.source_ref)) continue;
    seenSourceRefs.add(neoRow.source_ref);

    let packetKey = null;
    let featureId = null;
    let featureLabel = null;
    let treeNodeId = null;

    try {
      const pgResult = await deps.postgres?.query(
        `SELECT packet_key, feature_id, feature_label, tree_node_id
         FROM atlas_packets
         WHERE canonical_source_ref = $1 OR source_ref = $1
         LIMIT 1`,
        [neoRow.source_ref]
      );

      if (pgResult?.rows?.[0]) {
        const row = pgResult.rows[0];
        packetKey = row.packet_key;
        featureId = row.feature_id;
        featureLabel = row.feature_label;
        treeNodeId = row.tree_node_id;
      }
    } catch (error) {
      console.warn(`Postgres lookup failed for ${neoRow.source_ref}:`, error);
      // Non-blocking: continue without packet metadata
    }

    const risk = classifyRisk(neoRow.operation, neoRow.source_ref);

    dependents.push({
      source_ref: neoRow.source_ref,
      operation: neoRow.operation,
      line_num: neoRow.line_num,
      packet_key: packetKey,
      feature_id: featureId,
      feature_label: featureLabel,
      tree_node_id: treeNodeId,
      risk
    });
  }

  // Step 3: Build summary and risk assessment
  const summary = {
    total: dependents.length,
    reads: dependents.filter(d => d.operation === 'SELECT').length,
    writes: dependents.filter(d => d.operation === 'INSERT' || d.operation === 'UPDATE').length,
    deletes: dependents.filter(d => d.operation === 'DELETE').length,
    high_risk_count: dependents.filter(d => d.risk === 'high').length
  };

  let migrationRisk = 'low';
  if (summary.high_risk_count > 0) {
    migrationRisk = 'high';
  } else if (summary.writes > 2) {
    migrationRisk = 'medium';
  }

  return {
    table,
    dependents,
    summary,
    ace_context: includeAce,
    migration_risk: migrationRisk
  };
}
