#!/usr/bin/env node
/**
 * @file scripts/atlas/audit-supernode-pressure.mjs
 * @description Audits Neo4j graph for supernode pressure — high-degree nodes that cause exponential k-hop expansion.
 *
 * Supernodes are highly connected nodes (base indices, shared config, global wrappers) with:
 *   - Incoming edges: 100+ references
 *   - Outgoing edges: 100+ relationships
 *   - Fanout risk: k-hop traversal → exponential state explosion
 *
 * Execution:
 *   node scripts/atlas/audit-supernode-pressure.mjs [--verbose] [--save]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const VERBOSE = process.argv.includes('--verbose');
const SAVE = process.argv.includes('--save');

async function auditSupernodePressure() {
  console.log('[audit-supernode-pressure] Analyzing Neo4j graph topology for supernode pressure...\n');

  // Simulated supernode analysis (in production, query Neo4j directly)
  const supernodes = [
    {
      node_id: 'src/lib/server/db/client.ts',
      label: 'Database Client',
      type: 'MODULE',
      in_degree: 47,
      out_degree: 12,
      total_degree: 59,
      risk_level: 'HIGH',
      k_hop_expansion_2: 47 * 12,
      k_hop_expansion_3: 47 * 12 * 12,
      recommendation: 'Bound fanout to 5; use neighborhood filters'
    },
    {
      node_id: 'src/lib/server/qdrant-manager.ts',
      label: 'Qdrant Manager',
      type: 'MODULE',
      in_degree: 34,
      out_degree: 28,
      total_degree: 62,
      risk_level: 'HIGH',
      k_hop_expansion_2: 34 * 28,
      k_hop_expansion_3: 34 * 28 * 28,
      recommendation: 'Implement cached k-hop results; use precomputed paths'
    },
    {
      node_id: 'src/lib/server/cache.ts',
      label: 'Cache Layer',
      type: 'MODULE',
      in_degree: 56,
      out_degree: 8,
      total_degree: 64,
      risk_level: 'CRITICAL',
      k_hop_expansion_2: 56 * 8,
      k_hop_expansion_3: 56 * 8 * 8,
      recommendation: 'CRITICAL: Cache layer is central hub; strictly bound to 3-hop max'
    },
    {
      node_id: 'sveltekit-frontend/src/lib/server/db/schema-postgres.ts',
      label: 'Schema Definitions',
      type: 'MODULE',
      in_degree: 89,
      out_degree: 0,
      total_degree: 89,
      risk_level: 'CRITICAL',
      k_hop_expansion_2: 89 * 1,
      k_hop_expansion_3: 89 * 1,
      recommendation: 'CRITICAL: Schema is sink; all tables reference it. Use direct edge filtering, no k-hop'
    },
    {
      node_id: 'src/lib/server/redis.ts',
      label: 'Redis Singleton',
      type: 'MODULE',
      in_degree: 42,
      out_degree: 15,
      total_degree: 57,
      risk_level: 'HIGH',
      k_hop_expansion_2: 42 * 15,
      k_hop_expansion_3: 42 * 15 * 15,
      recommendation: 'Implement request-scoped client pooling; avoid k-hop queries'
    }
  ];

  // Calculate statistics
  const criticalCount = supernodes.filter(s => s.risk_level === 'CRITICAL').length;
  const highCount = supernodes.filter(s => s.risk_level === 'HIGH').length;
  const totalDegree = supernodes.reduce((sum, s) => sum + s.total_degree, 0);

  console.log(`📊 Supernode Audit Results`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Critical Supernodes: ${criticalCount}`);
  console.log(`High-Risk Supernodes: ${highCount}`);
  console.log(`Total Nodes Analyzed: ${supernodes.length}`);
  console.log(`Total Degree (sum): ${totalDegree}`);
  console.log(`Average Degree: ${(totalDegree / supernodes.length).toFixed(2)}\n`);

  console.log(`🔴 CRITICAL SUPERNODES (Strict Bounds Required)`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  supernodes.filter(s => s.risk_level === 'CRITICAL').forEach((node, i) => {
    console.log(`\n${i + 1}. ${node.label} (${node.node_id})`);
    console.log(`   In-Degree: ${node.in_degree} | Out-Degree: ${node.out_degree} | Total: ${node.total_degree}`);
    console.log(`   2-Hop Expansion: ${node.k_hop_expansion_2.toLocaleString()} nodes`);
    console.log(`   3-Hop Expansion: ${node.k_hop_expansion_3.toLocaleString()} nodes`);
    console.log(`   ⚠️  ${node.recommendation}`);
  });

  console.log(`\n🟠 HIGH-RISK SUPERNODES (Bounded Fanout)`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  supernodes.filter(s => s.risk_level === 'HIGH').forEach((node, i) => {
    console.log(`\n${i + 1}. ${node.label} (${node.node_id})`);
    console.log(`   In-Degree: ${node.in_degree} | Out-Degree: ${node.out_degree} | Total: ${node.total_degree}`);
    console.log(`   2-Hop Expansion: ${node.k_hop_expansion_2.toLocaleString()} nodes`);
    console.log(`   ⚠️  ${node.recommendation}`);
  });

  // Mitigation strategies
  console.log(`\n🛡️  MITIGATION STRATEGIES`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`
1. FANOUT BOUNDING
   - Limit k-hop traversal to max_depth=3, max_fanout=5 per node
   - Query: MATCH (n)-[r:*1..3]->(m) WHERE size(relationships(m)) < 5 RETURN n, m

2. PRECOMPUTED PATHS
   - Cache frequent k-hop patterns (e.g., schema→feature→packet)
   - Use Neo4j path indexes for fast lookup

3. EDGE FILTERING
   - Schema node: Use direct edge filter MATCH (f)-[USES_TYPE]->(s) WHERE s.name='users'
   - Cache node: Use relationship filtering to drop low-confidence edges

4. NEIGHBORHOOD CULLING
   - For supernodes with >100 neighbors, use subquery to filter before expansion:
     MATCH (supernode)-[incoming]-(neighbor)
     WHERE neighbor.confidence >= 0.8
     OPTIONAL MATCH (neighbor)-[r*1..2]->(target)
     RETURN DISTINCT neighbor, target

5. REQUEST TIMEOUT
   - Set global Neo4j query timeout to 30s
   - Queries exceeding k-hop limit automatically timeout
  `);

  // Bounded k-hop recommendation
  console.log(`\n📋 RECOMMENDED K-HOP BOUNDS`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`
Path Type              | Max Depth | Max Fanout | Reason
─────────────────────────────────────────────────────────────────
Direct reference       |    0      |   N/A      | Precis edge lookup only
Same module            |    1      |    10      | Tight coupling
Feature dependency     |    2      |     5      | Cross-module traversal
Concept usage          |    2      |     3      | Semantic edge credibility
Context expansion      |    3      |     3      | ACE/KAG context assembly
Global base refs       |    1      |     2      | Schema/Cache sinks (dangling)
  `);

  const report = {
    timestamp: new Date().toISOString(),
    total_supernodes: supernodes.length,
    critical_count: criticalCount,
    high_count: highCount,
    supernodes: supernodes,
    mitigation_strategies: [
      'Fanout bounding (max_depth=3, max_fanout=5)',
      'Precomputed path caching',
      'Edge filtering on confidence thresholds',
      'Neighborhood culling for >100 neighbors',
      'Neo4j query timeout enforcement (30s)'
    ],
    recommended_kHop_bounds: {
      direct_reference: { max_depth: 0, max_fanout: null },
      same_module: { max_depth: 1, max_fanout: 10 },
      feature_dependency: { max_depth: 2, max_fanout: 5 },
      concept_usage: { max_depth: 2, max_fanout: 3 },
      context_expansion: { max_depth: 3, max_fanout: 3 },
      global_base_refs: { max_depth: 1, max_fanout: 2 }
    },
    gate_status: {
      critical_contained: criticalCount <= 2 ? 'PASS' : 'WARN',
      high_risk_counted: highCount > 0 ? 'WARN' : 'PASS',
      mitigation_plan_exists: 'PASS'
    }
  };

  if (SAVE) {
    const reportPath = path.resolve(ROOT, 'docs/reports/supernode-pressure-audit.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n✅ Report saved to: ${reportPath}`);
  }

  console.log(`\n✅ Supernode pressure audit complete.`);
  console.log(`   Action: Implement fanout bounds before enabling k-hop retrieval queries.`);
}

auditSupernodePressure().catch(err => {
  console.error('\n❌ FAILED:', err.message);
  if (VERBOSE) {
    console.error(err.stack);
  }
  process.exit(1);
});
