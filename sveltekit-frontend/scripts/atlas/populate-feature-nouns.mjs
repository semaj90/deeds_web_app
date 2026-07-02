#!/usr/bin/env node
/**
 * Phase 102 E2: Populate noun_terms JSONB for all code_features
 *
 * Extracts nouns, environment keys, symbols, and domain keywords from:
 *   1. feature_id (snake_case identifiers)
 *   2. feature_label (human-readable name)
 *   3. summary (Gemma4-generated description)
 *
 * Stores extracted terms as JSONB array in code_features.noun_terms
 *
 * Usage:
 *   node scripts/atlas/populate-feature-nouns.mjs --dry-run
 *   node scripts/atlas/populate-feature-nouns.mjs --apply
 *   node scripts/atlas/populate-feature-nouns.mjs --limit 10 --apply
 */

import process from 'process';
import pkg from 'pg';
const { Pool } = pkg;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NOUN EXTRACTION PATTERNS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Extract environment keys: UPPERCASE_WITH_UNDERSCORES pattern
 * Examples: DATABASE_URL, REDIS_PASSWORD, QDRANT_API_KEY
 */
function extractEnvKeys(text) {
  const pattern = /\b[A-Z][A-Z0-9_]*\b/g;
  const matches = text.match(pattern) || [];
  // Filter out single letters and known abbreviations
  return matches.filter(m => m.length > 1 && !['A', 'B', 'C', 'ID', 'DB', 'API', 'URL'].includes(m));
}

/**
 * Extract symbols: camelCase or snake_case identifiers (function names, variables)
 * Examples: validateSession, embedPacket, feature_id
 */
function extractSymbols(text) {
  const pattern = /\b[a-z_][a-zA-Z0-9_]*\b/g;
  const matches = text.match(pattern) || [];
  // Filter to reasonable lengths (exclude very short words)
  return matches.filter(m => m.length > 2);
}

/**
 * Extract capitalized words as domain nouns
 * Examples: Qdrant, Redis, Gemma4, Database
 */
function extractNouns(text) {
  const pattern = /\b[A-Z][a-z]+(?:[A-Z][a-z]+)*\b/g;
  return text.match(pattern) || [];
}

/**
 * Domain keywords: hardcoded set of technical/legal terms
 */
function extractKeywords(text) {
  const keywords = new Set([
    'retrieval', 'semantic', 'vector', 'embedding', 'search',
    'ranking', 'reranking', 'scoring', 'similarity',
    'cluster', 'clustering', 'topology', 'graph',
    'cache', 'memory', 'persistence',
    'auth', 'authentication', 'session', 'validation',
    'pipeline', 'indexing', 'processing',
    'feature', 'feature_id', 'label', 'summary',
    'SOM', 'PageRank', 'KAG', 'RAG', 'DAG',
    'legal', 'evidence', 'case', 'citation'
  ]);

  const found = new Set();
  const lowerText = text.toLowerCase();

  for (const keyword of keywords) {
    if (lowerText.includes(keyword)) {
      found.add(keyword);
    }
  }

  return Array.from(found);
}

/**
 * Deduplicate and normalize extracted terms (uppercase for env keys, lowercase otherwise)
 */
function normalizeTerms(terms) {
  const normalized = new Set();

  for (const term of terms) {
    // Env keys stay uppercase
    if (/^[A-Z][A-Z0-9_]*$/.test(term)) {
      normalized.add(term);
    } else {
      // Everything else lowercase
      normalized.add(term.toLowerCase());
    }
  }

  return Array.from(normalized).sort();
}

/**
 * Main extraction function
 */
function extractNounTerms(featureId, featureLabel, summary) {
  const envKeys = extractEnvKeys(`${featureId} ${featureLabel} ${summary}`);
  const symbols = extractSymbols(`${featureId} ${featureLabel} ${summary}`);
  const nouns = extractNouns(`${featureLabel} ${summary}`);
  const keywords = extractKeywords(`${featureId} ${featureLabel} ${summary}`);

  // Combine all terms
  const allTerms = [
    ...envKeys,
    ...symbols,
    ...nouns,
    ...keywords
  ];

  // Deduplicate and normalize
  return normalizeTerms(allTerms);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DATABASE OPERATIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const isApply = process.argv.includes('--apply');
  const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 1000;

  if (!isDryRun && !isApply) {
    console.error('Usage: node populate-feature-nouns.mjs [--dry-run|--apply] [--limit=N]');
    console.error('  --dry-run   : Preview changes without applying');
    console.error('  --apply     : Apply changes to database');
    console.error('  --limit=N   : Process max N features (default: 1000)');
    process.exit(1);
  }

  // Database connection
  const pool = new Pool({
    host: process.env.DATABASE_HOST || '127.0.0.1',
    port: parseInt(process.env.DATABASE_PORT || '5434'),
    user: process.env.DATABASE_USER || 'legal_admin',
    password: process.env.DATABASE_PASSWORD || '123456',
    database: process.env.DATABASE_NAME || 'legal_ai_db'
  });

  try {
    // Fetch features (note: no 'id' column, use feature_id + source_ref + symbol as composite key)
    const result = await pool.query(
      `SELECT feature_id, source_ref, symbol, ontology_label as feature_label, summary
       FROM code_features
       WHERE noun_terms IS NULL OR jsonb_array_length(noun_terms) = 0
       ORDER BY feature_id, source_ref, symbol
       LIMIT $1`,
      [limit]
    );

    const features = result.rows;
    console.log(`Found ${features.length} features with empty noun_terms`);

    if (features.length === 0) {
      console.log('✓ All features already have noun_terms populated');
      await pool.end();
      return;
    }

    // Extract nouns for each feature
    const updates = [];
    for (const feature of features) {
      const nounTerms = extractNounTerms(
        feature.feature_id || '',
        feature.feature_label || '',
        feature.summary || ''
      );

      updates.push({
        feature_id: feature.feature_id,
        source_ref: feature.source_ref,
        symbol: feature.symbol,
        noun_terms: nounTerms
      });
    }

    // Display preview
    console.log(`\n━━━ DRY-RUN PREVIEW ━━━`);
    updates.slice(0, 5).forEach(update => {
      console.log(`\n  Feature: ${update.feature_id}/${update.source_ref}`);
      console.log(`    Terms (${update.noun_terms.length}): ${update.noun_terms.slice(0, 5).join(', ')}${update.noun_terms.length > 5 ? `, (+${update.noun_terms.length - 5} more)` : ''}`);
    });

    if (updates.length > 5) {
      console.log(`\n  ... and ${updates.length - 5} more features`);
    }

    if (isDryRun) {
      console.log(`\n✓ Dry-run complete. To apply: node scripts/atlas/populate-feature-nouns.mjs --apply`);
      return;
    }

    // Apply updates
    if (isApply) {
      console.log(`\n━━━ APPLYING UPDATES ━━━`);
      let success = 0;
      let failed = 0;

      for (const update of updates) {
        try {
          await pool.query(
            `UPDATE code_features SET noun_terms = $1
             WHERE feature_id = $2 AND source_ref = $3 AND symbol = $4`,
            [JSON.stringify(update.noun_terms), update.feature_id, update.source_ref, update.symbol]
          );
          success++;
        } catch (err) {
          console.error(`✗ Failed to update feature ${update.feature_id}:`, err.message);
          failed++;
        }
      }

      console.log(`\n✓ Updated ${success}/${updates.length} features`);
      if (failed > 0) {
        console.log(`⚠ Failed: ${failed}`);
      }

      // Verify
      const verify = await pool.query(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN jsonb_array_length(noun_terms) > 0 THEN 1 ELSE 0 END) as populated
         FROM code_features`
      );

      const { total, populated } = verify.rows[0];
      console.log(`\nVerification: ${populated}/${total} features have noun_terms populated (${Math.round(100 * populated / total)}%)`);
    }

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
