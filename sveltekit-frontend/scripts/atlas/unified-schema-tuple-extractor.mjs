#!/usr/bin/env node
/**
 * Unified Schema/Ontology/Topology Tuple Extractor
 *
 * Purpose:
 *   Centralize regex-based extraction of semantic tuples across the pipeline:
 *   - Schema tuples (type:field, class:method, module:export)
 *   - Ontology tuples (error_class→domain_class→recovery_packet)
 *   - Topology tuples (node→cluster→neighborhood→distance)
 *   - Lexical tuples (noun/verb/engram n-grams)
 *   - Concept tuples (used_concepts, feature_id components, domain tags)
 *
 * Contract:
 *   Input: packet_key, source_ref, feature_id, ast_symbols, domain_class, summary
 *   Output: normalized {schema, ontology, topology, lexical, concept} tuples
 *   Used by: reranking, PyTorch feature engineering, KMeans clustering, Qdrant tagging
 *
 * Output metrics:
 *   tuplesExtracted: total tuples produced
 *   tuplesNormalized: tuples matching canonical ontology
 *   tuplesUnknown: tuples not in ontology (logged for expansion)
 *   coveragePct: packets with ≥1 tuple per category
 *
 * Usage:
 *   npm run atlas:tuples:extract:dry --limit=100
 *   npm run atlas:tuples:extract:apply --limit=10000
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const isVerbose = process.argv.includes('--verbose');
const limit = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? (isDryRun ? '100' : '10000')
);

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  database: 'legal_ai_db',
  user: 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

/**
 * Canonical ontology mapping (error_class → domain_class → recovery route)
 */
const ONTOLOGY_MAP = {
  'IdentityError': { domain: 'identity_resolution', severity: 'CRITICAL', recovery_lane: 'packet_canonicalize' },
  'StructureError': { domain: 'ast_structure', severity: 'HIGH', recovery_lane: 'tree_node_backfill' },
  'SemanticError': { domain: 'semantic_concepts', severity: 'HIGH', recovery_lane: 'langextract_apply' },
  'VectorError': { domain: 'embedding_generation', severity: 'MEDIUM', recovery_lane: 'embedding_generate' },
  'QdrantBridgeError': { domain: 'vector_indexing', severity: 'MEDIUM', recovery_lane: 'qdrant_sync' },
  'TopologyError': { domain: 'graph_topology', severity: 'LOW', recovery_lane: 'gds_apply' },
  'TreePropagationError': { domain: 'tree_structure', severity: 'MEDIUM', recovery_lane: 'tree_propagate' },
  'CachePromotionError': { domain: 'cache_invalidation', severity: 'LOW', recovery_lane: 'cache_invalidate' },
};

/**
 * Schema tuple regex patterns (type:field, class:method, module:export)
 */
const SCHEMA_PATTERNS = [
  /(\w+)\s*:\s*(\w+Type|interface|class)/gi,      // type: InterfaceType
  /class\s+(\w+)\s*{\s*(\w+)\s*\(/gi,             // class Foo { method()
  /export\s+(async\s+)?function\s+(\w+)/gi,       // export function name
  /import\s+{\s*(\w+)\s*}\s+from/gi,              // import { name } from
  /const\s+(\w+)\s*=\s*(\w+)/gi,                  // const x = Type
];

/**
 * Topology tuple regex patterns (node_id→cluster_id, coordinate, distance)
 */
const TOPOLOGY_PATTERNS = [
  /(\w+)→(\w+)/gi,                                // node→cluster
  /cluster[_:](\d+)/gi,                           // cluster_123
  /som[_:](\d+)[_x](\d+)/gi,                      // som_10x20
  /distance[_:]?([\d.]+)/gi,                      // distance_0.5
];

/**
 * Lexical tuple patterns (noun/verb/engram)
 */
const LEXICAL_PATTERNS = {
  noun: /\b(error|packet|feature|domain|node|cluster|vector|embedding|graph|tree|schema|ontology)\b/gi,
  verb: /\b(validate|extract|transform|route|synchronize|backfill|propagate|rerank|cluster)\b/gi,
  engram: /\b\w{3,}\b/g,  // All 3+ letter words
};

/**
 * Extract schema tuples from ast_symbols and source_ref
 */
function extractSchemaTuples(astSymbols, sourceRef) {
  const tuples = [];

  // Parse source_ref (e.g., "src/lib/server/auth.ts" → namespace:path)
  if (sourceRef) {
    const parts = sourceRef.split('/');
    const fileName = parts[parts.length - 1].replace(/\.(ts|js|mjs)$/, '');
    const dir = parts.slice(0, -1).join('.');

    tuples.push({
      type: 'schema_module',
      value: `${dir}:${fileName}`,
      weight: 1.0,
    });
  }

  // Extract schema from ast_symbols
  if (Array.isArray(astSymbols)) {
    astSymbols.forEach(sym => {
      // Pattern: ClassName.methodName or interface.field
      if (sym.includes('.') || sym.includes(':')) {
        tuples.push({
          type: 'schema_path',
          value: sym,
          weight: 0.8,
        });
      }
    });
  }

  return tuples;
}

/**
 * Extract ontology tuples (error_class → domain_class → recovery)
 */
function extractOntologyTuples(errorClass, domainClass) {
  const tuples = [];

  // Use canonical mapping
  if (errorClass && ONTOLOGY_MAP[errorClass]) {
    const mapped = ONTOLOGY_MAP[errorClass];
    tuples.push({
      type: 'ontology_error_domain',
      value: `${errorClass}→${mapped.domain}`,
      weight: 1.0,
      severity: mapped.severity,
      recovery: mapped.recovery_lane,
    });
  }

  // Fallback to provided domain_class
  if (domainClass && !errorClass) {
    tuples.push({
      type: 'ontology_domain',
      value: domainClass,
      weight: 0.7,
    });
  }

  return tuples;
}

/**
 * Extract topology tuples (node→cluster coordinates)
 */
function extractTopologyTuples(packet) {
  const tuples = [];

  // SOM cell coordinates
  if (packet.som_cluster !== undefined) {
    tuples.push({
      type: 'topology_som_cell',
      value: `som_cell_${packet.som_cluster}`,
      weight: 0.9,
      coordinates: {
        cluster: packet.som_cluster,
        row: packet.som_cluster % 20,
        col: Math.floor(packet.som_cluster / 20),
      },
    });
  }

  // Tree node hierarchy
  if (packet.tree_node_id) {
    tuples.push({
      type: 'topology_tree_node',
      value: `tree_${packet.tree_node_id.substring(0, 8)}`,
      weight: 0.8,
    });
  }

  // Community clustering
  if (packet.community_id !== undefined) {
    tuples.push({
      type: 'topology_community',
      value: `community_${packet.community_id}`,
      weight: 0.7,
    });
  }

  // Neighborhood distance (if available)
  if (packet.page_rank_score !== undefined && packet.page_rank_score !== null) {
    tuples.push({
      type: 'topology_authority',
      value: `authority_${parseFloat(packet.page_rank_score).toFixed(3)}`,
      weight: parseFloat(packet.page_rank_score) || 0.5,  // Use score as weight
    });
  }

  return tuples;
}

/**
 * Extract lexical tuples (nouns, verbs, n-grams from summary/concepts)
 */
function extractLexicalTuples(summary, usedConcepts, featureId) {
  const tuples = [];

  // Extract nouns from summary
  if (summary) {
    const nounMatches = summary.match(LEXICAL_PATTERNS.noun) || [];
    const uniqueNouns = [...new Set(nounMatches.map(n => n.toLowerCase()))];
    uniqueNouns.slice(0, 10).forEach(noun => {
      tuples.push({
        type: 'lexical_noun',
        value: noun,
        weight: 0.6,
      });
    });

    // Extract verbs from summary
    const verbMatches = summary.match(LEXICAL_PATTERNS.verb) || [];
    const uniqueVerbs = [...new Set(verbMatches.map(v => v.toLowerCase()))];
    uniqueVerbs.slice(0, 5).forEach(verb => {
      tuples.push({
        type: 'lexical_verb',
        value: verb,
        weight: 0.5,
      });
    });
  }

  // Used concepts as direct tuples
  if (Array.isArray(usedConcepts) && usedConcepts.length > 0) {
    usedConcepts.forEach(concept => {
      tuples.push({
        type: 'lexical_concept',
        value: concept.toLowerCase(),
        weight: 0.8,
      });
    });
  }

  // Feature ID components (split on . or :)
  if (featureId) {
    const parts = featureId.split(/[.:]/);
    parts.forEach(part => {
      if (part.length > 2) {
        tuples.push({
          type: 'lexical_feature_component',
          value: part.toLowerCase(),
          weight: 0.7,
        });
      }
    });
  }

  return tuples;
}

/**
 * Extract concept tuples (used_concepts normalized)
 */
function extractConceptTuples(usedConcepts, astSymbols) {
  const tuples = [];

  if (Array.isArray(usedConcepts)) {
    usedConcepts.forEach(concept => {
      tuples.push({
        type: 'concept',
        value: concept,
        weight: 0.9,
      });
    });
  }

  if (Array.isArray(astSymbols)) {
    astSymbols.forEach(sym => {
      // Extract camelCase parts
      const parts = sym.split(/(?=[A-Z])/);
      parts.forEach(part => {
        if (part.length > 2) {
          tuples.push({
            type: 'concept_symbol_part',
            value: part.toLowerCase(),
            weight: 0.5,
          });
        }
      });
    });
  }

  return tuples;
}

/**
 * Normalize and deduplicate tuples
 */
function normalizeTuples(allTuples) {
  const seen = new Set();
  const normalized = [];

  for (const tuple of allTuples) {
    const key = `${tuple.type}:${tuple.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(tuple);
    }
  }

  return normalized.sort((a, b) => b.weight - a.weight);
}

async function main() {
  console.log(`\n[UNIFIED TUPLE EXTRACTOR] ${isDryRun ? 'DRY-RUN' : 'APPLY'}\n`);

  const client = await pool.connect();
  const reportsDir = path.join(process.cwd(), 'docs', 'reports');
  const stats = {
    packetsProcessed: 0,
    tuplesExtracted: 0,
    tuplesNormalized: 0,
    coverageBySchemaTuples: 0,
    coverageByOntologyTuples: 0,
    coverageByTopologyTuples: 0,
    coverageByLexicalTuples: 0,
    coverageByConceptTuples: 0,
  };

  try {
    console.log('Step 1: Fetch packets for tuple extraction...');
    const queryResult = await client.query(`
      SELECT
        ap.packet_key,
        ap.source_ref,
        ap.feature_id,
        ap.domain_class,
        ap.tree_node_id,
        ap.som_cluster,
        ap.page_rank_score,
        ap.community_id,
        apf.ast_symbols,
        apf.used_concepts
      FROM atlas_packets ap
      LEFT JOIN atlas_packet_features apf ON ap.packet_key = apf.packet_key
      WHERE ap.source_ref NOT LIKE 'proto:%'
      LIMIT $1
    `, [limit]);

    const packets = queryResult.rows;
    console.log(`  [OK] Found ${packets.length} packets\n`);

    if (packets.length === 0) {
      console.log('  [WARN] No packets to process.\n');
      process.exit(0);
    }

    // Extract tuples for each packet
    console.log('Step 2: Extract tuples...');
    const allTuplesMap = new Map(); // packet_key → tuples

    for (const packet of packets) {
      const tuples = [];

      // Extract from each category
      tuples.push(...extractSchemaTuples(packet.ast_symbols, packet.source_ref));
      tuples.push(...extractOntologyTuples(null, packet.domain_class));
      tuples.push(...extractTopologyTuples(packet));
      tuples.push(...extractLexicalTuples(null, packet.used_concepts, packet.feature_id));
      tuples.push(...extractConceptTuples(packet.used_concepts, packet.ast_symbols));

      const normalized = normalizeTuples(tuples);
      allTuplesMap.set(packet.packet_key, normalized);

      stats.packetsProcessed++;
      stats.tuplesExtracted += tuples.length;
      stats.tuplesNormalized += normalized.length;

      // Count coverage by type
      if (normalized.some(t => t.type.startsWith('schema'))) stats.coverageBySchemaTuples++;
      if (normalized.some(t => t.type.startsWith('ontology'))) stats.coverageByOntologyTuples++;
      if (normalized.some(t => t.type.startsWith('topology'))) stats.coverageByTopologyTuples++;
      if (normalized.some(t => t.type.startsWith('lexical'))) stats.coverageByLexicalTuples++;
      if (normalized.some(t => t.type === 'concept')) stats.coverageByConceptTuples++;

      if (isVerbose && packets.indexOf(packet) < 3) {
        console.log(`  ${packet.packet_key}: ${normalized.length} tuples`);
        normalized.slice(0, 3).forEach(t => {
          console.log(`    - ${t.type}: ${t.value} (weight: ${t.weight.toFixed(2)})`);
        });
      }
    }

    console.log(`  [OK] Extracted ${stats.tuplesExtracted} total tuples\n`);

    if (isDryRun) {
      console.log('Step 3: Summary (DRY-RUN)...\n');
      console.log('Tuple Coverage:');
      console.log(`  Schema: ${stats.coverageBySchemaTuples}/${packets.length} (${(stats.coverageBySchemaTuples/packets.length*100).toFixed(1)}%)`);
      console.log(`  Ontology: ${stats.coverageByOntologyTuples}/${packets.length} (${(stats.coverageByOntologyTuples/packets.length*100).toFixed(1)}%)`);
      console.log(`  Topology: ${stats.coverageByTopologyTuples}/${packets.length} (${(stats.coverageByTopologyTuples/packets.length*100).toFixed(1)}%)`);
      console.log(`  Lexical: ${stats.coverageByLexicalTuples}/${packets.length} (${(stats.coverageByLexicalTuples/packets.length*100).toFixed(1)}%)`);
      console.log(`  Concept: ${stats.coverageByConceptTuples}/${packets.length} (${(stats.coverageByConceptTuples/packets.length*100).toFixed(1)}%)\n`);
      console.log('[OK] Dry-run complete. Use --apply to persist.\n');
      process.exit(0);
    }

    // Step 3: Write tuples to NDJSON (for PyTorch/KMeans/Reranking)
    console.log('Step 3: Write tuples to storage...');

    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const tuplesNdjson = path.join(process.cwd(), '.tmp', 'extracted-tuples.ndjson');
    const tmpDir = path.dirname(tuplesNdjson);
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const ndjsonLines = Array.from(allTuplesMap.entries()).map(([pkey, tuples]) =>
      JSON.stringify({ packet_key: pkey, tuples })
    );
    fs.writeFileSync(tuplesNdjson, ndjsonLines.join('\n') + '\n');
    console.log(`  [OK] Tuples written to ${tuplesNdjson}\n`);

    // Step 4: Generate report
    console.log('Step 4: Generate summary report...');
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        packetsProcessed: stats.packetsProcessed,
        tuplesExtracted: stats.tuplesExtracted,
        tuplesNormalized: stats.tuplesNormalized,
        avgTuplesPerPacket: (stats.tuplesNormalized / stats.packetsProcessed).toFixed(2),
      },
      coverage: {
        schema_tuples: {
          count: stats.coverageBySchemaTuples,
          pct: (stats.coverageBySchemaTuples / packets.length * 100).toFixed(1),
        },
        ontology_tuples: {
          count: stats.coverageByOntologyTuples,
          pct: (stats.coverageByOntologyTuples / packets.length * 100).toFixed(1),
        },
        topology_tuples: {
          count: stats.coverageByTopologyTuples,
          pct: (stats.coverageByTopologyTuples / packets.length * 100).toFixed(1),
        },
        lexical_tuples: {
          count: stats.coverageByLexicalTuples,
          pct: (stats.coverageByLexicalTuples / packets.length * 100).toFixed(1),
        },
        concept_tuples: {
          count: stats.coverageByConceptTuples,
          pct: (stats.coverageByConceptTuples / packets.length * 100).toFixed(1),
        },
      },
    };

    const reportPath = path.join(reportsDir, 'unified-tuple-extraction.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`  [OK] Report written to ${reportPath}\n`);

    console.log('Extraction Summary:');
    console.log(`  Packets processed: ${stats.packetsProcessed}`);
    console.log(`  Total tuples extracted: ${stats.tuplesExtracted}`);
    console.log(`  Avg tuples/packet: ${report.summary.avgTuplesPerPacket}`);
    console.log(`  Coverage: schema ${report.coverage.schema_tuples.pct}%, ontology ${report.coverage.ontology_tuples.pct}%, topology ${report.coverage.topology_tuples.pct}%\n`);

    console.log('[SUCCESS] Unified Tuple Extraction Complete.\n');
    process.exit(0);
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

main();
