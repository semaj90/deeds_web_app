#!/usr/bin/env node
/**
 * Phase 1.5: AST-Grep Structural Extraction
 *
 * Extract ast_symbols[] from code files using ast-grep
 * Input: source_ref (file path) from atlas_packets
 * Output: ast_symbols[] → atlas_packet_features
 *
 * Usage:
 *   npm run atlas:phase1.5:ast-grep:dry --limit=100
 *   npm run atlas:phase1.5:ast-grep:apply --limit=10000
 */

import pg from 'pg';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const limit = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? '1000'
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
 * Looks for: functions, classes, imports, exports, types, interfaces, routes
 */
async function extractAstSymbols(filePath) {
  // Skip proto: refs (no source to extract from)
  if (filePath.startsWith('proto:')) {
    return [];
  }

  // Resolve path relative to repo root if it's a relative path
  let resolvedPath = filePath;
  if (!path.isAbsolute(filePath)) {
    // Try common base paths
    const bases = [
      process.cwd(), // current directory
      path.join(process.cwd(), '..'), // parent (repo root if in sveltekit-frontend)
      path.join(process.cwd(), '../..'), // grandparent
    ];

    for (const base of bases) {
      const candidate = path.join(base, filePath);
      if (fs.existsSync(candidate)) {
        resolvedPath = candidate;
        break;
      }
    }
  }

  if (!fs.existsSync(resolvedPath)) {
    return [];
  }

  try {
    // Use ast-grep to extract various symbol types
    const rules = [
      'function\\s+([a-zA-Z_]\\w*)',           // function names
      'class\\s+([a-zA-Z_]\\w*)',               // class names
      'export\\s+(?:const|let|function)\\s+([a-zA-Z_]\\w*)',  // exports
      'import\\s+.*from',                       // import statements
      'interface\\s+([a-zA-Z_]\\w*)',           // interfaces
      'type\\s+([a-zA-Z_]\\w*)\\s*=',           // type aliases
      'router\\.(?:get|post|put|delete)\\([\'"]([^\'"]+)',  // routes
    ];

    const symbols = new Set();

    for (const rule of rules) {
      try {
        const cmd = `ast-grep --pattern "${rule}" "${resolvedPath}" 2>/dev/null`;
        const result = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
        const matches = result.match(/\w+/g) || [];
        matches.forEach(m => {
          if (m.length > 2 && m.length < 128) symbols.add(m);
        });
      } catch (e) {
        // ast-grep pattern didn't match, continue
      }
    }

    // Also extract from comments (simple heuristic)
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    const commentMatches = content.match(/(?:\/\/|\/\*|\*)\s*[A-Z][a-zA-Z_]*(?:\s+[A-Z][a-zA-Z_]*)?/g) || [];
    commentMatches.forEach(c => {
      const words = c.replace(/[/*]/g, '').trim().split(/\s+/);
      words.forEach(w => {
        if (w.length > 2 && /^[A-Z]/.test(w)) symbols.add(w);
      });
    });

    return Array.from(symbols).slice(0, 50); // Limit to 50 symbols per file
  } catch (e) {
    console.error(`  ⚠️  Error extracting symbols from ${filePath}:`, e.message);
    return [];
  }
}

async function main() {
  console.log(`\n🔍 Phase 1.5: AST-Grep Structural Extraction [${isDryRun ? 'DRY-RUN' : 'APPLY'}]\n`);

  const client = await pool.connect();

  try {
    // 1. Fetch packets that need ast_symbols
    console.log('📦 Step 1: Fetch packets needing ast_symbols...');
    const result = await client.query(`
      SELECT
        ap.packet_key,
        ap.source_ref,
        apf.ast_symbols
      FROM atlas_packets ap
      LEFT JOIN atlas_packet_features apf ON apf.packet_key = ap.packet_key
      WHERE ap.source_ref IS NOT NULL
      AND (apf.ast_symbols IS NULL OR array_length(apf.ast_symbols, 1) IS NULL)
      ORDER BY ap.packet_key
      LIMIT $1
    `, [limit]);

    const packets = result.rows;
    console.log(`  ✓ Found ${packets.length} packets needing extraction\n`);

    if (packets.length === 0) {
      console.log('  No packets to process.\n');
      process.exit(0);
    }

    // 2. Extract symbols for each packet
    console.log('🔨 Step 2: Extract AST symbols from source files...');

    let extracted = 0;
    let failed = 0;
    const updates = [];

    for (const packet of packets) {
      const filePath = packet.source_ref;
      const symbols = await extractAstSymbols(filePath);

      if (symbols.length > 0) {
        extracted++;
        updates.push({
          packet_key: packet.packet_key,
          symbols: symbols,
        });
      } else {
        failed++;
      }

      if ((extracted + failed) % 100 === 0) {
        console.log(`  Progress: ${extracted + failed}/${packets.length} (${extracted} extracted, ${failed} failed)`);
      }
    }

    console.log(`  ✓ Extraction complete: ${extracted} packets with symbols, ${failed} failed\n`);

    if (isDryRun) {
      console.log('📊 Sample results (first 5):\n');
      updates.slice(0, 5).forEach(u => {
        console.log(`  ${u.packet_key}`);
        console.log(`    Symbols: [${u.symbols.slice(0, 10).join(', ')}]`);
      });
      console.log('\n✅ Dry-run complete. Use --apply to persist.\n');
      process.exit(0);
    }

    // 3. Write to database (batch updates for performance)
    console.log('💾 Step 3: Write ast_symbols to atlas_packet_features...');

    if (updates.length > 0) {
      // Build batch SQL with $1::uuid[], $2::text[], $3::text[] for values, names, symbols
      const packetKeys = updates.map(u => u.packet_key);
      const symbolsArray = updates.map(u => u.features);

      // Use unnest for efficient batch upsert
      const batchQuery = `
        INSERT INTO atlas_packet_features (packet_key, ast_symbols)
        SELECT
          UNNEST($1::text[]) as packet_key,
          UNNEST($2::text[][]) as ast_symbols
        ON CONFLICT (packet_key) DO UPDATE
        SET ast_symbols = EXCLUDED.ast_symbols, updated_at = NOW()
      `;

      try {
        await client.query(batchQuery, [packetKeys, symbolsArray]);
        console.log(`  ✓ ${updates.length} rows updated via batch\n`);
      } catch (batchErr) {
        // Fallback to row-by-row if batch fails
        console.warn(`  ⚠️  Batch update failed, falling back to row-by-row:`, batchErr.message);
        let written = 0;
        for (const update of updates) {
          await client.query(`
            INSERT INTO atlas_packet_features (packet_key, ast_symbols)
            VALUES ($1, $2)
            ON CONFLICT (packet_key) DO UPDATE
            SET ast_symbols = $2, updated_at = NOW()
          `, [update.packet_key, update.features]);

          written++;
          if (written % 500 === 0) {
            console.log(`  Progress: ${written}/${updates.length} written`);
          }
        }
        console.log(`  ✓ ${written} rows updated via fallback\n`);
      }
    }

    // 4. Validation gate
    console.log('✓ Phase 1.5 Complete\n');
    console.log('📊 Coverage Report:');

    const coverage = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM atlas_packets) as total_packets,
        (SELECT COUNT(*) FROM atlas_packets WHERE source_ref NOT LIKE 'proto:%') as extractable_packets,
        (SELECT COUNT(*) FROM atlas_packet_features WHERE ast_symbols IS NOT NULL AND array_length(ast_symbols, 1) > 0) as with_ast
      FROM atlas_packet_features LIMIT 1
    `);

    const { total_packets, extractable_packets, with_ast } = coverage.rows[0];
    const pct = (with_ast / extractable_packets * 100).toFixed(1);

    console.log(`  Total packets: ${total_packets}`);
    console.log(`  Extractable (non-proto) packets: ${extractable_packets}`);
    console.log(`  With ast_symbols: ${with_ast} (${pct}% of extractable)`);
    console.log(`  Gate target: ≥95% of extractable`);

    if (with_ast / extractable_packets >= 0.95) {
      console.log(`  Result: PASS\n`);
    } else {
      console.log(`  Result: FAIL (${pct}% < 95%)\n`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

main();
