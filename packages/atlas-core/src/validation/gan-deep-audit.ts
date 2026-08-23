/**
 * GAN Deep Audit
 *
 * Comprehensive audit of existing tasks/features/specs for production hardening.
 * Extends GAN validation with token savings analysis and agentic recommendations.
 *
 * Flow:
 * 1. GAN validation (structure, identity, format)
 * 2. Feature registry search (find similar successful patterns)
 * 3. Token savings recommendations (estimate compression potential)
 * 4. Production hardening checks (schema, constraints, dependencies)
 */

import { searchFeatureRegistry, generateTokenSavingsRecommendation, logFeatureRegistryAccess } from '../retrieval/feature-registry-search.js';
import type { GanAuditConfig, GanValidationResult, GanAuditDependencies } from './gan-audit-integration.js';
import type { WorkflowTrace } from './workflow-trace-logger.js';

export interface GanDeepAuditConfig extends GanAuditConfig {
  includeTokenAnalysis?: boolean;
  includeFeatureRecommendations?: boolean;
  includeProductionHardening?: boolean;
}

export interface TokenSavingsAnalysis {
  packet_key: string;
  baseline_tokens: number;
  recommended_tokens: number;
  estimated_savings: number;
  savings_percentage: number;
  recommended_route: string;
  cache_strategy: string;
}

export interface ProductionHardeningIssue {
  type: 'missing_field' | 'invalid_constraint' | 'orphaned_ref' | 'circular_dependency' | 'missing_index';
  severity: 'critical' | 'high' | 'medium' | 'low';
  packet_key: string;
  field?: string;
  description: string;
  remediation: string;
}

export interface GanDeepAuditResult extends GanValidationResult {
  token_analysis?: TokenSavingsAnalysis[];
  total_potential_savings?: number;
  production_hardening_issues?: ProductionHardeningIssue[];
  agentic_recommendations?: string[];
}

/**
 * Execute comprehensive GAN deep audit with token savings and hardening
 */
export async function executeGanDeepAudit(
  config: GanDeepAuditConfig,
  deps?: GanAuditDependencies
): Promise<GanDeepAuditResult> {
  const { executeGanAudit } = await import('./gan-audit-integration.js');

  // Step 1: Standard GAN validation
  const baseResult = await executeGanAudit(config, deps);

  const deepResult: GanDeepAuditResult = {
    ...baseResult,
    token_analysis: [],
    production_hardening_issues: [],
    agentic_recommendations: [],
  };

  // Step 2: Token savings analysis
  if (config.includeTokenAnalysis && deps?.db && deps?.redis) {
    const tokenAnalysis = await analyzeTokenSavings(
      baseResult,
      deps.db,
      deps.redis
    );
    deepResult.token_analysis = tokenAnalysis;
    deepResult.total_potential_savings = tokenAnalysis.reduce(
      (sum, item) => sum + item.estimated_savings,
      0
    );
  }

  // Step 3: Feature recommendations
  if (config.includeFeatureRecommendations && deps?.db && deps?.redis) {
    const recommendations = await generateAgenticRecommendations(
      baseResult,
      deps.db,
      deps.redis
    );
    deepResult.agentic_recommendations = recommendations;
  }

  // Step 4: Production hardening checks
  if (config.includeProductionHardening && deps?.db) {
    const hardteningIssues = await auditProductionHardening(
      baseResult,
      deps.db
    );
    deepResult.production_hardening_issues = hardteningIssues;
  }

  if (config.verbose) {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('GAN Deep Audit Results:');
    if (deepResult.token_analysis && deepResult.token_analysis.length > 0) {
      console.log(
        `  Total Token Savings Potential: ${deepResult.total_potential_savings} tokens`
      );
    }
    if (deepResult.agentic_recommendations && deepResult.agentic_recommendations.length > 0) {
      console.log(`  Agentic Recommendations: ${deepResult.agentic_recommendations.length}`);
    }
    if (
      deepResult.production_hardening_issues &&
      deepResult.production_hardening_issues.length > 0
    ) {
      const critical = deepResult.production_hardening_issues.filter(
        (i) => i.severity === 'critical'
      ).length;
      console.log(
        `  Production Hardening Issues: ${critical} critical, ${deepResult.production_hardening_issues.length} total`
      );
    }
    console.log('═══════════════════════════════════════════════════════\n');
  }

  return deepResult;
}

/**
 * Step 2: Analyze token savings potential for each packet
 */
async function analyzeTokenSavings(
  auditResult: GanValidationResult,
  db: any,
  redis: any
): Promise<TokenSavingsAnalysis[]> {
  const analysis: TokenSavingsAnalysis[] = [];

  try {
    // For each passed packet, search feature registry
    const passedPackets = auditResult.processed - auditResult.hardFailures - auditResult.softWarnings;

    if (passedPackets === 0) return [];

    // Get sample packets from recent audit trace (if available)
    const sampleSize = Math.min(10, passedPackets);

    // Query Postgres for sample packets
    const { sql } = await import('drizzle-orm');
    const packets = await db.execute(sql`
      SELECT packet_key, summary, feature_id
      FROM atlas_packets
      WHERE ganValidated = true
      LIMIT ${sampleSize}
    `);

    const rows = Array.isArray(packets) ? packets : (packets as any).rows ?? [];

    for (const packet of rows) {
      const query = packet.summary || packet.feature_id || '';

      // Search feature registry for similar patterns
      const searchResults = await searchFeatureRegistry(query, db, redis);
      const recommendation = await generateTokenSavingsRecommendation(query, searchResults);

      analysis.push({
        packet_key: packet.packet_key,
        baseline_tokens: recommendation.estimated_total_tokens + recommendation.estimated_saved_tokens,
        recommended_tokens: recommendation.estimated_total_tokens,
        estimated_savings: recommendation.estimated_saved_tokens,
        savings_percentage: recommendation.savings_percentage,
        recommended_route: recommendation.best_route,
        cache_strategy: recommendation.feature_candidates[0]?.feature_spec.cache_strategy || 'none',
      });

      // Log to audit trail
      await logFeatureRegistryAccess(query, recommendation, db).catch(() => {});
    }
  } catch (err) {
    console.warn(`[GAN Deep Audit] Token analysis failed: ${(err as any).message}`);
  }

  return analysis;
}

/**
 * Step 3: Generate agentic recommendations based on audit results
 */
async function generateAgenticRecommendations(
  auditResult: GanValidationResult,
  db: any,
  redis: any
): Promise<string[]> {
  const recommendations: string[] = [];

  try {
    // Recommendation 1: Cache strategy
    if (auditResult.processed > 100 && auditResult.softWarnings > 0) {
      recommendations.push(
        `Enable semantic caching for ${auditResult.softWarnings} packets with soft warnings. ` +
        `Use Bifrost L2 with score_threshold=0.8 to capture 70%+ of similar queries.`
      );
    }

    // Recommendation 2: Batch optimization
    if (auditResult.processed > 1000) {
      recommendations.push(
        `Batch processed ${auditResult.processed} packets. Consider increasing batch size to 500-1000 ` +
        `to reduce I/O overhead while maintaining memory constraints.`
      );
    }

    // Recommendation 3: Hard failure remediation
    if (auditResult.hardFailures > 0) {
      recommendations.push(
        `${auditResult.hardFailures} packets failed hard validation gates. ` +
        `Prioritize fixing missing identity fields (packet_key, source_ref) to unlock ` +
        `semantic search and caching for those packets.`
      );
    }

    // Recommendation 4: Token compression
    const compression_estimate = auditResult.passed > 0
      ? Math.round((auditResult.softWarnings / auditResult.processed) * 100)
      : 0;

    if (compression_estimate > 10) {
      recommendations.push(
        `${compression_estimate}% of packets have missing metadata (summaries, embeddings). ` +
        `Backfill summaries via Gemma4 to enable 4-5x compression before synthesis.`
      );
    }

    // Recommendation 5: Route optimization
    recommendations.push(
      `Review route decisions in 5+ recent successful workflows. ` +
      `Canonical routes: 'rg+postgres+qdrant+rerank' (hybrid), ` +
      `'postgres+validation' (simple), 'cache-only' (L1 hit). ` +
      `Use workflow pattern matching to auto-select optimal route for similar queries.`
    );

    // Recommendation 6: Production hardening
    recommendations.push(
      `Enable prompt caching with system prompt KV reuse across audits. ` +
      `Reuse context from previous successful validations to reduce model inference cost by 10-50x.`
    );
  } catch (err) {
    console.warn(`[GAN Deep Audit] Recommendation generation failed: ${(err as any).message}`);
  }

  return recommendations;
}

/**
 * Step 4: Audit production hardening (schema, constraints, dependencies)
 */
async function auditProductionHardening(
  auditResult: GanValidationResult,
  db: any
): Promise<ProductionHardeningIssue[]> {
  const issues: ProductionHardeningIssue[] = [];

  // Drizzle returns { rows } through the postgres client, while bounded
  // fixtures commonly return the row array directly. Keep the proof adapter
  // shape-tolerant without changing the canonical query or write boundary.
  const rowsOf = (result: unknown): any[] => {
    if (Array.isArray(result)) return result;
    if (result && typeof result === 'object' && Array.isArray((result as any).rows)) {
      return (result as any).rows;
    }
    return [];
  };

  try {
    const { sql } = await import('drizzle-orm');

    // Check 1: Missing indexes on identity columns
    const indexCheck = await db.execute(sql`
      SELECT schemaname, tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = 'atlas_packets'
    `);

    if (rowsOf(indexCheck).length > 0) {
      // Check if critical indexes exist
      const indexList = await db.execute(sql`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'atlas_packets'
      `);

      const indexes = rowsOf(indexList)
        .map((r: any) => r.indexname)
        .filter((indexName: unknown): indexName is string => typeof indexName === 'string');
      const requiredIndexes = ['packet_key_idx', 'source_ref_idx', 'feature_id_idx'];

      for (const requiredIdx of requiredIndexes) {
        if (!indexes.some((idx: string) => idx.includes(requiredIdx))) {
          issues.push({
            type: 'missing_index',
            severity: 'high',
            packet_key: 'atlas_packets',
            field: requiredIdx.replace('_idx', ''),
            description: `Missing B-tree index on ${requiredIdx.replace('_idx', '')}`,
            remediation: `CREATE INDEX IF NOT EXISTS ${requiredIdx} ON atlas_packets(${requiredIdx.replace('_idx', '')});`,
          });
        }
      }
    }

    // Check 2: Orphaned packets (missing Qdrant references)
    const orphanCheck = await db.execute(sql`
      SELECT COUNT(*) as orphan_count
      FROM atlas_packets
      WHERE qdrant_point_id IS NULL
        AND ganValidated = true
        AND created_at > NOW() - INTERVAL '7 days'
    `);

    const orphanCount = rowsOf(orphanCheck)[0]?.orphan_count || 0;
    if (orphanCount > 10) {
      issues.push({
        type: 'orphaned_ref',
        severity: 'medium',
        packet_key: 'atlas_packets',
        description: `${orphanCount} validated packets missing Qdrant vector references`,
        remediation: `Run backfill: npx tsx scripts/atlas/backfill-qdrant-vectors.mts`,
      });
    }

    // Check 3: Constraint violations (ganValidated with NULL warnings)
    const constraintCheck = await db.execute(sql`
      SELECT COUNT(*) as violation_count
      FROM atlas_packets
      WHERE ganValidated = false AND ganWarnings IS NOT NULL
    `);

    const violationCount = rowsOf(constraintCheck)[0]?.violation_count || 0;
    if (violationCount > 0) {
      issues.push({
        type: 'invalid_constraint',
        severity: 'low',
        packet_key: 'atlas_packets',
        description: `${violationCount} packets have ganValidated=false but ganWarnings set (soft failures misclassified)`,
        remediation: `UPDATE atlas_packets SET ganWarnings = NULL WHERE ganValidated = false;`,
      });
    }

    // Check 4: Schema version mismatch
    const schemaVersions = await db.execute(sql`
      SELECT DISTINCT schema_version, COUNT(*) as packet_count
      FROM workflow_traces
      GROUP BY schema_version
    `);

    const versions = rowsOf(schemaVersions);
    if (versions.length > 1) {
      issues.push({
        type: 'invalid_constraint',
        severity: 'medium',
        packet_key: 'workflow_traces',
        description: `Workflow trace schema mismatch: ${versions.map((v: any) => `${v.schema_version} (${v.packet_count})`).join(', ')}`,
        remediation: `Standardize all traces to schema_version='1.0'. Run migration script.`,
      });
    }
  } catch (err) {
    console.warn(`[GAN Deep Audit] Production hardening check failed: ${(err as any).message}`);
  }

  return issues;
}

/**
 * Export for testing
 */
export { analyzeTokenSavings, generateAgenticRecommendations, auditProductionHardening };
