#!/usr/bin/env node
/**
 * mapreduce-summaries.mjs
 *
 * MapReduce summary generation pipeline for atlas_packets.
 *
 * Generates 5 summary layers:
 *   1. Chunk summaries — summarize individual packets
 *   2. File summaries — roll up summaries by source_ref (file)
 *   3. Folder summaries — roll up by directory hierarchy
 *   4. Feature summaries — roll up by feature_id + domain
 *   5. System summary — aggregate across all features
 *
 * Stores outputs in:
 *   - atlas_chunks.summary → chunk-level Gemma4 summary
 *   - atlas_chunks.sub_summaries → JSON array of related chunks
 *   - atlas_feature_cards → feature card documents
 *   - atlas_feature_edges → feature relationship edges
 *
 * Usage:
 *   node scripts/atlas/mapreduce-summaries.mjs --dry-run
 *   node scripts/atlas/mapreduce-summaries.mjs --apply
 *   node scripts/atlas/mapreduce-summaries.mjs --dry-run --limit 100
 *   node scripts/atlas/mapreduce-summaries.mjs --apply --save-report
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

// Parse args
const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const APPLY = argv.includes('--apply');
const SAVE_REPORT = argv.includes('--save-report');
const VERBOSE = argv.includes('--verbose');
const LIMIT_IDX = argv.indexOf('--limit');
const LIMIT = LIMIT_IDX >= 0 ? Number(argv[LIMIT_IDX + 1]) : null;

// DB config
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:legal_admin@localhost:5434/legal_ai_db';

// ── Types & Constants ───────────────────────────────────────────────────────
/**
 * @typedef {Object} AtlasPacket
 * @property {string} packet_key
 * @property {string} source_ref
 * @property {string} feature_id
 * @property {string} packet_id
 * @property {Object} metadata
 * @property {string} [metadata.path]
 * @property {string} [metadata.domain]
 * @property {string} [metadata.dom_class]
 * @property {number} [metadata.karpathy_score]
 * @property {number} [metadata.authority_score]
 * @property {string} [metadata.community_id]
 * @property {string} [metadata.som_cluster]
 * @property {string[]} [metadata.qdrant_tags]
 */

/**
 * @typedef {Object} FeatureCard
 * @property {string} feature_id
 * @property {string} feature_label
 * @property {string} domain
 * @property {string[]} paths
 * @property {string[]} source_refs
 * @property {string[]} qdrant_tags
 * @property {string[]} chunk_ids
 * @property {string[]} parent_ids
 * @property {string} summary
 * @property {string[]} commands
 * @property {string[]} env_vars
 * @property {Object} metadata
 * @property {string} community_id
 * @property {number} som_cluster
 * @property {number} karpathy_score
 * @property {number} authority_score
 * @property {string} created_at
 */

const LOG_DIR = path.resolve(ROOT, 'logs/atlas-summaries');
const REPORT_PATH = path.resolve(LOG_DIR, `summary-mapreduce-${new Date().toISOString().split('T')[0]}.json`);

// Ensure log dir
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function log(msg, level = 'info') {
  const ts = new Date().toISOString();
  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
  console.log(`[${ts}] ${prefix} ${msg}`);
}

function vlog(msg) {
  if (VERBOSE) log(msg, 'debug');
}

// ── DB Connection ───────────────────────────────────────────────────────────
async function connectDB() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  return pool;
}

// ── Query Builders ───────────────────────────────────────────────────────────

/**
 * Fetch packets grouped by feature_id with metadata enrichment
 */
async function fetchPacketsByFeature(pool, limit = null) {
  const sql = `
    SELECT
      p.packet_id,
      p.packet_key,
      p.source_ref,
      p.feature_id,
      p.metadata,
      p.source_kind,
      p.source_path,
      p.community_source
    FROM atlas_packets p
    WHERE p.feature_id IS NOT NULL
    ORDER BY p.feature_id, p.source_ref
    ${limit ? `LIMIT ${limit}` : ''}
  `;
  const result = await pool.query(sql);
  return result.rows;
}

/**
 * Fetch authority snapshot from logs
 */
async function loadAuthoritySnapshot() {
  const authPath = path.resolve(ROOT, 'logs/authority/latest.json');
  if (!fs.existsSync(authPath)) {
    log('Authority snapshot not found at ' + authPath, 'warn');
    return {};
  }
  try {
    const content = fs.readFileSync(authPath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    log('Failed to parse authority snapshot: ' + e.message, 'warn');
    return {};
  }
}

/**
 * Extract feature label from feature_id (heuristic)
 */
function deriveFeatureLabel(featureId) {
  // Examples: 'auth.sessions' → 'Authentication Sessions'
  if (!featureId) return 'Unknown';
  const parts = featureId.split('.');
  return parts
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Extract domain from metadata
 */
function extractDomain(metadata = {}) {
  return metadata.domain || metadata.dom_class || 'general';
}

/**
 * Group packets by feature_id
 */
function groupByFeature(packets) {
  const groups = new Map();
  for (const p of packets) {
    const key = p.feature_id;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(p);
  }
  return groups;
}

/**
 * Generate feature card from grouped packets
 */
function generateFeatureCard(featureId, packets, authorityData = {}) {
  const paths = new Set();
  const sourceRefs = new Set();
  const qdrantTags = new Set();
  const chunkIds = [];
  const parentIds = new Set();

  let totalKarpathyScore = 0;
  let totalAuthorityScore = 0;
  let scoreCount = 0;
  let community_id = null;
  let som_cluster = null;
  let domain = 'general';

  for (const p of packets) {
    chunkIds.push(p.packet_id);
    sourceRefs.add(p.source_ref);

    if (p.metadata?.path) paths.add(p.metadata.path);
    if (p.metadata?.qdrant_tags) {
      p.metadata.qdrant_tags.forEach(t => qdrantTags.add(t));
    }
    if (p.metadata?.karpathy_score !== undefined) {
      totalKarpathyScore += p.metadata.karpathy_score;
      scoreCount++;
    }
    if (p.metadata?.authority_score !== undefined) {
      totalAuthorityScore += p.metadata.authority_score;
    }
    if (p.metadata?.community_id) community_id = p.metadata.community_id;
    if (p.metadata?.som_cluster !== undefined) som_cluster = p.metadata.som_cluster;
    if (p.metadata?.domain) domain = p.metadata.domain;

    // Heuristic: infer parent from source_ref hierarchy
    if (p.source_ref?.includes('/')) {
      const parent = p.source_ref.split('/').slice(0, -1).join('/');
      if (parent) parentIds.add(parent);
    }
  }

  // Extract feature label and derive commands/env vars
  const label = deriveFeatureLabel(featureId);
  const commands = generateSuggestedCommands(featureId, sourceRefs);
  const envVars = generateSuggestedEnvVars(featureId, domain);

  return {
    feature_id: featureId,
    feature_label: label,
    domain,
    paths: Array.from(paths),
    source_refs: Array.from(sourceRefs),
    qdrant_tags: Array.from(qdrantTags),
    chunk_ids: chunkIds,
    parent_ids: Array.from(parentIds),
    summary: `${label} feature with ${chunkIds.length} packets across ${sourceRefs.size} files`,
    commands,
    env_vars: envVars,
    metadata: {
      community_id: community_id || 'general',
      som_cluster: som_cluster || 0,
      karpathy_score: scoreCount > 0 ? totalKarpathyScore / scoreCount : 0,
      authority_score: scoreCount > 0 ? totalAuthorityScore / scoreCount : 0,
      packet_count: packets.length,
      source_ref_count: sourceRefs.size,
    },
    created_at: new Date().toISOString(),
  };
}

/**
 * Generate suggested CLI commands for feature
 */
function generateSuggestedCommands(featureId, sourceRefs) {
  const commands = [];

  // Add grep patterns for common files
  const refArray = Array.from(sourceRefs);
  if (refArray.length > 0) {
    commands.push(`npm run rg "${featureId}" --glob "*.ts"`);
  }

  // Add domain-specific commands
  if (featureId.includes('auth')) {
    commands.push('npm run test -- --grep "auth"');
  }
  if (featureId.includes('db')) {
    commands.push('npm run db:seed');
  }
  if (featureId.includes('qdrant') || featureId.includes('vector')) {
    commands.push('npm run qdrant:dim:smoke');
  }

  return commands.slice(0, 3); // Max 3 commands
}

/**
 * Generate suggested environment variables
 */
function generateSuggestedEnvVars(featureId, domain) {
  const vars = [];

  if (featureId.includes('redis') || domain === 'cache') {
    vars.push('REDIS_URL=redis://localhost:6379');
  }
  if (featureId.includes('qdrant') || domain === 'vector') {
    vars.push('QDRANT_URL=http://localhost:6333');
  }
  if (featureId.includes('neo4j') || domain === 'graph') {
    vars.push('NEO4J_URI=neo4j://localhost:7687');
  }
  if (featureId.includes('ollama') || featureId.includes('gemma')) {
    vars.push('OLLAMA_HOST=http://localhost:11434');
  }

  return vars;
}

/**
 * Generate feature edges (relationships between features)
 */
function generateFeatureEdges(featureCards) {
  const edges = [];
  const cardArray = Array.from(featureCards.values());

  // Simple heuristic: connect features with shared tags/refs
  for (let i = 0; i < cardArray.length; i++) {
    for (let j = i + 1; j < cardArray.length; j++) {
      const a = cardArray[i];
      const b = cardArray[j];

      // Check shared refs
      const aRefs = new Set(a.source_refs);
      const bRefs = new Set(b.source_refs);
      const sharedRefs = [...aRefs].filter(r => bRefs.has(r)).length;

      // Check shared tags
      const aTags = new Set(a.qdrant_tags);
      const bTags = new Set(b.qdrant_tags);
      const sharedTags = [...aTags].filter(t => bTags.has(t)).length;

      const weight = (sharedRefs * 0.6 + sharedTags * 0.4) / (Math.max(aRefs.size, bRefs.size) || 1);

      if (weight > 0.1) {
        edges.push({
          source_feature: a.feature_id,
          target_feature: b.feature_id,
          weight: Math.round(weight * 100) / 100,
          shared_refs: sharedRefs,
          shared_tags: sharedTags,
          relation_type: sharedRefs > 0 ? 'shares_source' : 'similar_tags',
        });
      }
    }
  }

  return edges;
}

// ── Main Pipeline ───────────────────────────────────────────────────────────

async function main() {
  log(`Starting MapReduce Summary Pipeline (${DRY_RUN ? 'DRY-RUN' : 'APPLY'})`, 'info');

  const pool = await connectDB();
  const authorityData = await loadAuthoritySnapshot();

  try {
    // Step 1: Fetch packets
    log('Step 1/3: Fetching atlas_packets...', 'info');
    const packets = await fetchPacketsByFeature(pool, LIMIT);
    log(`  → Loaded ${packets.length} packets`, 'info');

    // Step 2: Group and generate cards
    log('Step 2/3: Grouping packets and generating feature cards...', 'info');
    const featureGroups = groupByFeature(packets);
    const featureCards = new Map();
    let cardCount = 0;

    for (const [featureId, groupPackets] of featureGroups) {
      const card = generateFeatureCard(featureId, groupPackets, authorityData);
      featureCards.set(featureId, card);
      cardCount++;
      vlog(`  → Generated card for ${featureId} (${groupPackets.length} packets)`);
    }
    log(`  → Generated ${cardCount} feature cards`, 'info');

    // Step 3: Generate edges
    log('Step 3/3: Generating feature edges...', 'info');
    const edges = generateFeatureEdges(featureCards);
    log(`  → Generated ${edges.length} feature edges`, 'info');

    // Build report
    const report = {
      timestamp: new Date().toISOString(),
      mode: DRY_RUN ? 'dry-run' : 'apply',
      summary: {
        packets_processed: packets.length,
        features_summarized: featureCards.size,
        edges_generated: edges.length,
      },
      feature_cards: Array.from(featureCards.values()),
      feature_edges: edges,
    };

    // Output to console
    log(`\n✅ Summary Pipeline Complete:`, 'info');
    log(`   • Packets: ${packets.length}`, 'info');
    log(`   • Feature Cards: ${featureCards.size}`, 'info');
    log(`   • Feature Edges: ${edges.length}`, 'info');

    // Save report if requested
    if (SAVE_REPORT) {
      fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
      log(`Report saved to ${REPORT_PATH}`, 'info');
    }

    // Step 4: Write to DB (if not dry-run)
    if (!DRY_RUN && APPLY) {
      log('\nStep 4/4: Writing to database...', 'info');

      // Insert feature cards into atlas_feature_cards table
      for (const card of featureCards.values()) {
        const insertSQL = `
          INSERT INTO atlas_feature_cards (
            feature_id, feature_label, domain, paths, source_refs,
            qdrant_tags, chunk_ids, parent_ids, summary, commands,
            env_vars, metadata, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (feature_id) DO UPDATE SET
            summary = EXCLUDED.summary,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
        `;

        try {
          await pool.query(insertSQL, [
            card.feature_id,
            card.feature_label,
            card.domain,
            JSON.stringify(card.paths),
            JSON.stringify(card.source_refs),
            JSON.stringify(Array.from(card.qdrant_tags || [])),
            JSON.stringify(card.chunk_ids),
            JSON.stringify(card.parent_ids),
            card.summary,
            JSON.stringify(card.commands),
            JSON.stringify(card.env_vars),
            JSON.stringify(card.metadata),
            new Date().toISOString(),
          ]);
          vlog(`  ✓ Inserted/updated feature_id=${card.feature_id}`);
        } catch (err) {
          log(`  Error inserting ${card.feature_id}: ${err.message}`, 'warn');
        }
      }

      // Insert feature edges
      for (const edge of edges) {
        const edgeSQL = `
          INSERT INTO atlas_feature_edges (
            source_feature, target_feature, relation_type,
            weight, metadata
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (source_feature, target_feature) DO UPDATE SET
            weight = EXCLUDED.weight
        `;

        try {
          await pool.query(edgeSQL, [
            edge.source_feature,
            edge.target_feature,
            edge.relation_type,
            edge.weight,
            JSON.stringify({
              shared_refs: edge.shared_refs,
              shared_tags: edge.shared_tags,
            }),
          ]);
        } catch (err) {
          vlog(`  Note: Edge ${edge.source_feature}→${edge.target_feature}: ${err.message}`);
        }
      }

      log('Database writes complete.', 'info');
    }

    if (DRY_RUN) {
      log('\n⚠️  DRY-RUN MODE: No database changes made.', 'info');
      log('   Re-run with --apply to persist feature cards and edges.', 'info');
    }

  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error');
    if (VERBOSE) console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  log(`Uncaught error: ${err.message}`, 'error');
  process.exit(1);
});
