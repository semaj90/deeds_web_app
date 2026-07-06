#!/usr/bin/env node
/**
 * Phase 2A: AST-Grep Synthetic Key Fix (CRITICAL PATH)
 *
 * PROBLEM: phase1-ast-grep-extraction.mjs created synthetic packet_keys like 'codebase:src/...'
 * which don't exist in atlas_packets, causing orphaned rows in atlas_packet_features.
 *
 * SOLUTION: Map source_ref from atlas_packets to real packet_key values.
 * For each packet in atlas_packets that has ast_symbols extracted,
 * verify the packet_key exists and write the symbols to atlas_packet_features.
 *
 * INPUT:  atlas_packets (canonical identity)
 * OUTPUT: atlas_packet_features.ast_symbols (with real packet_key references)
 *
 * This unblocks LAYER 2 feature extraction (lexical, entities, etc.)
 * and enables downstream phases (LangExtract, Naive Bayes, etc.)
 *
 * Usage:
 *   npm run atlas:phase2a:ast-grep-fix:dry --limit=100
 *   npm run atlas:phase2a:ast-grep-fix:apply --limit=10000
 */

import pg from 'pg';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve repo root: scripts/atlas/phase2a-... → repo root (3 levels up: atlas → scripts → sveltekit-frontend → repo)
// BUT: We're running from sveltekit-frontend, so __dirname is sveltekit-frontend/scripts/atlas
let repoRoot = path.resolve(__dirname, '../../..');
// Verify and fallback
if (!fs.existsSync(path.join(repoRoot, 'sveltekit-frontend')) && !fs.existsSync(path.join(repoRoot, 'claude-mem'))) {
  // Last resort: manually construct from known location
  repoRoot = 'C:\\Users\\james\\Videos\\deeds-web-app';
}

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const isVerbose = process.argv.includes('--verbose') || process.argv.includes('-v');
const limit = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? '10000'
);

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  database: 'legal_ai_db',
  user: 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

/**
 * Extract AST symbols using ast-grep
 * Returns array of symbols: function names, class names, imports, exports, key identifiers
 * filePath should be an absolute path to an existing file
 */
async function extractAstSymbols(filePath) {
  // Verify file exists
  if (!fs.existsSync(filePath)) {
    if (isVerbose) console.log(`    [SKIP] File not found: ${filePath}`);
    return [];
  }

  try {
    const symbols = new Set();
    const resolvedPath = path.resolve(filePath);

    // 1. Extract function names (export function, async function, etc.)
    try {
      const funcResult = execSync(
        `ast-grep --pattern 'function $NAME($$$) {$$$}' "${resolvedPath}" 2>/dev/null || true`,
        { encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 }
      );
      const funcMatches = funcResult.match(/function\s+(\w+)/g) || [];
      funcMatches.forEach(m => {
        const name = m.replace('function ', '').trim();
        if (name.length > 1 && name.length < 128) symbols.add(name);
      });
    } catch (e) {
      // continue
    }

    // 2. Extract class names
    try {
      const classResult = execSync(
        `ast-grep --pattern 'class $NAME {$$$}' "${resolvedPath}" 2>/dev/null || true`,
        { encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 }
      );
      const classMatches = classResult.match(/class\s+(\w+)/g) || [];
      classMatches.forEach(m => {
        const name = m.replace('class ', '').trim();
        if (name.length > 1 && name.length < 128) symbols.add(name);
      });
    } catch (e) {
      // continue
    }

    // 3. Extract exports (export const X, export function X, export { X, Y, Z })
    try {
      const content = fs.readFileSync(resolvedPath, 'utf-8');

      // export { A, B, C }
      const exportListMatches = content.match(/export\s*\{\s*([^}]+)\s*\}/g) || [];
      exportListMatches.forEach(m => {
        const items = m.replace(/export\s*\{/, '').replace(/\}/, '').split(',');
        items.forEach(item => {
          const name = item.trim().split(/\s+/)[0]; // get first word (handle "as" renames)
          if (name && name.length > 1 && name.length < 128 && /^\w+$/.test(name)) {
            symbols.add(name);
          }
        });
      });

      // export const X = ..., export function X, export class X
      const exportDefMatches = content.match(/export\s+(?:const|let|function|class|async\s+function|type|interface)\s+(\w+)/g) || [];
      exportDefMatches.forEach(m => {
        const name = m.match(/(\w+)$/)[1];
        if (name.length > 1 && name.length < 128) symbols.add(name);
      });
    } catch (e) {
      // continue
    }

    // 4. Extract imports (import { A, B } from '...')
    try {
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      const importMatches = content.match(/import\s+(?:\{[^}]+\}|(?:type\s+)?(?:\w+))/g) || [];
      importMatches.forEach(m => {
        const items = m.replace(/import\s+(?:type\s+)?/, '').replace(/\{/, '').replace(/\}/, '').split(',');
        items.forEach(item => {
          const name = item.trim().split(/\s+/)[0];
          if (name && name.length > 1 && name.length < 128 && /^\w+$/.test(name) && name !== 'from') {
            symbols.add(name);
          }
        });
      });
    } catch (e) {
      // continue
    }

    // 5. Extract key identifiers from variable declarations
    try {
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      // const X = ..., let Y = ..., type T = ..., interface I
      const varMatches = content.match(/(?:const|let|var|type|interface)\s+(\w+)/g) || [];
      varMatches.forEach(m => {
        const name = m.match(/(\w+)$/)[1];
        if (name.length > 2 && name.length < 128 && !/^(?:const|let|var|type|interface)$/.test(name)) {
          symbols.add(name);
        }
      });
    } catch (e) {
      // continue
    }

    return Array.from(symbols)
      .filter(s => s.length > 1 && s.length < 128)
      .slice(0, 100); // Limit to 100 symbols per file
  } catch (e) {
    if (isVerbose) console.error(`    ⚠️  Error extracting symbols from ${filePath}:`, e.message);
    return [];
  }
}

async function main() {
  console.log(`\n🔧 Phase 2A: AST-Grep Synthetic Key Fix [${isDryRun ? 'DRY-RUN' : 'APPLY'}]\n`);

  const client = await pool.connect();

  try {
    // Step 1: Query code file packets from atlas_packets (canonical identity)
    console.log('📦 Step 1: Query code file packets from atlas_packets...');

    const queryResult = await client.query(`
      SELECT packet_key, source_ref
      FROM atlas_packets
      WHERE source_ref LIKE '%.ts'
         OR source_ref LIKE '%.tsx'
         OR source_ref LIKE '%.js'
         OR source_ref LIKE '%.jsx'
      ORDER BY packet_key
      LIMIT $1
    `, [limit]);

    const packets = queryResult.rows;

    console.log(`  ✓ Found ${packets.length} code file packets\n`);

    if (packets.length === 0) {
      console.log('  ℹ️  No code file packets to process.\n');
      await client.release();
      await pool.end();
      process.exit(0);
    }

    // Step 2: For each packet, try to extract symbols from its source_ref file
    console.log(`🔨 Step 2: Extract AST symbols from ${packets.length} files...\n`);

    let extracted = 0;
    let failed = 0;
    let skipped = 0;
    const updates = [];

    for (let i = 0; i < packets.length; i++) {
      const packet = packets[i];

      if ((i + 1) % 100 === 0) {
        console.log(`  [${i + 1}/${packets.length}] Processed ${i + 1} packets...`);
      }

      // Try to find the file on disk
      // source_ref uses forward slashes from DB, but path.join needs platform-specific separators
      // Convert source_ref forward slashes to platform separators
      let filePath = null;
      const sourceRefPath = packet.source_ref.replace(/\//g, path.sep);

      const candidates = [
        path.join(repoRoot, sourceRefPath),
      ];

      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          filePath = candidate;
          break;
        }
      }

      if (!filePath) {
        skipped++;
        if (isVerbose) console.log(`    [SKIP] File not found: ${packet.source_ref}`);
        continue;
      }

      const symbols = await extractAstSymbols(filePath);

      if (symbols.length === 0) {
        skipped++;
        if (isVerbose) console.log(`    [SKIP] ${packet.source_ref} (no symbols found)`);
        continue;
      }

      // PHASE 2A FIX: Use the real packet_key from atlas_packets
      updates.push({
        packet_key: packet.packet_key,
        source_ref: packet.source_ref,
        symbols: symbols,
      });

      extracted++;
    }

    console.log(`\n  ✓ Extracted: ${extracted}, Skipped: ${skipped}, Failed: ${failed}\n`);

    // Step 3: Write to database (ON CONFLICT DO UPDATE for idempotency)
    if (updates.length === 0) {
      console.log('ℹ️  No updates to write.\n');
      await client.release();
      await pool.end();
      process.exit(0);
    }

    console.log(`📝 Step 3: Write ast_symbols to atlas_packet_features (${isDryRun ? 'DRY-RUN' : 'APPLYING'})...\n`);

    if (isDryRun) {
      console.log(`  [DRY-RUN] Would insert/update ${updates.length} rows\n`);
      console.log('  Sample updates (first 5 files):');
      updates.slice(0, 5).forEach(u => {
        console.log(`    - ${u.source_ref}`);
        console.log(`      Symbols: ${u.symbols.slice(0, 5).join(', ')}${u.symbols.length > 5 ? '...' : ''}`);
      });
    } else {
      // Batch insert/update
      const batchSize = 50;
      let totalInserted = 0;

      for (let i = 0; i < updates.length; i += batchSize) {
        const batch = updates.slice(i, i + batchSize);

        for (const update of batch) {
          try {
            const result = await client.query(`
              INSERT INTO atlas_packet_features (packet_key, ast_symbols)
              VALUES ($1, $2)
              ON CONFLICT (packet_key) DO UPDATE SET
                ast_symbols = $2,
                updated_at = NOW()
              RETURNING packet_key
            `, [update.packet_key, update.symbols]);
            totalInserted += result.rowCount;
          } catch (e) {
            console.error(`    ⚠️  Failed to insert ${update.packet_key}:`, e.message);
          }
        }

        console.log(`  ✓ Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(updates.length / batchSize)} processed`);
      }

      console.log(`\n✅ Successfully wrote ${totalInserted} rows to atlas_packet_features\n`);
    }

    // Step 4: Verify coverage
    const verifyResult = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN ast_symbols IS NOT NULL AND array_length(ast_symbols, 1) > 0 THEN 1 END) as populated
      FROM atlas_packet_features
    `);

    const { total, populated } = verifyResult.rows[0];
    const coverage = total > 0 ? ((populated / total) * 100).toFixed(1) : '0.0';

    console.log(`📊 Verification (atlas_packet_features.ast_symbols):\n`);
    console.log(`  Total rows: ${total}`);
    console.log(`  With ast_symbols: ${populated}`);
    console.log(`  Coverage: ${coverage}%\n`);

    // Show progress toward 80% target
    if (populated / total >= 0.80) {
      console.log(`✨ PHASE 2A COMPLETE! Coverage ≥ 80% achieved (${coverage}%)\n`);
      console.log(`   Ready for Phase 2B (lexical extraction) and Phase 2C (entity extraction)\n`);
    } else {
      const needed = Math.ceil(total * 0.80) - populated;
      console.log(`   ⏳ Progress toward 80%: need ${needed} more rows with ast_symbols\n`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

main();
