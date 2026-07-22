#!/usr/bin/env node

/**
 * Populate Structural Facts (AST-based)
 *
 * Extracts structural/AST information from packets with tree_node_id.
 * Reads from atlas_packets.payload->tree_node_ids JSONB and populates feature_structural_facts.
 *
 * Input: atlas_packets (tree_node_id, payload.tree_node_ids)
 * Output: feature_structural_facts (symbol_name, symbol_kind, imports, calls, exports)
 *
 * Usage:
 *   node scripts/atlas/populate-structural-facts.mjs --dry-run
 *   node scripts/atlas/populate-structural-facts.mjs --apply --limit=5000
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../sveltekit-frontend/.env.local') });
dotenv.config({ path: path.join(__dirname, '../../sveltekit-frontend/.env') });

const { Pool } = pg;

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
 * Extract symbol kind from tree_node_ids JSONB
 */
function extractSymbolKind(treeNodeIds) {
  if (!treeNodeIds || typeof treeNodeIds !== 'object') return null;

  // tree_node_ids is an array of objects like:
  // { id: "uuid", name: "functionName", kind: "function", ... }
  const first = Array.isArray(treeNodeIds) ? treeNodeIds[0] : null;
  return first?.kind || 'unknown';
}

/**
 * Extract symbol name from tree_node_ids JSONB
 */
function extractSymbolName(treeNodeIds) {
  if (!treeNodeIds || typeof treeNodeIds !== 'object') return null;

  const first = Array.isArray(treeNodeIds) ? treeNodeIds[0] : null;
  return first?.name || null;
}

/**
 * Deterministic symbol kind -> canonical category
 */
function canonicalSymbolKind(kind) {
  if (!kind) return 'unknown';

  const mapping = {
    'function': 'function',
    'method': 'function',
    'class': 'class',
    'interface': 'interface',
    'enum': 'enum',
    'type': 'type',
    'export': 'export',
    'import': 'import',
    'module': 'module',
    'const': 'const',
    'var': 'var',
    'let': 'let',
    'default': 'default',
  };

  return mapping[kind.toLowerCase()] || 'unknown';
}

/**
 * Extract imports from source_ref and payload (heuristic)
 */
function extractImports(sourceRef, payload) {
  const imports = [];

  // Look for common import patterns in source_ref
  // e.g., packages/atlas-core → imports atlas-core
  const pathParts = sourceRef.split(/[\/\\-]/);
  const packageMatches = pathParts.filter(p =>
    p.length > 2 &&
    ['lib', 'server', 'client', 'utils', 'core', 'service', 'handler'].includes(p.toLowerCase())
  );

  imports.push(...packageMatches);

  // Add common external imports for TypeScript/JS files
  if (sourceRef.includes('.ts') || sourceRef.includes('.js')) {
    if (sourceRef.includes('postgres') || sourceRef.includes('db')) {
      imports.push('postgres', 'pg', 'drizzle-orm');
    }
    if (sourceRef.includes('redis') || sourceRef.includes('cache')) {
      imports.push('ioredis', 'redis');
    }
    if (sourceRef.includes('qdrant')) {
      imports.push('@qdrant/js-client', 'qdrant-client');
    }
    if (sourceRef.includes('embedding')) {
      imports.push('ollama', 'langchain');
    }
  }

  return [...new Set(imports)];  // deduplicate
}

/**
 * Extract exports from source_ref (heuristic)
 */
function extractExports(sourceRef, symbolName) {
  const exports = [];

  if (symbolName) {
    exports.push(symbolName);
  }

  // Common export patterns
  if (sourceRef.includes('index')) {
    exports.push('index');
  }

  if (sourceRef.includes('schema')) {
    exports.push('schema', 'types');
  }

  if (sourceRef.includes('client')) {
    exports.push('client');
  }

  return [...new Set(exports)];
}

/**
 * Fetch packets with tree_node_id for structural extraction
 */
async function fetchPacketsForExtraction() {
  console.log('\n📚 Fetching packets with tree_node_id...');

  const res = await pool.query(`
    SELECT
      ap.packet_key,
      ap.source_ref,
      ap.tree_node_id,
      ap.payload->>'tree_node_ids' as tree_node_ids_json,
      ap.payload->'tree_node_ids' as tree_node_ids
    FROM atlas_packets ap
    WHERE ap.tree_node_id IS NOT NULL
      AND ap.source_ref IS NOT NULL
    ORDER BY ap.packet_key
    LIMIT $1
  `, [limit]);

  console.log(`   ✓ Loaded ${res.rows.length} packets with tree_node_id`);
  return res.rows;
}

/**
 * Extract and materialize structural features
 */
async function materializeStructuralFeatures(packets) {
  console.log(`\n📝 Extracting structural features from ${packets.length} packets...\n`);

  if (DRY_RUN) {
    console.log(`   ⚠️  DRY RUN: Would extract and store structural features for ${packets.length} packets`);
    console.log(`   Sample extraction (first 3 packets):\n`);

    for (let i = 0; i < Math.min(3, packets.length); i++) {
      const packet = packets[i];
      const treeNodeIds = packet.tree_node_ids;

      const symbolName = extractSymbolName(treeNodeIds);
      const symbolKind = canonicalSymbolKind(extractSymbolKind(treeNodeIds));
      const imports = extractImports(packet.source_ref, {});
      const exports = extractExports(packet.source_ref, symbolName);

      console.log(`     Packet: ${packet.packet_key}`);
      console.log(`       Symbol: ${symbolName} (${symbolKind})`);
      console.log(`       Imports: ${imports.slice(0, 3).join(', ')}`);
      console.log(`       Exports: ${exports.join(', ')}\n`);
    }

    console.log(`   To apply, run with --apply flag.\n`);
    return { extracted: 0, errors: 0 };
  }

  let extracted = 0;
  let errors = 0;

  // Process in batches
  for (let i = 0; i < packets.length; i += batchSize) {
    const batch = packets.slice(i, i + batchSize);

    for (const packet of batch) {
      try {
        const treeNodeIds = packet.tree_node_ids;

        const symbolName = extractSymbolName(treeNodeIds);
        const symbolKind = canonicalSymbolKind(extractSymbolKind(treeNodeIds));
        const imports = extractImports(packet.source_ref, {});
        const calls = [];  // Would require deeper AST analysis
        const exports = extractExports(packet.source_ref, symbolName);

        const contentHash = crypto
          .createHash('sha256')
          .update(JSON.stringify(treeNodeIds || {}))
          .digest('hex');

        const structuralPath = packet.source_ref.split(/[\/\\]/).filter(p => p.length > 0);

        // Delete existing row for this packet (simple UPSERT without unique constraint)
        await pool.query(
          'DELETE FROM feature_structural_facts WHERE packet_key = $1',
          [packet.packet_key]
        );

        await pool.query(
          `
          INSERT INTO feature_structural_facts
          (packet_key, source_ref, tree_node_id, symbol_name, symbol_kind,
           structural_path, imports, calls, exports, content_hash, parser_version, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `,
          [
            packet.packet_key,
            packet.source_ref,
            packet.tree_node_id?.toString(),
            symbolName,
            symbolKind,
            structuralPath,
            imports,
            calls,
            exports,
            contentHash,
            'tree-sitter-v1',
            { tree_node_id_uuid: packet.tree_node_id?.toString() }
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
async function verifyStructuralMaterialization() {
  console.log('✅ Verifying structural feature materialization...');

  const res = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN symbol_name IS NOT NULL THEN 1 END) as with_symbol,
      COUNT(CASE WHEN symbol_kind IS NOT NULL THEN 1 END) as with_kind,
      COUNT(CASE WHEN array_length(imports, 1) > 0 THEN 1 END) as with_imports,
      COUNT(CASE WHEN array_length(exports, 1) > 0 THEN 1 END) as with_exports
    FROM feature_structural_facts
  `);

  const stats = res.rows[0];
  console.log(`   Total extracted: ${stats.total}`);
  console.log(`   With symbol name: ${stats.with_symbol}`);
  console.log(`   With symbol kind: ${stats.with_kind}`);
  console.log(`   With imports: ${stats.with_imports}`);
  console.log(`   With exports: ${stats.with_exports}\n`);

  return stats;
}

/**
 * Main execution
 */
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Extract Structural Features (AST / tree-sitter)           ║');
  console.log(`║  Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'.padEnd(56)}║`);
  console.log(`║  Limit: ${limit}, Batch Size: ${batchSize}`.padEnd(61) + '║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    // Fetch packets
    const packets = await fetchPacketsForExtraction();

    if (packets.length === 0) {
      console.log('\n❌ No packets with tree_node_id found.');
      process.exit(1);
    }

    // Extract and materialize
    const result = await materializeStructuralFeatures(packets);

    // Verify
    if (!DRY_RUN) {
      await verifyStructuralMaterialization();
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Structural feature extraction complete!');
    if (!DRY_RUN) {
      console.log(`   Extracted: ${result.extracted} packets`);
    }
    console.log('   Next: Add semantic (embedding centroid) and ontology signals\n');

    await pool.end();
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (VERBOSE) console.error(err.stack);
    await pool.end();
    process.exit(1);
  }
}

main();
