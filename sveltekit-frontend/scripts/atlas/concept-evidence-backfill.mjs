#!/usr/bin/env node
/**
 * concept-evidence-backfill.mjs
 *
 * Backfill concept records and evidence cards into atlas_concept_labels table:
 * - Create or update concept definition records
 * - Populate evidence_cards JSON for each concept
 * - Backfill feature_id -> concept associations
 * - Validate all records before apply
 *
 * Dry-run by default. --apply to persist.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');

const APPLY_MODE = process.argv.includes('--apply');
const DRY_RUN = !APPLY_MODE;

// Canonical concept definitions
const CONCEPT_DEFINITIONS = {
  database_orm: {
    label: 'Database ORM',
    description: 'Object-Relational Mapping patterns, Drizzle ORM, schema definitions, migrations',
  },
  api_endpoints: {
    label: 'API Endpoints',
    description: 'RESTful endpoints, route handlers, request/response serialization, API contracts',
  },
  authentication: {
    label: 'Authentication',
    description: 'Login, session management, JWT, OAuth, authorization guards, Lucia',
  },
  caching_strategy: {
    label: 'Caching Strategy',
    description: 'Redis, Bifrost, TTL, cache invalidation, memoization, LRU caches',
  },
  error_handling: {
    label: 'Error Handling',
    description: 'Try-catch blocks, error boundaries, error recovery, graceful degradation',
  },
  state_management: {
    label: 'State Management',
    description: 'Svelte stores, runes, XState, state machines, reactive declarations',
  },
  file_processing: {
    label: 'File Processing',
    description: 'File uploads, document parsing, chunk extraction, OCR, text processing',
  },
  vector_search: {
    label: 'Vector Search',
    description: 'Embeddings, Qdrant, semantic search, similarity scoring, ANN retrieval',
  },
  async_operations: {
    label: 'Async Operations',
    description: 'Promises, async/await, concurrent operations, event loops, callbacks',
  },
  type_safety: {
    label: 'Type Safety',
    description: 'TypeScript, Zod validation, type inference, generic types, type guards',
  },
};

async function generateEvidenceCards(pool, conceptId) {
  // Generate sample evidence cards by querying packets related to this concept
  const cards = [];

  try {
    const res = await pool.query(
      `
      SELECT DISTINCT
        ap.source_ref,
        ap.feature_id,
        ap.summary,
        SUBSTRING(ap.summary, 1, 100) as snippet
      FROM atlas_packets ap
      WHERE ap.feature_id LIKE $1 OR ap.summary LIKE $2
      LIMIT 5
    `,
      [`%${conceptId}%`, `%${conceptId}%`]
    );

    for (const row of res.rows) {
      cards.push({
        source_ref: row.source_ref,
        feature_id: row.feature_id,
        snippet: row.snippet,
        relevance: 0.85,
      });
    }
  } catch (err) {
    console.warn(`  Could not generate evidence cards for ${conceptId}: ${err.message}`);
  }

  return cards;
}

async function main() {
  loadAtlasEnv(REPO_ROOT);
  const dbUrl = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
  const pool = new Pool({ connectionString: dbUrl, max: 1 });

  const startTime = Date.now();
  const report = {
    mode: APPLY_MODE ? 'apply' : 'dry-run',
    generated_at: new Date().toISOString(),
    concepts_to_backfill: Object.keys(CONCEPT_DEFINITIONS).length,
    concepts_created: 0,
    concepts_updated: 0,
    evidence_cards_generated: 0,
    feature_associations: 0,
    validation_errors: 0,
    gates_pass: false,
    ready_for_apply: false,
    errors: [],
  };

  try {
    console.log(`[concept-evidence-backfill] Starting backfill for ${report.concepts_to_backfill} concepts...`);

    const records = [];

    for (const [conceptId, definition] of Object.entries(CONCEPT_DEFINITIONS)) {
      console.log(`\n  Processing ${conceptId}...`);

      // Generate evidence cards
      const evidenceCards = await generateEvidenceCards(pool, conceptId);
      report.evidence_cards_generated += evidenceCards.length;

      // Query feature IDs associated with this concept
      const featureRes = await pool.query(
        `
        SELECT DISTINCT feature_id
        FROM atlas_packets
        WHERE feature_id LIKE $1 OR summary LIKE $2
        LIMIT 100
      `,
        [`%${conceptId}%`, `%${definition.description}%`]
      );

      const featureIds = featureRes.rows.map((r) => r.feature_id);
      report.feature_associations += featureIds.length;

      // Check if concept already exists
      const existRes = await pool.query(
        `
        SELECT concept_id FROM atlas_concept_labels WHERE concept_id = $1
      `,
        [conceptId]
      );

      const exists = existRes.rows.length > 0;

      // Validate record
      const validationErrors = [];
      if (!conceptId || !conceptId.trim()) validationErrors.push('Missing concept_id');
      if (!definition.label || !definition.label.trim()) validationErrors.push('Missing label');
      if (!definition.description || !definition.description.trim())
        validationErrors.push('Missing description');
      if (evidenceCards.length === 0) validationErrors.push('No evidence cards generated');

      if (validationErrors.length > 0) {
        report.validation_errors++;
        report.errors.push(`${conceptId}: ${validationErrors.join(', ')}`);
        console.log(`    ❌ Validation failed: ${validationErrors.join(', ')}`);
        continue;
      }

      records.push({
        concept_id: conceptId,
        label: definition.label,
        description: definition.description,
        evidence_cards: JSON.stringify(evidenceCards),
        feature_ids: featureIds,
        is_new: !exists,
      });

      console.log(`    ✅ ${evidenceCards.length} evidence cards, ${featureIds.length} feature associations`);
    }

    // Gate checks
    const succeededConcepts = records.length;
    const conceptCoverage = succeededConcepts / report.concepts_to_backfill;
    const evidenceAvg = report.evidence_cards_generated / Math.max(1, succeededConcepts);
    const featureAvg = report.feature_associations / Math.max(1, succeededConcepts);

    console.log(`\n[concept-evidence-backfill] Results:`);
    console.log(`  Concepts ready for backfill: ${succeededConcepts}/${report.concepts_to_backfill}`);
    console.log(`  Coverage: ${(conceptCoverage * 100).toFixed(1)}% (need ≥90%)`);
    console.log(`  Avg evidence cards per concept: ${evidenceAvg.toFixed(1)} (need ≥2)`);
    console.log(`  Avg feature associations per concept: ${featureAvg.toFixed(1)} (need ≥1)`);
    console.log(`  Validation errors: ${report.validation_errors}`);

    report.gates_pass =
      conceptCoverage >= 0.9 &&
      evidenceAvg >= 2 &&
      featureAvg >= 1 &&
      report.validation_errors === 0;

    report.ready_for_apply = report.gates_pass;

    if (APPLY_MODE && report.ready_for_apply) {
      console.log(`\n[concept-evidence-backfill] Applying ${records.length} records to DB...`);

      for (const record of records) {
        try {
          await pool.query(
            `
            INSERT INTO atlas_concept_labels (
              concept_id, label, description, evidence_cards, feature_ids
            )
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (concept_id) DO UPDATE SET
              label = EXCLUDED.label,
              description = EXCLUDED.description,
              evidence_cards = EXCLUDED.evidence_cards,
              feature_ids = EXCLUDED.feature_ids,
              updated_at = now()
          `,
            [
              record.concept_id,
              record.label,
              record.description,
              record.evidence_cards,
              record.feature_ids,
            ]
          );

          if (record.is_new) {
            report.concepts_created++;
          } else {
            report.concepts_updated++;
          }
        } catch (err) {
          console.warn(`  Error applying ${record.concept_id}: ${err.message}`);
          report.errors.push(`Apply failed for ${record.concept_id}: ${err.message}`);
        }
      }
    }

    // Write reports
    await fs.writeFile(
      path.join(REPORTS_DIR, 'concept-evidence-backfill-report.json'),
      JSON.stringify(report, null, 2)
    );

    const md = `# Concept Evidence Backfill Report

Generated: ${report.generated_at}
Mode: ${report.mode}

## Summary

- Concepts to backfill: ${report.concepts_to_backfill}
- Ready for backfill: ${records.length}
- Evidence cards generated: ${report.evidence_cards_generated}
- Feature associations: ${report.feature_associations}

## Coverage

- Concept coverage: ${((records.length / report.concepts_to_backfill) * 100).toFixed(1)}% (need ≥90%) ${(records.length / report.concepts_to_backfill) >= 0.9 ? '✅' : '❌'}
- Avg evidence cards: ${(report.evidence_cards_generated / Math.max(1, records.length)).toFixed(1)} (need ≥2) ${(report.evidence_cards_generated / Math.max(1, records.length)) >= 2 ? '✅' : '❌'}
- Avg feature associations: ${(report.feature_associations / Math.max(1, records.length)).toFixed(1)} (need ≥1) ${(report.feature_associations / Math.max(1, records.length)) >= 1 ? '✅' : '❌'}

## Status

- Validation Errors: ${report.validation_errors}
- Gates Pass: ${report.gates_pass ? '✅ YES' : '❌ NO'}
- Ready For Apply: ${report.ready_for_apply ? '✅ YES' : '❌ NO'}
${APPLY_MODE && report.ready_for_apply ? `- Created: ${report.concepts_created}, Updated: ${report.concepts_updated}` : ''}

## Errors

${report.errors.length > 0 ? report.errors.map((e) => `- ${e}`).join('\n') : 'None'}
`;

    await fs.writeFile(path.join(REPORTS_DIR, 'concept-evidence-backfill-report.md'), md);

    console.log(`\n[concept-evidence-backfill] Reports written to docs/reports/`);
    console.log(`\nGates: ${report.gates_pass ? '✅ PASS' : '❌ FAIL'}`);
  } catch (err) {
    report.errors.push(err.message);
    console.error(`[concept-evidence-backfill] Error: ${err.message}`);
  } finally {
    await pool.end();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nCompleted in ${duration}s`);
  }
}

await main();
