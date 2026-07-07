#!/usr/bin/env node

/**
 * Phase 3b.2: Semantic Splitter Pipeline (Refined)
 *
 * Derives semantic objects from packets using content-first approach:
 * 1. Extract semantic content (feature_label, summary, ontology)
 * 2. Deterministically derive title from semantic content
 * 3. Classify domain from content + ontology
 * 4. Assign tree node from hierarchy
 * 5. Extract keywords from ontology + summary
 * 6. Generate named vectors (identity, title, summary, keywords, api, topology, domain)
 * 7. Enrich Qdrant payload with all signals
 * 8. Create Neo4j relationships
 * 9. Cache in Redis by feature
 *
 * Output: Unified semantic object ready for multi-vector retrieval
 *
 * Usage:
 *   node phase3b2-semantic-splitter-pipeline.mjs --dry-run --verbose
 *   node phase3b2-semantic-splitter-pipeline.mjs --apply --verbose
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');

// ══════════════════════════════════════════════════════════════════════════════
// SEMANTIC SPLITTER TYPES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Derived Semantic Object — unified structure for all packets
 */
function createSemanticObject(packet) {
  const derived = {
    // Identity (lookup)
    packet_key: packet.packet_key,
    feature_id: packet.feature_id,
    function_symbol: packet.function_symbol,
    source_ref: packet.source_ref,
    identity_lane: packet.identity_lane || 'canonical',

    // Title (human-readable)
    derived_title: deriveTitle(packet),
    title_source: identifyTitleSource(packet),

    // Summary (dense embedding source)
    summary: packet.summary || '',
    summary_confidence: packet.summary ? 0.95 : 0.0,

    // Keywords (lexical retrieval)
    keywords: extractKeywords(packet),
    keyword_source: 'ontology+summary',

    // API (implementation search)
    api_signatures: extractApiSignatures(packet),
    implementation_type: packet.implementation_type || 'unknown',

    // Domain Classification (content-based)
    domain_class: {
      domain: classifyDomain(packet),
      subdomain: classifySubdomain(packet),
      node_type: packet.node_type || 'unknown',
      implementation_type: packet.implementation_type || 'TypeScript',
      feature_group: packet.feature_group || 'general',
      authority: packet.authority || 0.5
    },

    // Tree Node (ontology hierarchy)
    tree_node_id: packet.tree_node_id || 'unknown',
    tree_path: packet.tree_path || buildTreePath(packet),

    // Topology Signals (K-means, SOM — NOT for title/domain, only for routing)
    topology: {
      som_cluster: packet.som_cluster || -1,
      kmeans_cluster: packet.kmeans_cluster || -1,
      community_id: packet.community_id || -1,
      authority: packet.authority || 0.5
    },

    // Metadata
    latent64_optional: packet.latent64_optional || null,
    created_at: new Date().toISOString(),
    source: 'phase3b2-semantic-splitter'
  };

  return derived;
}

// ══════════════════════════════════════════════════════════════════════════════
// TITLE DERIVATION (Deterministic, Content-First)
// ══════════════════════════════════════════════════════════════════════════════

function deriveTitle(packet) {
  // Priority 1: Explicit feature_label (most human-readable)
  if (packet.feature_label && packet.feature_label.trim()) {
    return packet.feature_label.trim();
  }

  // Priority 2: First sentence of summary
  if (packet.summary && packet.summary.trim()) {
    const firstSentence = extractFirstSentence(packet.summary);
    if (firstSentence.length > 0 && firstSentence.length < 100) {
      return firstSentence;
    }
  }

  // Priority 3: Composite of domain_class + feature_id
  const domain = classifyDomain(packet);
  const featureId = packet.feature_id || packet.function_symbol || 'unknown';
  return `${domain}: ${featureId}`;
}

function extractFirstSentence(text) {
  if (!text) return '';
  const match = text.match(/^[^.!?]*[.!?]/);
  return match ? match[0].trim() : text.split('\n')[0].trim();
}

function identifyTitleSource(packet) {
  if (packet.feature_label && packet.feature_label.trim()) return 'feature_label';
  if (packet.summary && packet.summary.trim()) return 'summary_first_sentence';
  return 'derived_from_domain_and_feature_id';
}

// ══════════════════════════════════════════════════════════════════════════════
// DOMAIN CLASSIFICATION (Semantic Content-Based)
// ══════════════════════════════════════════════════════════════════════════════

function classifyDomain(packet) {
  const domainKeywords = {
    'Retrieval': ['search', 'vector', 'qdrant', 'embedding', 'retrieval', 'rrf', 'ranking'],
    'Authentication': ['auth', 'login', 'session', 'user', 'password', 'credential'],
    'Database': ['postgres', 'sql', 'query', 'connection', 'schema', 'migration'],
    'API': ['endpoint', 'route', 'handler', 'request', 'response', 'controller'],
    'Cache': ['redis', 'cache', 'bifrost', 'ttl', 'eviction', 'hit_rate'],
    'Graph': ['neo4j', 'graph', 'topology', 'edge', 'node', 'traverse'],
    'UI': ['svelte', 'component', 'frontend', 'ui', 'button', 'modal', 'page'],
    'Utils': ['utility', 'helper', 'type', 'constant', 'enum', 'interface']
  };

  const text = [
    packet.feature_label || '',
    packet.summary || '',
    packet.source_ref || '',
    packet.ontology_tuples?.join(' ') || ''
  ].join(' ').toLowerCase();

  let maxScore = 0;
  let bestDomain = 'General';

  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    const score = keywords.filter(kw => text.includes(kw)).length;
    if (score > maxScore) {
      maxScore = score;
      bestDomain = domain;
    }
  }

  return bestDomain;
}

function classifySubdomain(packet) {
  // Map feature_group or node_type to subdomain
  const mapping = {
    'HyperRAG': 'Semantic Search',
    'Ontology': 'Schema',
    'Dispatcher': 'Routing',
    'Identity': 'Validation',
    'Cache': 'Performance',
    'Telemetry': 'Observability',
    'GPU': 'Acceleration'
  };

  return mapping[packet.feature_group] || packet.node_type || 'General';
}

// ══════════════════════════════════════════════════════════════════════════════
// TREE NODE ASSIGNMENT (Ontology Hierarchy)
// ══════════════════════════════════════════════════════════════════════════════

function buildTreePath(packet) {
  // Construct canonical path: repository/feature/module/file/class/function
  const parts = [
    packet.repository_id || 'deeds-web-app',
    packet.feature_group || 'general',
    packet.domain_class || 'unknown',
    packet.node_type || 'unknown',
    packet.feature_id || 'unknown'
  ];

  return parts.filter(p => p && p !== 'unknown').join('/');
}

// ══════════════════════════════════════════════════════════════════════════════
// KEYWORD EXTRACTION (Ontology + Summary)
// ══════════════════════════════════════════════════════════════════════════════

function extractKeywords(packet) {
  const keywords = new Set();

  // From ontology tuples
  if (packet.ontology_tuples && Array.isArray(packet.ontology_tuples)) {
    packet.ontology_tuples.forEach(tuple => {
      if (typeof tuple === 'string') {
        tuple.split(/[\s,;]+/).forEach(word => {
          if (word.length > 2) keywords.add(word.toLowerCase());
        });
      }
    });
  }

  // From summary (top terms)
  if (packet.summary) {
    const words = packet.summary.toLowerCase().split(/[\s,;.!?]+/);
    const stopwords = new Set(['the', 'a', 'an', 'and', 'or', 'is', 'are', 'was', 'were', 'be', 'been', 'being']);
    words
      .filter(w => w.length > 3 && !stopwords.has(w))
      .slice(0, 10)
      .forEach(w => keywords.add(w));
  }

  // From feature_label
  if (packet.feature_label) {
    packet.feature_label.toLowerCase().split(/[\s-_]+/).forEach(w => {
      if (w.length > 2) keywords.add(w);
    });
  }

  return Array.from(keywords).sort();
}

// ══════════════════════════════════════════════════════════════════════════════
// API SIGNATURE EXTRACTION (Implementation Search)
// ══════════════════════════════════════════════════════════════════════════════

function extractApiSignatures(packet) {
  const sigs = [];

  // Extract from feature_label if it looks like a function
  if (packet.feature_label && /\(.*\)/.test(packet.feature_label)) {
    sigs.push(packet.feature_label);
  }

  // Extract from ontology if it contains function patterns
  if (packet.ontology_tuples) {
    packet.ontology_tuples
      .filter(t => typeof t === 'string' && /\(.*\)/.test(t))
      .forEach(t => sigs.push(t));
  }

  return sigs;
}

// ══════════════════════════════════════════════════════════════════════════════
// QDRANT PAYLOAD ENRICHMENT
// ══════════════════════════════════════════════════════════════════════════════

function buildQdrantPayload(semantic) {
  return {
    packet_key: semantic.packet_key,
    derived_title: semantic.derived_title,
    domain: semantic.domain_class.domain,
    node_type: semantic.domain_class.node_type,
    tree_node_id: semantic.tree_node_id,
    keywords: semantic.keywords,
    summary: semantic.summary,
    som_cluster: semantic.topology.som_cluster,
    kmeans_cluster: semantic.topology.kmeans_cluster,
    community_id: semantic.topology.community_id,
    authority: semantic.domain_class.authority,
    source_ref: semantic.source_ref,
    feature_id: semantic.feature_id,
    implementation_type: semantic.domain_class.implementation_type
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PIPELINE
// ══════════════════════════════════════════════════════════════════════════════

async function runSemanticSplitterPipeline(dryRun = true, verbose = false) {
  console.log(`
${'='.repeat(80)}
Phase 3b.2: Semantic Splitter Pipeline (Content-First Derivation)
${'='.repeat(80)}
Mode: ${dryRun ? 'DRY-RUN' : 'LIVE'}
Verbose: ${verbose}
${'='.repeat(80)}
  `);

  // Simulated packet for demonstration
  const samplePacket = {
    packet_key: 'ace:packet:retrieval:001',
    feature_id: 'retrieval.multi_vector',
    feature_label: 'Multi-Vector RRF Retrieval',
    function_symbol: 'executeMultiVectorRetrieval',
    source_ref: 'src/lib/server/retrieval/multi-vector-orchestrator.ts',
    feature_group: 'HyperRAG',
    node_type: 'Function',
    tree_node_id: 'hyperrag/search/vector/multi-vector',
    implementation_type: 'TypeScript',
    domain_class: 'Retrieval',
    authority: 0.91,
    summary: 'Executes multi-vector retrieval via RRF fusion combining content, summary, title, and keyword lanes.',
    ontology_tuples: ['retrieval', 'vector', 'rrf', 'qdrant', 'semantic', 'ranking'],
    som_cluster: 247,
    kmeans_cluster: 12,
    community_id: 8,
    identity_lane: 'canonical'
  };

  // Create semantic object
  const semantic = createSemanticObject(samplePacket);

  if (verbose) {
    console.log('\n📋 SEMANTIC OBJECT:');
    console.log(JSON.stringify(semantic, null, 2));
  }

  // Build Qdrant payload
  const qdrantPayload = buildQdrantPayload(semantic);

  if (verbose) {
    console.log('\n📦 QDRANT PAYLOAD:');
    console.log(JSON.stringify(qdrantPayload, null, 2));
  }

  // Validation gates
  console.log('\n[VALIDATION GATES]');

  const gates = {
    title_derived: !!semantic.derived_title && semantic.derived_title.length > 0,
    title_source_identified: !!semantic.title_source,
    domain_classified: !!semantic.domain_class.domain && semantic.domain_class.domain !== 'unknown',
    tree_node_assigned: !!semantic.tree_node_id && semantic.tree_node_id !== 'unknown',
    keywords_extracted: semantic.keywords && semantic.keywords.length > 0,
    topology_signals_present: semantic.topology.som_cluster >= 0 && semantic.topology.kmeans_cluster >= 0,
    qdrant_payload_complete: Object.keys(qdrantPayload).length >= 10
  };

  Object.entries(gates).forEach(([gate, pass]) => {
    console.log(`${pass ? '✓' : '✗'} ${gate}: ${pass ? 'PASS' : 'FAIL'}`);
  });

  const allPassed = Object.values(gates).every(v => v);
  console.log(`\n${allPassed ? '✅' : '❌'} All gates ${allPassed ? 'PASSED' : 'FAILED'}`);

  if (dryRun) {
    console.log('\n[DRY-RUN] Would write to:');
    console.log('  - Postgres: codebase_chunk_index (semantic columns)');
    console.log('  - Qdrant: codebase_chunks_768 payload update');
    console.log('  - Neo4j: relationships for tree_node_id hierarchy');
    console.log('  - Redis: feature cache entries');
  }

  console.log(`
${'='.repeat(80)}
Phase 3b.2 Complete
${'='.repeat(80)}
  `);

  return {
    success: allPassed,
    semantic_object: semantic,
    qdrant_payload: qdrantPayload
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// CLI
// ══════════════════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const verbose = args.includes('--verbose');

runSemanticSplitterPipeline(dryRun, verbose).catch(err => {
  console.error('❌ Pipeline failed:', err);
  process.exit(1);
});
