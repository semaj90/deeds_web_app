#!/usr/bin/env node
/**
 * Phase 1: AST-Grep Structural Extraction (Critical Path)
 *
 * Extract ast_symbols[] from TypeScript/JavaScript code using ast-grep
 * Symbols: functions, classes, imports, exports, identifiers
 *
 * Input: atlas_packets.source_ref (file path)
 * Output: atlas_packet_features.ast_symbols[]
 *
 * Stage 1 output feeds Stage 2 (Lexical), Stage 3 (LangExtract), Stage 4 (Naive Bayes)
 *
 * Usage:
 *   npm run atlas:phase1:ast-grep:dry --limit=100
 *   npm run atlas:phase1:ast-grep:apply --limit=10000
 */

import pg from 'pg';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const isVerbose = process.argv.includes('--verbose') || process.argv.includes('-v');
const limit = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? '100'
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
  console.log(`\n🔍 Phase 1: AST-Grep Structural Extraction [${isDryRun ? 'DRY-RUN' : 'APPLY'}]\n`);

  const client = await pool.connect();

  try {
    // Step 1: Extract from actual codebase files (alternative to atlas_packets.source_ref)
    console.log('📦 Step 1: Scan codebase for TypeScript files...');

    // For this first run, we'll extract from real TS/TSX files in src/
    const tsFiles = [];
    const findTsFiles = (dir) => {
      try {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory() && !file.startsWith('.')) {
            findTsFiles(fullPath);
          } else if ((file.endsWith('.ts') || file.endsWith('.tsx')) && !file.endsWith('.d.ts')) {
            const relPath = path.relative(repoRoot, fullPath);
            tsFiles.push({
              packet_key: `codebase:${relPath}`,
              source_ref: relPath,
              filePath: fullPath,
            });
          }
        });
      } catch (e) {
        // skip
      }
    };

    findTsFiles(path.join(repoRoot, 'src'));

    console.log(`  ✓ Found ${tsFiles.length} TypeScript files in codebase\n`);

    if (tsFiles.length === 0) {
      console.log('  ℹ️  No TypeScript files to process.\n');
      await client.release();
      await pool.end();
      process.exit(0);
    }

    // Limit to requested count
    const packets = tsFiles.slice(0, limit);

    console.log(`  ✓ Found ${packets.length} TypeScript files to extract\n`);

    if (packets.length === 0) {
      console.log('  ℹ️  No TypeScript files to process.\n');
      await client.release();
      await pool.end();
      process.exit(0);
    }

    // Step 2: Extract symbols for each packet
    console.log(`🔨 Step 2: Extract AST symbols from ${packets.length} source files...\n`);

    let extracted = 0;
    let failed = 0;
    let skipped = 0;
    const updates = [];

    for (let i = 0; i < packets.length; i++) {
      const packet = packets[i];
      const filePath = packet.filePath; // Use the real file path

      if ((i + 1) % 100 === 0) {
        console.log(`  [${i + 1}/${packets.length}] Processed ${i + 1} files...`);
      }

      const symbols = await extractAstSymbols(filePath);

      if (symbols.length === 0) {
        skipped++;
        if (isVerbose) console.log(`    [SKIP] ${packet.source_ref} (no symbols found)`);
        continue;
      }

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

    // Step 4: Verify (count all ast_symbols in the feature table)
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

    console.log(`✨ Phase 1 complete!\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

main();
