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
import { spawn } from 'child_process';

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

/**
 * Check if spaCy is available via Python
 */
async function checkSpaCyAvailable() {
  return new Promise((resolve) => {
    const proc = spawn('python3', ['-c', 'import spacy; print(spacy.__version__)'], {
      timeout: 5000,
    });

    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        resolve(false);
      }
    });

    proc.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Extract lexical features using spaCy
 */
async function extractLexicalFeatures(text) {
  return new Promise((resolve, reject) => {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      resolve({
        nouns: [],
        properNouns: [],
        verbs: [],
        nounPhrases: [],
        modifiers: [],
        lemmas: [],
      });
      return;
    }

    // Truncate to 1000 chars to avoid overwhelming spaCy
    const truncated = text.substring(0, 1000);

    const pythonCode = `
import spacy
import json
import sys

try:
    nlp = spacy.load('en_core_web_sm')
    doc = nlp("""${truncated.replace(/"/g, '\\"').replace(/\n/g, ' ')}""")

    nouns = [token.text for token in doc if token.pos_ == 'NOUN']
    proper_nouns = [token.text for token in doc if token.pos_ == 'PROPN']
    verbs = [token.text for token in doc if token.pos_ == 'VERB']
    noun_phrases = [chunk.text for chunk in doc.noun_chunks]
    modifiers = [token.text for token in doc if token.pos_ in ['ADJ', 'ADV']]
    lemmas = [token.lemma_ for token in doc if token.pos_ in ['NOUN', 'VERB', 'ADJ']]

    result = {
        'nouns': list(set(nouns)),
        'proper_nouns': list(set(proper_nouns)),
        'verbs': list(set(verbs)),
        'noun_phrases': list(set(noun_phrases)),
        'modifiers': list(set(modifiers)),
        'lemmas': list(set(lemmas))
    }

    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;

    const proc = spawn('python3', ['-c', pythonCode], {
      timeout: 10000,
      maxBuffer: 10 * 1024 * 1024,
    });

    let output = '';
    let errorOutput = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 && output) {
        try {
          const result = JSON.parse(output);
          if (result.error) {
            resolve({
              nouns: [],
              properNouns: [],
              verbs: [],
              nounPhrases: [],
              modifiers: [],
              lemmas: [],
            });
          } else {
            resolve({
              nouns: result.nouns || [],
              properNouns: result.proper_nouns || [],
              verbs: result.verbs || [],
              nounPhrases: result.noun_phrases || [],
              modifiers: result.modifiers || [],
              lemmas: result.lemmas || [],
            });
          }
        } catch (e) {
          if (VERBOSE) console.error(`  ❌ JSON parse error: ${e.message}`);
          resolve({
            nouns: [],
            properNouns: [],
            verbs: [],
            nounPhrases: [],
            modifiers: [],
            lemmas: [],
          });
        }
      } else {
        if (VERBOSE && errorOutput) console.error(`  ❌ spaCy error: ${errorOutput}`);
        resolve({
          nouns: [],
          properNouns: [],
          verbs: [],
          nounPhrases: [],
          modifiers: [],
          lemmas: [],
        });
      }
    });

    proc.on('error', (err) => {
      if (VERBOSE) console.error(`  ❌ Process error: ${err.message}`);
      resolve({
        nouns: [],
        properNouns: [],
        verbs: [],
        nounPhrases: [],
        modifiers: [],
        lemmas: [],
      });
    });
  });
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

    for (const packet of batch) {
      try {
        const features = await extractLexicalFeatures(packet.summary);

        // Map spaCy output to the live schema
        const contentHash = require('crypto')
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
            { spacy_extracted: true, nouns: features.nouns, verbs: features.verbs }
          ]
        );

        extracted++;
      } catch (err) {
        if (VERBOSE) {
          console.error(`   ❌ Error extracting ${packet.packet_key}: ${err.message}`);
        }
        errors++;
      }
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

  const res = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN nouns IS NOT NULL THEN 1 END) as with_nouns,
      COUNT(CASE WHEN verbs IS NOT NULL THEN 1 END) as with_verbs,
      COUNT(CASE WHEN noun_phrases IS NOT NULL THEN 1 END) as with_phrases
    FROM feature_lexical_facts
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
