#!/usr/bin/env node

/**
 * Extract AST keywords, domain classification, and feature signals per packet.
 * Staged modes: --sample 100 (test), --limit 5000 (batch), --all (full), --dry-run (no writes).
 * Output: Writes to packet_ast_keyword_features table + JSONL extraction report.
 *
 * Usage:
 *   node extract-ast-keywords.mjs --sample 100 --dry-run
 *   node extract-ast-keywords.mjs --limit 5000 --verbose
 *   node extract-ast-keywords.mjs --all --apply
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync } from 'fs';
import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { enrichPacketIdentity } from './packet-identity-enricher.mjs';

const execAsync = promisify(exec);
config({ path: resolve('.', '.env') });
config({ path: resolve('.', 'sveltekit-frontend/.env.local'), override: false });

// Argument parsing
const args = process.argv.slice(2);
const flags = {
  sample: null,
  limit: null,
  all: false,
  dryRun: args.includes('--dry-run'),
  apply: args.includes('--apply'),
  verbose: args.includes('--verbose'),
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--sample' && args[i + 1]) flags.sample = parseInt(args[i + 1]);
  if (args[i] === '--limit' && args[i + 1]) flags.limit = parseInt(args[i + 1]);
  if (args[i] === '--all') flags.all = true;
}

const dryRun = flags.dryRun;
const verbose = flags.verbose;

console.log(`[extract-ast-keywords] Starting extraction...`);
console.log(`  Mode: ${flags.sample ? `sample(${flags.sample})` : flags.limit ? `limit(${flags.limit})` : flags.all ? 'all' : 'default(1000)'}`);
console.log(`  Dry run: ${dryRun}`);
console.log(`  Verbose: ${verbose}\n`);

// Domain keywords (must match src/lib/server/classifier/domain-classifier.ts)
const KEYWORD_DOMAINS = {
  auth: ['session', 'login', 'logout', 'authenticate', 'authorize', 'token', 'credential', 'password', 'lucia', 'jwt', 'oauth'],
  ui: ['button', 'component', 'render', 'state', 'effect', 'prop', 'modal', 'dialog', 'svelte', 'onclick', 'form'],
  retrieval: ['search', 'query', 'rank', 'score', 'candidate', 'embedding', 'vector', 'qdrant', 'rrf', 'bm25', 'hybrid'],
  network: ['fetch', 'http', 'request', 'response', 'api', 'endpoint', 'server', 'client', 'rest', 'json'],
  database: ['sql', 'postgres', 'drizzle', 'query', 'transaction', 'schema', 'migration', 'table', 'column'],
  cache: ['redis', 'valkey', 'cache', 'ttl', 'bifrost', 'bitfrost', 'memo', 'store', 'persist'],
  agent: ['agent', 'tool', 'dispatcher', 'mcp', 'trace', 'workflow', 'orchestrat', 'agentic'],
  graph: ['neo4j', 'edge', 'node', 'pagerank', 'community', 'topology', 'relationship', 'traversal'],
  ml: ['xgboost', 'classifier', 'embedding', 'som', 'kmeans', 'tensor', 'model', 'train', 'predict'],
  general: []
};

function classifyDomainFromText(text) {
  const lower = text.toLowerCase();
  const counts = { auth: 0, ui: 0, retrieval: 0, network: 0, database: 0, cache: 0, agent: 0, graph: 0, ml: 0, general: 0 };

  for (const [domain, words] of Object.entries(KEYWORD_DOMAINS)) {
    counts[domain] = words.reduce((sum, word) => sum + (lower.includes(word) ? 1 : 0), 0);
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [bestDomain, bestScore] = sorted[0] ?? ['general', 0];
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return {
    domain: bestScore > 0 ? bestDomain : 'general',
    confidence: total > 0 ? bestScore / total : 0,
    counts
  };
}

async function extractKeywordsWithRg(sourceRef, limit = 50) {
  try {
    const { stdout } = await execAsync(`rg -o '\\w+' "${sourceRef}" | head -${limit}`, { maxBuffer: 10 * 1024 * 1024 });
    return stdout
      .split('\n')
      .filter(line => line.trim().length > 0)
      .slice(0, limit);
  } catch (e) {
    return [];
  }
}

function validateClassifierVector(vector) {
  const errors = [];
  if (!vector.packet_key) errors.push('missing packet_key');
  if (!vector.source_ref) errors.push('missing source_ref');
  if (vector.ast_domain_confidence < 0 || vector.ast_domain_confidence > 1) {
    errors.push(`ast_domain_confidence out of range [0,1]: ${vector.ast_domain_confidence}`);
  }
  return errors;
}

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  });

  try {
    const limit = flags.sample || flags.limit || (flags.all ? null : 1000);
    let query = `
      SELECT
        ap.packet_key,
        ap.source_ref,
        ap.domain_class,
        ap.bm25_score
      FROM atlas_packets ap
      WHERE ap.source_ref IS NOT NULL
      AND ap.source_ref NOT LIKE '%:%'
      ORDER BY ap.packet_key
    `;
    if (limit) query += ` LIMIT ${limit}`;

    const result = await pool.query(query);
    const packets = result.rows;

    console.log(`[extract-ast-keywords] Found ${packets.length} packets to process\n`);

    const report = {
      timestamp: new Date().toISOString(),
      mode: flags.sample ? `sample(${flags.sample})` : flags.limit ? `limit(${flags.limit})` : flags.all ? 'all' : 'default(1000)',
      dryRun,
      totalProcessed: packets.length,
      successCount: 0,
      failureCount: 0,
      validationErrorCount: 0,
      domainCounts: { auth: 0, ui: 0, retrieval: 0, network: 0, database: 0, cache: 0, agent: 0, graph: 0, ml: 0, general: 0 },
      errors: [],
      records: []
    };

    let processed = 0;

    for (const packet of packets) {
      processed++;
      if (verbose && processed % 100 === 0) console.log(`  [${processed}/${packets.length}] Processing...`);

      try {
        // Extract keywords from source_ref + domain_class
        const textToClassify = [packet.source_ref, packet.domain_class || ''].join(' ');
        const classification = classifyDomainFromText(textToClassify);

        // Extract keywords from classification results
        const keywords = Object.entries(classification.counts)
          .filter(([_, count]) => count > 0)
          .map(([domain, _]) => domain);

        // Use shared library for identity enrichment
        const enrichment = enrichPacketIdentity({
          source_ref: packet.source_ref,
          source_kind: 'code',
          predicted_domain: classification.domain,
          keywords: keywords.length > 0 ? keywords : [classification.domain],
          domain_confidence: classification.confidence,
          qdrant_point_id: null,  // AST lane doesn't have embeddings yet
          derived_title: null
        });

        const { feature_id, feature_label, tree_node_id, hmm_state, semantic_title_id } = enrichment;

        // Build feature vector
        const featureVector = {
          packet_key: packet.packet_key,
          source_ref: packet.source_ref,
          ast_domain_confidence: classification.confidence
        };

        // Validate
        const validationErrors = validateClassifierVector(featureVector);
        if (validationErrors.length > 0) {
          report.validationErrorCount++;
          report.errors.push({ packet_key: packet.packet_key, errors: validationErrors });
          continue;
        }

        // Record
        report.successCount++;
        report.domainCounts[classification.domain]++;
        report.records.push({
          packet_key: packet.packet_key,
          source_ref: packet.source_ref,
          predicted_domain: classification.domain,
          domain_confidence: classification.confidence,
          feature_id,
          feature_label,
          tree_node_id,
          hmm_state,
          semantic_title_id,
          keyword_counts: classification.counts
        });

        // Write to DB if not dry-run
        if (!dryRun) {
          await pool.query(
            `
            INSERT INTO packet_source_features (
              packet_key, source_ref, source_kind, is_code, predicted_domain, domain_confidence,
              domain_detection_method, feature_id, feature_label, tree_node_id, hmm_state,
              semantic_title_id, keyword_counts, extraction_source, is_valid, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            ON CONFLICT (packet_key) DO UPDATE SET
              source_kind = $3,
              is_code = $4,
              predicted_domain = $5,
              domain_confidence = $6,
              feature_id = $8,
              feature_label = $9,
              tree_node_id = $10,
              hmm_state = $11,
              semantic_title_id = $12,
              keyword_counts = $13,
              updated_at = NOW()
            `,
            [
              packet.packet_key,
              packet.source_ref,
              'code',
              true,
              classification.domain,
              classification.confidence,
              'keyword',
              feature_id,
              feature_label,
              tree_node_id,
              hmm_state,
              semantic_title_id,
              JSON.stringify(classification.counts),
              'rg-keyword',
              true,
              'extracted'
            ]
          );
        }
      } catch (error) {
        report.failureCount++;
        report.errors.push({ packet_key: packet.packet_key, error: error.message });
      }
    }

    // Output report
    const reportPath = `extraction-report-${Date.now()}.json`;
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n[extract-ast-keywords] Extraction complete`);
    console.log(`  Success: ${report.successCount}/${packets.length}`);
    console.log(`  Domain distribution: ${JSON.stringify(report.domainCounts)}`);
    console.log(`  Report: ${reportPath}\n`);

    if (dryRun) console.log('  [DRY RUN] No changes written to database');
    else console.log('  [APPLY] Changes written to database');
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('[extract-ast-keywords] Error:', err);
  process.exit(1);
});
