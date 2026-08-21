#!/usr/bin/env node
/**
 * Phase 108E Step 6.00: Discover Existing Sparse Implementations
 *
 * Searches the codebase for:
 * - Existing tokenizers (BM25, BM42, SparseVector, lexical_v1)
 * - Sparse encoders (miniCOIL, SPLADE, uniCOIL, lexical_v1)
 * - RRF implementations (reciprocal rank fusion)
 * - Qdrant sparse vectors (existing named vectors)
 * - Vocabulary tables (token registry, document frequency)
 * - Document frequency tables
 *
 * Goal: Prevent duplication and identify canonical owners
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..', '..', '..');

const SEARCH_TERMS = [
  'BM25',
  'BM42',
  'SparseVector',
  'sparse_vector',
  'sparse_vectors',
  'lexical_v1',
  'lexical-v1',
  'miniCOIL',
  'uniCOIL',
  'SPLADE',
  'RRF',
  'reciprocal_rank',
  'sparse_vocab',
  'document_frequency',
  'token_registry'
];

const EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage'
];

console.log('🔍 Phase 108E Step 00: Discover Existing Sparse Implementations');
console.log(`   Project root: ${PROJECT_ROOT}`);
console.log(`   Search terms: ${SEARCH_TERMS.length} keywords`);
console.log('');

const results = {
  existing_tokenizers: [],
  existing_sparse_encoders: [],
  existing_qdrant_sparse_vectors: [],
  existing_rrf_implementations: [],
  existing_vocabulary_tables: [],
  existing_document_frequency_tables: [],
  search_term_hits: {},
  file_count: 0,
  error_count: 0
};

// Search for each term
for (const term of SEARCH_TERMS) {
  try {
    const excludeFlags = EXCLUDE_PATTERNS.map(p => `--glob !**/${p}/**`).join(' ');
    const cmd = `rg -i "${term}" ${excludeFlags} --files-with-matches --glob "*.ts" --glob "*.js" --glob "*.mjs" "${PROJECT_ROOT}" 2>NUL`;

    const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    const files = output.trim().split('\n').filter(Boolean);

    if (files.length > 0) {
      results.search_term_hits[term] = files;
      results.file_count += files.length;
      console.log(`  ✓ "${term}": ${files.length} file(s)`);

      // Sample output: show first 3 files per term
      files.slice(0, 3).forEach(file => {
        const rel = path.relative(PROJECT_ROOT, file);
        console.log(`    - ${rel}`);
      });
      if (files.length > 3) console.log(`    ... and ${files.length - 3} more`);
    }
  } catch (err) {
    // rg exits 1 for a clean no-match search; only count actual search errors.
    if (err?.status !== 1) results.error_count++;
  }
}

console.log('');
console.log('📊 Discovery Summary:');
console.log(`   Total files with sparse keywords: ${results.file_count}`);
console.log(`   Search errors: ${results.error_count}`);
console.log('');

// Specific checks for canonical locations
console.log('🔎 Checking canonical locations:');

const canonicalPaths = [
  'scripts/atlas/phase108e-step6-sparse-bm42-backfill.mjs',
  'sveltekit-frontend/src/lib/server/retrieval/unified-orchestrator.ts',
  'sveltekit-frontend/scripts/atlas/phase108e-step*.mjs'
];

for (const pathPattern of canonicalPaths) {
  const normalized = pathPattern.replaceAll('\\', '/');
  if (normalized.includes('*')) {
    const prefix = normalized.slice(0, normalized.indexOf('*'));
    const directory = path.join(PROJECT_ROOT, prefix).replace(/[\\/]$/, '');
    if (fs.existsSync(directory)) {
      const matches = fs.readdirSync(directory)
        .filter((entry) => entry.endsWith('.mjs'))
        .map((entry) => path.join(prefix, entry).replaceAll('\\', '/'));
      for (const match of matches) {
        console.log(`   ✓ Found: ${match}`);
        results.existing_tokenizers.push(match);
      }
    }
    continue;
  }
  const fullPath = path.join(PROJECT_ROOT, normalized);
  if (fs.existsSync(fullPath)) {
    console.log(`   ✓ Found: ${normalized}`);
    results.existing_tokenizers.push(normalized);
  }
}

console.log('');
console.log('⚠️  Recommendations:');

if (results.file_count === 0) {
  console.log('   → No existing sparse implementations found');
  console.log('   → Safe to create new lexical_v1 vocabulary + encoder');
} else {
  console.log(`   → Found ${results.file_count} file(s) with sparse-related keywords`);
  console.log('   → Review hit files before creating competing implementations');
  console.log('   → Consolidate if multiple tokenizers exist');
}

console.log('');
console.log('📝 Full report saved to: tmp/atlas/discovery/00-existing-sparse.json');

// Save full report
const reportDir = path.join(PROJECT_ROOT, 'tmp', 'atlas', 'discovery');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(
  path.join(reportDir, '00-existing-sparse.json'),
  JSON.stringify(results, null, 2)
);

console.log('✅ Discovery complete');
process.exit(results.error_count === 0 ? 0 : 1);
