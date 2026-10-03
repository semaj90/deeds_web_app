#!/usr/bin/env node

/**
 * Extract Lexical Features (POS tagging, lemmas, noun phrases)
 *
 * Populates feature_lexical_facts with NLP-derived features from prose fields.
 * Uses spaCy as a Python sidecar for linguistic analysis.
 *
 * Input: atlas_packets (summary, comments, etc.)
 * Output: feature_lexical_facts (nouns, verbs, noun phrases, etc.)
 *
 * Usage:
 *   node scripts/atlas/extract-lexical-features.mjs --dry-run
 *   node scripts/atlas/extract-lexical-features.mjs --apply --limit=100
 *   node scripts/atlas/extract-lexical-features.mjs --apply --batch-size=50
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../sveltekit-frontend/.env.local') });
dotenv.config({ path: path.join(__dirname, '../../sveltekit-frontend/.env') });

const { Pool } = pg;

// CLI arguments
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;
const VERBOSE = args.includes('--verbose');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 1000;
const batchSizeArg = args.find(a => a.startsWith('--batch-size='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 50;

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  user: 'legal_admin',
  password: '123456',
  database: 'legal_ai_db',
});

// Found live 2026-09-13: this script previously spawned a brand-new `python3` process per row
// with an inline heredoc-style script, reloading spaCy's model from scratch every call (~1-2s
// startup cost per row -- explains why extractor_version='spacy-nlp-v1' had zero rows live
// despite the code existing since an earlier session: it never finished a real run at scale).
// The live miniforge-nlp-sidecar (docker/miniforge-nlp-sidecar, port 8095) already keeps a spaCy
// model warm in-process for its own /analyze endpoint's named-entity extraction -- reusing it via
// one HTTP call per row is both correct (per this repo's Duplication Prevention rule: don't spin
// up a second Python NLP process when a live one already exists) and dramatically cheaper (no
// process spawn, no model reload).
const NLP_SIDECAR_URL = process.env.MINIFORGE_SIDECAR_URL ?? 'http://127.0.0.1:8095';

async function checkSpaCyAvailable() {
  try {
    const res = await fetch(`${NLP_SIDECAR_URL}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.capabilities?.spacy === true;
  } catch {
    return false;
  }
}

/**
 * Extract lexical features via the live NLP sidecar's /pos endpoint (real spaCy POS tagging,
 * not a per-call Python subprocess).
 */
async function extractLexicalFeatures(text) {
  const empty = { nouns: [], properNouns: [], verbs: [], nounPhrases: [], modifiers: [], lemmas: [], adjectives: [], adverbs: [] };
  if (!text || typeof text !== 'string' || text.trim().length === 0) return empty;

  // Truncate to 1000 chars to keep per-row latency bounded (matches this script's original limit).
  const truncated = text.slice(0, 1000);

  try {
    const res = await fetch(`${NLP_SIDECAR_URL}/pos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: truncated }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      if (VERBOSE) console.error(`  ❌ NLP sidecar /pos returned ${res.status}`);
      return empty;
    }
    const result = await res.json();
    if (result.source === 'unavailable') return empty;
    return {
      nouns: result.nouns ?? [],
      properNouns: result.proper_nouns ?? [],
      verbs: result.verbs ?? [],
      nounPhrases: result.noun_phrases ?? [],
      // `modifiers` (adjectives+adverbs combined) keeps `keywords` unchanged for existing
      // consumers; `adjectives`/`adverbs` are ALSO kept separately below -- found live
      // 2026-09-13: the ACE packet envelope's `lexical_adverbs_ly` field (real, schema'd,
      // msgpack-tagged, but never fed real data end-to-end) needs pure adverbs, not a combined
      // adjective+adverb blob.
      modifiers: [...(result.adjectives ?? []), ...(result.adverbs ?? [])],
      lemmas: result.lemmas ?? [],
      adjectives: result.adjectives ?? [],
      adverbs: result.adverbs ?? [],
    };
  } catch (err) {
    if (VERBOSE) console.error(`  ❌ NLP sidecar request failed: ${err.message}`);
    return empty;
  }
}

// Real named-entity extraction, added 2026-09-13. Found live: `atlas_packet_features.entities`
// (19.4% populated, 11,990 rows) was NOT real entity data -- 100% of sampled values were
// AST-symbol-shaped strings (`fn:`, `var:`, `export:`, `class:`, `method:` prefixes), written by
// some earlier extraction pass into the wrong column. No real PERSON/ORG/DATE/MONEY/LAW
// extraction had ever run. Reuses the sidecar's existing `/analyze` endpoint (already correctly
// combines `_spacy_entities()` + `_regex_entities()` -- no new endpoint needed, matches the
// Duplication Prevention rule) rather than the flat `fn:`/`var:` vocabulary that was there before.
async function extractEntities(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) return [];
  const truncated = text.slice(0, 1000);
  try {
    const res = await fetch(`${NLP_SIDECAR_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: truncated, source_type: 'plain_text' }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      if (VERBOSE) console.error(`  ❌ NLP sidecar /analyze returned ${res.status}`);
      return [];
    }
    const result = await res.json();
    const entities = Array.isArray(result.entities) ? result.entities : [];
    return [...new Set(entities.map((e) => `${e.label}:${e.text}`.trim()).filter(Boolean))].slice(0, 128);
  } catch (err) {
    if (VERBOSE) console.error(`  ❌ Entity extraction failed: ${err.message}`);
    return [];
  }
}

/**
 * Fetch packets needing lexical feature extraction
 */
async function fetchPacketsForExtraction() {
  console.log('\n📚 Fetching packets for lexical extraction...');

  const res = await pool.query(`
    SELECT
      ap.packet_key,
      ap.source_ref,
      COALESCE(ap.summary, '') as summary,
      COALESCE(ap.payload->>'title', '') as title
    FROM atlas_packets ap
    WHERE ap.packet_key IS NOT NULL
      AND ap.source_ref IS NOT NULL
      AND (ap.summary IS NOT NULL OR ap.payload->>'title' IS NOT NULL)
    ORDER BY ap.packet_key
    LIMIT $1
  `, [limit]);

  console.log(`   ✓ Loaded ${res.rows.length} packets with prose content`);
  return res.rows;
}

/**
 * Extract and materialize lexical features
 */
async function materializeLexicalFeatures(packets) {
  console.log(`\n📝 Extracting lexical features from ${packets.length} packets...\n`);

  if (DRY_RUN) {
    console.log(`   ⚠️  DRY RUN: Would extract and store lexical features for ${packets.length} packets`);
    console.log(`   Sample extraction (first packet):`);

    if (packets.length > 0) {
      const features = await extractLexicalFeatures(packets[0].summary);
      console.log(`     Packet: ${packets[0].packet_key}`);
      console.log(`     Nouns: ${features.nouns.slice(0, 5).join(', ')}`);
      console.log(`     Verbs: ${features.verbs.slice(0, 5).join(', ')}`);
      console.log(`     Noun phrases: ${features.nounPhrases.slice(0, 3).join(', ')}`);
    }
    console.log(`\n   To apply, run with --apply flag.\n`);
    return { extracted: 0, errors: 0 };
  }

  let extracted = 0;
  let errors = 0;

  // Process in batches
  for (let i = 0; i < packets.length; i += batchSize) {
    const batch = packets.slice(i, i + batchSize);

    // Concurrent within each batch (bounded by batchSize) -- same I/O-bound-loop lesson as
    // scripts/atlas/backfill-ast-symbols.mjs's earlier fix this session: an HTTP round-trip to
    // the NLP sidecar per row, awaited sequentially, wastes most of the wall-clock time waiting,
    // not computing. pg's Pool already supports concurrent queries safely.
    const results = await Promise.allSettled(batch.map(async (packet) => {
      try {
        const [features, entities] = await Promise.all([
          extractLexicalFeatures(packet.summary),
          extractEntities(packet.summary),
        ]);

        // Map spaCy output to the live schema. Fixed 2026-09-13: this used `require('crypto')`
        // inside an ESM (.mjs) module, which always throws `require is not defined` -- the real
        // reason this script had never successfully written a row before this session.
        const contentHash = crypto
          .createHash('sha256')
          .update(packet.summary || '')
          .digest('hex');

        const keywords = [
          ...features.nouns,
          ...features.properNouns,
          ...features.verbs,
          ...features.modifiers
        ];

        const identifiers = features.nounPhrases;
        const symbols = [...features.lemmas, ...features.verbs];

        await pool.query(
          `
          INSERT INTO feature_lexical_facts
          (packet_key, source_ref, keywords, identifiers, symbols, imported_modules,
           lexical_summary, content_hash, extractor_version, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (packet_key, extractor_version, content_hash) DO UPDATE SET
            keywords = $3,
            identifiers = $4,
            symbols = $5,
            imported_modules = $6,
            lexical_summary = $7,
            metadata = $10
          `,
          [
            packet.packet_key,
            packet.source_ref,
            keywords,
            identifiers,
            symbols,
            [],  // imported_modules (not extracted by spaCy)
            `nouns: ${features.nouns.length}, verbs: ${features.verbs.length}, phrases: ${features.nounPhrases.length}`,
            contentHash,
            'spacy-nlp-v1',
            {
              spacy_extracted: true,
              nouns: features.nouns,
              verbs: features.verbs,
              adjectives: features.adjectives,
              adverbs: features.adverbs,
            }
          ]
        );

        if (entities.length > 0) {
          await pool.query(
            `
            INSERT INTO atlas_packet_features (packet_key, entities, updated_at)
            VALUES ($1, $2::text[], NOW())
            ON CONFLICT (packet_key) DO UPDATE SET
              entities = EXCLUDED.entities,
              updated_at = NOW()
            WHERE atlas_packet_features.entities IS DISTINCT FROM EXCLUDED.entities
            `,
            [packet.packet_key, entities],
          );
        }

        return true;
      } catch (err) {
        if (VERBOSE) {
          console.error(`   ❌ Error extracting ${packet.packet_key}: ${err.message}`);
        }
        return false;
      }
    }));
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) extracted++;
      else errors++;
    }

    // Progress indicator
    const progress = Math.min(i + batchSize, packets.length);
    console.log(`   Progress: ${progress} / ${packets.length}`);
  }

  console.log(`\n   ✓ Extracted: ${extracted}, Errors: ${errors}\n`);
  return { extracted, errors };
}

/**
 * Verify materialization
 */
async function verifyLexicalMaterialization() {
  console.log('✅ Verifying lexical feature materialization...');

  // Fixed 2026-09-13: this query referenced `nouns`/`verbs`/`noun_phrases` as top-level columns --
  // feature_lexical_facts has no such columns (verified live via \d). The real spaCy-derived
  // fields are folded into `keywords`/`identifiers` (see the INSERT below) plus a `nouns`/`verbs`
  // breakout inside the `metadata` jsonb column. This function had never actually been run
  // against a populated table before (extractor_version='spacy-nlp-v1' had zero rows), so the
  // bug was never hit in practice.
  const res = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN metadata->'nouns' IS NOT NULL THEN 1 END) as with_nouns,
      COUNT(CASE WHEN metadata->'verbs' IS NOT NULL THEN 1 END) as with_verbs,
      COUNT(CASE WHEN array_length(identifiers, 1) > 0 THEN 1 END) as with_phrases
    FROM feature_lexical_facts
    WHERE extractor_version = 'spacy-nlp-v1'
  `);

  const stats = res.rows[0];
  console.log(`   Total extracted: ${stats.total}`);
  console.log(`   With nouns: ${stats.with_nouns}`);
  console.log(`   With verbs: ${stats.with_verbs}`);
  console.log(`   With noun phrases: ${stats.with_phrases}\n`);

  return stats;
}

/**
 * Main execution
 */
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Extract Lexical Features (POS Tagging & Lemmatization)   ║');
  console.log(`║  Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'.padEnd(56)}║`);
  console.log(`║  Limit: ${limit}, Batch Size: ${batchSize}`.padEnd(61) + '║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    // Check spaCy availability
    const spaCyAvailable = await checkSpaCyAvailable();
    if (!spaCyAvailable) {
      console.log('\n⚠️  spaCy not available. Install with: pip install spacy');
      console.log('   Then download model: python -m spacy download en_core_web_sm\n');
      process.exit(1);
    }

    console.log('\n✓ spaCy available\n');

    // Fetch packets
    const packets = await fetchPacketsForExtraction();

    if (packets.length === 0) {
      console.log('\n❌ No packets with prose content found.');
      process.exit(1);
    }

    // Extract and materialize
    const result = await materializeLexicalFeatures(packets);

    // Verify
    if (!DRY_RUN) {
      await verifyLexicalMaterialization();
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Lexical feature extraction complete!');
    if (!DRY_RUN) {
      console.log(`   Extracted: ${result.extracted} packets`);
    }
    console.log('   Next: Add deterministic path/glossary signals\n');

    await pool.end();
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (VERBOSE) console.error(err.stack);
    await pool.end();
    process.exit(1);
  }
}

main();
