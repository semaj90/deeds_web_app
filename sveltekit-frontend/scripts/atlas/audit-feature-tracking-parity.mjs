#!/usr/bin/env node
/**
 * Feature-Tracking Parity Audit
 *
 * Scans the codebase to verify that all packet retrieval/mirror/enrichment operations
 * preserve the canonical identity chain:
 *
 *   source_ref → feature_id → packet_key → qdrant_point_id → centroid_id → som_cluster → neo4j_node_id → redis_key
 *
 * Ranks files by role:
 * 1. Creates identity fields
 * 2. Preserves identity fields (retrieval/search)
 * 3. Enriches identity fields (adds metadata)
 * 4. Mirrors identity fields (syncs across stores)
 * 5. Drops or mutates identity fields incorrectly (RISK)
 *
 * Usage:
 *   node scripts/atlas/audit-feature-tracking-parity.mjs [--verbose] [--report-only]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const verboseMode = process.argv.includes('--verbose');
const reportOnly = process.argv.includes('--report-only');

// Identity fields to track
const IDENTITY_FIELDS = {
  source_ref: ['source_ref', 'sourceRef', 'source-ref'],
  feature_id: ['feature_id', 'featureId', 'feature-id'],
  packet_key: ['packet_key', 'packetKey', 'packet-key', 'key'],
  qdrant_point_id: ['qdrant_point_id', 'qdrantPointId', 'pointId'],
  centroid_id: ['centroid_id', 'centroidId', 'centroid'],
  som_cluster: ['som_cluster', 'somCluster', 'topologyCluster', 'cluster'],
  neo4j_node_id: ['neo4j_node_id', 'nodeId', 'node_id'],
  redis_key: ['redis_key', 'cacheKey', 'bitfrost:', 'ff1:'],
};

// File patterns to scan
const SCAN_PATTERNS = [
  'scripts/atlas/*.mjs',
  'scripts/atlas/*.mts',
  'src/lib/server/retrieval/*.ts',
  'src/lib/server/search/*.ts',
  'src/lib/server/db/*.ts',
  'src/lib/server/ace/*.ts',
  'packages/atlas-core/src/**/*.ts',
  'packages/parent-atlas*/src/**/*.ts',
];

// File role classifications
const FILE_ROLES = {
  CREATES: 'Creates identity fields',
  PRESERVES: 'Preserves identity (retrieval)',
  ENRICHES: 'Enriches identity (adds metadata)',
  MIRRORS: 'Mirrors across stores',
  RISKS: 'RISK: Drops/mutates identity incorrectly',
};

/**
 * Parse a file and extract identity field usage
 */
function analyzeFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    const analysis = {
      filePath,
      role: null,
      identityFields: new Set(),
      queries: [],
      operations: [],
      risks: [],
      preservationScore: 0, // 0-100
    };

    // Detect file role
    const fileName = path.basename(filePath).toLowerCase();
    const fileContent = content.toLowerCase();

    if (fileName.includes('create') || fileName.includes('insert') || fileName.includes('init')) {
      analysis.role = 'CREATES';
    } else if (fileName.includes('retrieve') || fileName.includes('search') || fileName.includes('fetch') || fileName.includes('query')) {
      analysis.role = 'PRESERVES';
    } else if (fileName.includes('enrich') || fileName.includes('extend') || fileName.includes('augment')) {
      analysis.role = 'ENRICHES';
    } else if (fileName.includes('mirror') || fileName.includes('sync') || fileName.includes('replicate')) {
      analysis.role = 'MIRRORS';
    } else if (fileContent.includes('qdrant') || fileContent.includes('neo4j') || fileContent.includes('postgres') || fileContent.includes('redis')) {
      // Classify by operations found
      if (fileContent.includes('delete') || fileContent.includes('drop') || fileContent.includes('remove')) {
        analysis.role = 'RISKS';
      } else {
        analysis.role = 'PRESERVES';
      }
    }

    // Extract identity field usage
    Object.entries(IDENTITY_FIELDS).forEach(([fieldName, variants]) => {
      variants.forEach(variant => {
        const pattern = new RegExp(`\\b${variant}\\b`, 'gi');
        const matches = content.match(pattern);
        if (matches) {
          analysis.identityFields.add(fieldName);
        }
      });
    });

    // Check for SQL operations
    const sqlPatterns = [
      { pattern: /SELECT\s+.*?FROM\s+(\w+)/gi, op: 'SELECT' },
      { pattern: /INSERT\s+INTO\s+(\w+)/gi, op: 'INSERT' },
      { pattern: /UPDATE\s+(\w+)/gi, op: 'UPDATE' },
      { pattern: /DELETE\s+FROM\s+(\w+)/gi, op: 'DELETE' },
      { pattern: /LEFT\s+JOIN|INNER\s+JOIN|JOIN/gi, op: 'JOIN' },
    ];

    sqlPatterns.forEach(({ pattern, op }) => {
      const matches = content.match(pattern);
      if (matches) {
        analysis.operations.push(op);
      }
    });

    // Check for Qdrant operations
    if (fileContent.includes('qdrant')) {
      if (fileContent.includes('search') || fileContent.includes('query')) {
        analysis.operations.push('QDRANT_SEARCH');
      }
      if (fileContent.includes('upsert') || fileContent.includes('insert')) {
        analysis.operations.push('QDRANT_UPSERT');
      }
    }

    // Check for Neo4j operations
    if (fileContent.includes('neo4j') || fileContent.includes('cypher')) {
      analysis.operations.push('NEO4J_QUERY');
    }

    // Check for Redis operations
    if (fileContent.includes('redis') || fileContent.includes('valkey') || fileContent.includes('cache')) {
      if (fileContent.includes('get') || fileContent.includes('fetch')) {
        analysis.operations.push('REDIS_GET');
      }
      if (fileContent.includes('set') || fileContent.includes('put')) {
        analysis.operations.push('REDIS_SET');
      }
    }

    // Detect risks
    if (fileContent.includes('delete') && !fileContent.includes('cache')) {
      if (!analysis.identityFields.has('packet_key') && !analysis.identityFields.has('source_ref')) {
        analysis.risks.push('DELETE operation without explicit packet_key/source_ref check');
      }
    }

    if (fileContent.includes('drop') && (fileContent.includes('column') || fileContent.includes('table'))) {
      analysis.risks.push('DROP operation detected - verify identity fields are preserved');
    }

    // Check for missing identity chains
    if (fileContent.includes('qdrant') && !analysis.identityFields.has('qdrant_point_id')) {
      analysis.risks.push('Qdrant operation without qdrant_point_id tracking');
    }

    if (fileContent.includes('neo4j') && !analysis.identityFields.has('neo4j_node_id')) {
      analysis.risks.push('Neo4j operation without neo4j_node_id tracking');
    }

    // Calculate preservation score
    const expectedIdentityCount = analysis.role === 'CREATES' ? 1 :
                                  analysis.role === 'MIRRORS' ? 6 :
                                  analysis.role === 'ENRICHES' ? 4 :
                                  analysis.role === 'PRESERVES' ? 4 : 2;

    analysis.preservationScore = Math.min(100, (analysis.identityFields.size / expectedIdentityCount) * 100);

    return analysis;
  } catch (err) {
    return {
      filePath,
      error: err.message,
      role: 'ERROR',
      identityFields: new Set(),
      operations: [],
      risks: [err.message],
      preservationScore: 0,
    };
  }
}

/**
 * Scan files matching patterns
 */
function scanRepository() {
  const results = [];
  const scannedFiles = new Set();

  // Manually scan key files
  const keyFiles = [
    'scripts/atlas/ingest-topology-to-neo4j.mjs',
    'scripts/atlas/backfill-packets-to-qdrant.mjs',
    'scripts/atlas/qdrant-payload-contract-repair.mjs',
    'scripts/atlas/audit-som-identity-cross-store.mjs',
    'src/lib/server/ace/query-router.ts',
    'src/lib/server/ace/context-assembler.ts',
    'src/lib/server/retrieval/rrf-integration.ts',
    'src/lib/server/retrieval/gpu-reranker.ts',
    'src/lib/server/db/schema/packet-metadata-v1.ts',
    'packages/parent-atlas-retrieval/src/turbovec/turbovec-prefilter.ts',
    'packages/atlas-core/src/langgraph/worker.ts',
    'packages/atlas-core/src/packet/identity.ts',
  ];

  for (const file of keyFiles) {
    const fullPath = path.join(repoRoot, file);
    if (fs.existsSync(fullPath)) {
      const analysis = analyzeFile(fullPath);
      results.push(analysis);
      scannedFiles.add(fullPath);
    }
  }

  // Scan for additional files with identity operations
  const atlasScriptsDir = path.join(repoRoot, 'sveltekit-frontend/scripts/atlas');
  if (fs.existsSync(atlasScriptsDir)) {
    const scripts = fs.readdirSync(atlasScriptsDir).filter(f => f.endsWith('.mjs'));
    for (const script of scripts) {
      const fullPath = path.join(atlasScriptsDir, script);
      if (!scannedFiles.has(fullPath)) {
        const analysis = analyzeFile(fullPath);
        if (analysis.identityFields.size > 0 || analysis.operations.length > 0) {
          results.push(analysis);
          scannedFiles.add(fullPath);
        }
      }
    }
  }

  return results;
}

/**
 * Generate audit report
 */
function generateReport(results) {
  // Sort by role and preservation score
  const roleOrder = ['RISKS', 'CREATES', 'MIRRORS', 'ENRICHES', 'PRESERVES'];
  const sorted = results.sort((a, b) => {
    const aRoleIdx = roleOrder.indexOf(a.role?.substring(0, a.role.indexOf(':')) || 'ERROR');
    const bRoleIdx = roleOrder.indexOf(b.role?.substring(0, b.role.indexOf(':')) || 'ERROR');
    if (aRoleIdx !== bRoleIdx) return aRoleIdx - bRoleIdx;
    return b.preservationScore - a.preservationScore;
  });

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalFiles: sorted.length,
      byRole: {},
      highRiskCount: 0,
      identityPreservationRate: 0,
    },
    files: [],
  };

  // Count by role
  sorted.forEach(r => {
    const role = r.role || 'UNKNOWN';
    report.summary.byRole[role] = (report.summary.byRole[role] || 0) + 1;
    if (role === 'RISKS' || r.risks.length > 0) report.summary.highRiskCount++;
  });

  // Calculate preservation rate
  const preservationScores = sorted.filter(r => r.role !== 'ERROR').map(r => r.preservationScore);
  report.summary.identityPreservationRate = preservationScores.length > 0
    ? Math.round(preservationScores.reduce((a, b) => a + b, 0) / preservationScores.length)
    : 0;

  // Add files to report
  sorted.forEach(analysis => {
    report.files.push({
      path: analysis.filePath.replace(repoRoot, '.'),
      role: analysis.role || 'UNKNOWN',
      identityFields: Array.from(analysis.identityFields),
      operations: analysis.operations,
      preservationScore: Math.round(analysis.preservationScore),
      risks: analysis.risks,
    });
  });

  return report;
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Scanning repository for feature-tracking parity...\n');

  const results = scanRepository();
  const report = generateReport(results);

  // Print summary
  console.log('📊 Audit Summary:');
  console.log(`   Total files scanned: ${report.summary.totalFiles}`);
  console.log(`   High-risk files: ${report.summary.highRiskCount}`);
  console.log(`   Preservation rate: ${report.summary.identityPreservationRate}%`);
  console.log(`   By role: ${JSON.stringify(report.summary.byRole)}\n`);

  // Print files by role
  const roleGroups = {};
  report.files.forEach(f => {
    if (!roleGroups[f.role]) roleGroups[f.role] = [];
    roleGroups[f.role].push(f);
  });

  Object.entries(roleGroups).forEach(([role, files]) => {
    console.log(`\n📋 ${role}:`);
    files.forEach(f => {
      const riskIcon = f.risks.length > 0 ? '⚠️  ' : '✅ ';
      const scoreBar = '█'.repeat(Math.round(f.preservationScore / 10)) + '░'.repeat(10 - Math.round(f.preservationScore / 10));
      console.log(`   ${riskIcon}${f.path}`);
      console.log(`      Score: [${scoreBar}] ${f.preservationScore}% | Fields: ${f.identityFields.join(', ')}`);
      if (verboseMode && f.operations.length > 0) {
        console.log(`      Ops: ${f.operations.join(', ')}`);
      }
      if (f.risks.length > 0) {
        f.risks.forEach(risk => console.log(`      ⚠️  Risk: ${risk}`));
      }
    });
  });

  // Write report to file
  const reportPath = path.join(repoRoot, 'docs/reports/feature-tracking-parity-audit.json');
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n✅ Report saved to: ${reportPath.replace(repoRoot, '.')}`);

  return report.summary.highRiskCount === 0 ? 0 : 1;
}

main().then(code => process.exit(code)).catch(err => {
  console.error('❌ Audit failed:', err);
  process.exit(1);
});
