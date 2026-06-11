#!/usr/bin/env node
/**
 * NESCHROM97 Card Taxonomy Classifier
 *
 * Determines what each card represents before enrichment.
 * Pure heuristic classification (no DB lookups).
 *
 * Output:
 *   docs/reports/neschrom97-card-taxonomy.json
 *
 * Classification kinds:
 *   packet      - Matches canonical packet ledger (source_ref alignment)
 *   feature     - Feature catalog entry (tags indicate feature)
 *   directory   - Directory structure card (path-based)
 *   cluster     - SOM/GPU cluster summary
 *   summary     - Generated summary from LLM
 *   agent       - Agent output or recommendation
 *   graph       - Graph traversal or topology card
 *   telemetry   - Telemetry or metrics card
 *   unknown     - Could not classify
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');

// ============================================================================
// CLASSIFICATION LOGIC (PURE HEURISTICS)
// ============================================================================

/**
 * Classify a single card based on content heuristics
 */
function classifyCard(card) {
  const { id, source, title, tags = [], som_cluster, summary, text } = card;

  // Confidence starts at 0.5 (uncertain)
  let confidence = 0.5;
  let kind = 'unknown';

  // 1. PACKET classification
  // Packets have: source file + tags + specific structure
  if (source && source.includes('src/routes/api')) {
    kind = 'packet';
    confidence = 0.9; // Very high confidence: API route pattern
  } else if (source && source.includes('src/lib/server') && tags.includes('server')) {
    kind = 'packet';
    confidence = 0.85;
  }

  // 2. FEATURE classification
  // Features have: feature keywords in tags or title
  const featureKeywords = ['feature', 'rag', 'chat', 'graph', 'evidence', 'case', 'citation', 'statute'];
  if (!kind || kind === 'unknown') {
    const hasFeatureTag = tags.some(t => featureKeywords.some(f => t.toLowerCase().includes(f)));
    if (hasFeatureTag) {
      kind = 'feature';
      confidence = 0.8;
    }
  }

  // 3. DIRECTORY classification
  // Directories have: title matching path, no real content, structural tags
  if (!kind || kind === 'unknown') {
    const pathDepth = (source || '').split('/').length;
    const isStructuralTag = tags.some(t => ['directory', 'folder', 'index', 'utils', 'lib', 'api'].includes(t.toLowerCase()));

    if (isStructuralTag || (pathDepth > 3 && !summary && !text)) {
      kind = 'directory';
      confidence = 0.75;
    }
  }

  // 4. CLUSTER classification
  // Clusters have: som_cluster value, cluster in tags, numeric ID
  if (!kind || kind === 'unknown') {
    const hasClusterTag = tags.some(t => t.toLowerCase().includes('cluster'));
    if (typeof som_cluster === 'number' || hasClusterTag) {
      kind = 'cluster';
      confidence = 0.85;
    }
  }

  // 5. SUMMARY classification
  // Summaries have: title with "summary", summary field populated, agent-generated markers
  if (!kind || kind === 'unknown') {
    const isSummaryTitle = title?.toLowerCase().includes('summary');
    const hasSummaryContent = Boolean(summary && summary.length > 50);

    if (isSummaryTitle || hasSummaryContent) {
      kind = 'summary';
      confidence = 0.8;
    }
  }

  // 6. AGENT classification
  // Agent outputs have: "agent" or "recommendation" in tags/title, structured suggestions
  if (!kind || kind === 'unknown') {
    const hasAgentTag = tags.some(t => ['agent', 'recommendation', 'suggestion', 'decision'].includes(t.toLowerCase()));
    if (hasAgentTag) {
      kind = 'agent';
      confidence = 0.85;
    }
  }

  // 7. GRAPH classification
  // Graph cards have: "graph", "neo4j", "topology" in tags/title
  if (!kind || kind === 'unknown') {
    const hasGraphTag = tags.some(t => ['graph', 'neo4j', 'topology', 'node', 'edge', 'relation'].includes(t.toLowerCase()));
    if (hasGraphTag) {
      kind = 'graph';
      confidence = 0.85;
    }
  }

  // 8. TELEMETRY classification
  // Telemetry has: metrics, latency, counts in title/tags
  if (!kind || kind === 'unknown') {
    const hasTelemetryTag = tags.some(t => ['telemetry', 'metrics', 'latency', 'count', 'stats'].includes(t.toLowerCase()));
    if (hasTelemetryTag) {
      kind = 'telemetry';
      confidence = 0.8;
    }
  }

  return {
    card_id: id,
    kind,
    path: source,
    feature_id: null, // TBD: from packet registry
    packet_key: null, // TBD: from packet registry
    confidence,
    tags,
    som_cluster,
    derived_from: null, // TBD: from card content analysis
  };
}

/**
 * Load card store and classify all cards
 */
function classifyAllCards(cardDir) {
  const files = fs.readdirSync(cardDir).filter(f => f.endsWith('.json'));
  const taxonomy = {};

  for (const file of files) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(cardDir, file), 'utf8'));
      taxonomy[content.id] = classifyCard(content);
    } catch (err) {
      console.warn(`[skip] ${file}: ${err.message}`);
    }
  }

  return taxonomy;
}

/**
 * Generate taxonomy summary statistics
 */
function generateTaxonomySummary(taxonomy) {
  const counts = {};
  const confidenceByKind = {};

  for (const [cardId, entry] of Object.entries(taxonomy)) {
    const { kind, confidence } = entry;
    counts[kind] = (counts[kind] || 0) + 1;

    if (!confidenceByKind[kind]) {
      confidenceByKind[kind] = [];
    }
    confidenceByKind[kind].push(confidence);
  }

  // Compute average confidence per kind
  const avgConfidence = {};
  for (const [kind, confs] of Object.entries(confidenceByKind)) {
    avgConfidence[kind] = (confs.reduce((a, b) => a + b, 0) / confs.length).toFixed(3);
  }

  return { counts, avgConfidence };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const timestamp = new Date().toISOString();
  const cardDir = path.join(PROJECT_ROOT, 'neschrom97/cards');
  const outputPath = path.join(PROJECT_ROOT, 'docs/reports/neschrom97-card-taxonomy.json');

  if (!fs.existsSync(cardDir)) {
    console.error(`[error] Card store not found: ${cardDir}`);
    process.exit(1);
  }

  console.log(`[load] Reading card store from ${cardDir}...`);
  const taxonomy = classifyAllCards(cardDir);
  console.log(`[load] Classified ${Object.keys(taxonomy).length} cards`);

  const summary = generateTaxonomySummary(taxonomy);

  console.log(`[summary] Kind distribution:`);
  for (const [kind, count] of Object.entries(summary.counts)) {
    const avgConf = summary.avgConfidence[kind];
    console.log(`  ${kind}: ${count} cards (avg confidence: ${avgConf})`);
  }

  const output = {
    metadata: {
      generated_at: timestamp,
      generated_by: 'classify-neschrom97-cards.mjs',
      total_cards: Object.keys(taxonomy).length,
      classification_kinds: ['packet', 'feature', 'directory', 'cluster', 'summary', 'agent', 'graph', 'telemetry', 'unknown'],
      kind_distribution: summary.counts,
      average_confidence_by_kind: summary.avgConfidence,
    },
    taxonomy,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n[write] Taxonomy written to ${outputPath}`);
  const bytes = fs.statSync(outputPath).size;
  const mb = (bytes / 1024 / 1024).toFixed(2);
  console.log(`[size] ${bytes} bytes (${mb} MB)`);

  console.log(`\n[next] Analyze derived artifacts before Qdrant enrichment`);
}

main().catch(err => {
  console.error('[error]', err.message);
  process.exit(1);
});
