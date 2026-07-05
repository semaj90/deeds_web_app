#!/usr/bin/env node
/**
 * ATLAS-3A: Symbol/Function/SourceRef Map Extraction
 *
 * Extracts symbols (functions, routes, exports, components) from TypeScript/Svelte sources
 * and maps them to atlas_feature_map + nes_chrom_packets for agentic repair skill lookup.
 *
 * Execution:
 *   npm run atlas:extract-symbols              # Full extraction + upsert
 *   npm run atlas:extract-symbols:dry         # Analysis only, no DB writes
 *   npm run atlas:extract-symbols:audit       # Verify extraction quality
 *
 * Output:
 *   atlas_symbol_map table populated with:
 *   - source_ref → symbol_name, symbol_kind (function, route, component, test, etc.)
 *   - feature_id, packet_key (from feature map join)
 *   - payload: signature, line_numbers, repair_skill candidates, dependencies
 *
 * Bridge also populated:
 *   - atlas_source_to_file_path: source_ref → file_path → community_id
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Project } from 'ts-morph';
import pg from 'pg';
import { resolveAtlasPaths } from './lib/repo-paths.mjs';

const { frontendRoot: ROOT } = resolveAtlasPaths(import.meta.url);

// Environment
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://legal_admin:legal@127.0.0.1:5432/legal_ai_db';
const DRY_RUN = process.argv.includes('--dry-run');
const AUDIT_ONLY = process.argv.includes('--audit');
const VERBOSE = process.argv.includes('--verbose');

// ============================================================================
// CLASSIFICATION LOGIC
// ============================================================================

/**
 * Classify TypeScript/Svelte symbols for ATLAS-3A
 */
function classifySymbol(sourceFile, declaration) {
  const kind = declaration.getKindName();
  const name = declaration.getName?.() || '<anonymous>';

  // Route handlers (SvelteKit +server.ts, +page.server.ts)
  if (sourceFile.getFilePath().includes('+server.ts')) {
    if (kind === 'FunctionDeclaration') {
      const upperName = name.toUpperCase();
      if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(upperName)) {
        return { kind: `api_handler_${upperName}`, exportKind: 'named' };
      }
    }
  }

  // SvelteKit load functions
  if (sourceFile.getFilePath().includes('+page.') || sourceFile.getFilePath().includes('+layout.')) {
    if (name === 'load') {
      return { kind: 'svelte_load', exportKind: 'named' };
    }
  }

  // Server actions
  if (name.startsWith('formAction_') || (sourceFile.getFilePath().includes('+page.server.ts') && kind === 'FunctionDeclaration')) {
    return { kind: 'server_action', exportKind: 'named' };
  }

  // Components (Svelte files)
  if (sourceFile.getFilePath().endsWith('.svelte.ts') || sourceFile.getFilePath().endsWith('.svelte')) {
    if (kind === 'VariableDeclaration' || kind === 'FunctionDeclaration') {
      if (name[0] === name[0].toUpperCase()) {
        return { kind: 'svelte_component', exportKind: 'default' };
      }
    }
  }

  // Drizzle tables
  if (sourceFile.getFilePath().includes('schema')) {
    if (kind === 'VariableDeclaration' && name.endsWith('Table')) {
      return { kind: 'drizzle_table', exportKind: 'named' };
    }
  }

  // Zod schemas
  if (sourceFile.getFilePath().includes('schema') || sourceFile.getFilePath().includes('validation')) {
    if (kind === 'VariableDeclaration' && name.startsWith('z.')) {
      return { kind: 'zod_schema', exportKind: 'named' };
    }
  }

  // Test cases
  if (sourceFile.getFilePath().endsWith('.test.ts') || sourceFile.getFilePath().endsWith('.spec.ts')) {
    if (kind === 'CallExpression' && (name === 'it' || name === 'test')) {
      return { kind: 'test_case', exportKind: null };
    }
  }

  // Repair skills
  if (sourceFile.getFilePath().includes('repair')) {
    if (kind === 'FunctionDeclaration') {
      return { kind: 'repair_skill', exportKind: 'named' };
    }
  }

  // Default classifications
  if (kind === 'FunctionDeclaration' || kind === 'ArrowFunction') {
    return { kind: 'function', exportKind: 'named' };
  }

  if (kind === 'ClassDeclaration') {
    return { kind: 'class', exportKind: 'named' };
  }

  if (kind === 'InterfaceDeclaration') {
    return { kind: 'interface', exportKind: null };
  }

  if (kind === 'TypeAliasDeclaration') {
    return { kind: 'type_alias', exportKind: null };
  }

  // Default: unknown
  return { kind: 'unknown', exportKind: null };
}

/**
 * Extract signature from declaration
 */
function getSignature(declaration) {
  try {
    const text = declaration.getText();
    if (text.length > 500) {
      return text.slice(0, 500) + '...';
    }
    return text;
  } catch {
    return null;
  }
}

/**
 * Get line numbers
 */
function getLineNumbers(declaration) {
  try {
    const start = declaration.getStartLineNumber();
    const end = declaration.getEndLineNumber();
    return { start, end };
  } catch {
    return { start: null, end: null };
  }
}

// ============================================================================
// EXTRACTION
// ============================================================================

async function extractSymbols(featureMapDb) {
  console.log('🔍 Extracting symbols from TypeScript/Svelte sources...\n');

  const project = new Project({
    tsConfigFilePath: path.join(ROOT, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: false,
  });

  const sourceFiles = project.getSourceFiles();
  const symbols = [];

  console.log(`📂 Found ${sourceFiles.length} source files`);

  for (const sourceFile of sourceFiles) {
    const filePath = sourceFile.getFilePath();
    const relativePath = path.relative(ROOT, filePath);

    // Skip node_modules, build output, test mocks
    if (
      filePath.includes('node_modules') ||
      filePath.includes('.svelte-kit') ||
      filePath.includes('build') ||
      filePath.includes('__mocks__')
    ) {
      continue;
    }

    // Look up feature_id and packet_key from database
    let featureId = null;
    let packetKey = null;

    try {
      const sourceRef = relativePath.replace(/\\/g, '/');
      const row = await featureMapDb.query(
        `SELECT feature_id FROM atlas_feature_map WHERE source_ref = $1 LIMIT 1`,
        [sourceRef]
      );
      if (row.rows[0]) {
        featureId = row.rows[0].feature_id;
        // Try to find packet_key
        const packetRow = await featureMapDb.query(
          `SELECT packet_key FROM nes_chrom_packets WHERE source_ref = $1 LIMIT 1`,
          [sourceRef]
        );
        if (packetRow.rows[0]) {
          packetKey = packetRow.rows[0].packet_key;
        }
      }
    } catch (err) {
      // Silent: feature not indexed yet
    }

    // Extract exported declarations
    const declarations = [
      ...sourceFile.getFunctions(),
      ...sourceFile.getClasses(),
      ...sourceFile.getInterfaces(),
      ...sourceFile.getTypeAliases(),
      ...sourceFile.getVariableDeclarations(),
    ];

    for (const decl of declarations) {
      try {
        const name = decl.getName?.();
        if (!name) continue;

        const { kind, exportKind } = classifySymbol(sourceFile, decl);
        const { start, end } = getLineNumbers(decl);
        const signature = getSignature(decl);

        symbols.push({
          sourceRef: relativePath.replace(/\\/g, '/'),
          featureId,
          packetKey,
          symbolName: name,
          symbolKind: kind,
          exportKind,
          lineStart: start,
          lineEnd: end,
          payload: {
            signature,
            file_path: relativePath,
            kind_display: kind,
          },
        });
      } catch (err) {
        if (VERBOSE) {
          console.warn(`  ⚠️  Failed to extract ${decl.getName?.()}: ${err.message}`);
        }
      }
    }
  }

  console.log(`\n✓ Extracted ${symbols.length} symbols\n`);
  return symbols;
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

async function upsertSymbols(db, symbols) {
  console.log(`📝 Upserting ${symbols.length} symbols to atlas_symbol_map (batch mode)...\n`);

  const BATCH_SIZE = 500;
  let inserted = 0;
  let errors = 0;

  // Process in batches of 500
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);

    try {
      // Build multi-row INSERT with ON CONFLICT
      const values = batch.map((sym, idx) => {
        const baseIdx = idx * 6;
        return `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, $${baseIdx + 5}, $${baseIdx + 6})`;
      }).join(',');

      const params = batch.flatMap(sym => [
        sym.sourceRef,
        sym.symbolName,
        sym.symbolKind,
        sym.lineStart || null,
        sym.lineEnd || null,
        JSON.stringify({
          ...sym.payload,
          feature_id: sym.featureId || null,
          packet_key: sym.packetKey || null,
          export_kind: sym.exportKind || null,
        }),
      ]);

      const result = await db.query(
        `INSERT INTO atlas_symbol_map (
          source_ref, symbol_name, symbol_kind,
          line_start, line_end, payload
        ) VALUES ${values}
        ON CONFLICT (source_ref, symbol_name, symbol_kind, COALESCE(line_start, 0))
        DO UPDATE SET
          payload = EXCLUDED.payload,
          updated_at = now()
        RETURNING id`,
        params
      );

      inserted += result.rows.length;
      process.stdout.write(`  ✓ ${Math.min(i + BATCH_SIZE, symbols.length)}/${symbols.length} processed\r`);
    } catch (err) {
      console.error(`  ❌ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.message}`);
      errors += batch.length;
    }
  }

  console.log(`\n✓ ${inserted} inserted/updated (${errors} errors)\n`);
  return { inserted, errors };
}

// ============================================================================
// AUDIT
// ============================================================================

async function auditSymbols(db) {
  console.log('🔍 Auditing symbol map...\n');

  const result = await db.query(
    `SELECT
      COUNT(*) as total,
      COUNT(DISTINCT source_ref) as unique_files,
      COUNT(DISTINCT symbol_kind) as kind_count,
      COUNT(payload->'feature_id') FILTER (WHERE payload->>'feature_id' IS NOT NULL) as with_feature,
      COUNT(payload->'packet_key') FILTER (WHERE payload->>'packet_key' IS NOT NULL) as with_packet
    FROM atlas_symbol_map`
  );

  const row = result.rows[0];
  console.log(`Total symbols: ${row.total}`);
  console.log(`Unique files: ${row.unique_files}`);
  console.log(`Symbol kinds: ${row.kind_count}`);
  console.log(`Linked to feature: ${row.with_feature} (${(row.with_feature / row.total * 100).toFixed(1)}%)`);
  console.log(`Linked to packet: ${row.with_packet} (${(row.with_packet / row.total * 100).toFixed(1)}%)\n`);

  // Top symbol kinds
  const kinds = await db.query(
    `SELECT symbol_kind, COUNT(*) as cnt FROM atlas_symbol_map GROUP BY symbol_kind ORDER BY cnt DESC LIMIT 10`
  );

  console.log('Top symbol kinds:');
  for (const k of kinds.rows) {
    console.log(`  ${k.symbol_kind}: ${k.cnt}`);
  }
  console.log();
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    if (!DRY_RUN) {
      console.log('⚡ Creating tables (if not exist)...');
      await pool.query(fs.readFileSync(path.join(__dirname, '../../sveltekit-frontend/drizzle/manual/atlas-3a-symbol-map.sql'), 'utf-8'));
      console.log('✓ Schema ready\n');
    }

    const symbols = await extractSymbols(pool);

    if (AUDIT_ONLY) {
      await auditSymbols(pool);
    } else if (!DRY_RUN) {
      await upsertSymbols(pool, symbols);
      console.log('Running audit...\n');
      await auditSymbols(pool);
    } else {
      console.log('🔷 DRY RUN: Would insert/update %d symbols', symbols.length);
      console.log('Sample symbols:');
      for (const sym of symbols.slice(0, 5)) {
        console.log(`  ${sym.sourceRef}::${sym.symbolName} (${sym.symbolKind})`);
      }
      console.log(`  ... and ${Math.max(0, symbols.length - 5)} more\n`);
    }
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
