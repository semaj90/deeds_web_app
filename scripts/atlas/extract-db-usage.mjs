#!/usr/bin/env node
/**
 * extract-db-usage.mjs
 *
 * Phase 3: Extract USES_DB edges (database operations).
 *
 * Detects:
 * 1. Drizzle queries: db.select().from(users) → USES_DB
 * 2. Raw SQL: sql`SELECT * FROM evidence` → USES_DB
 * 3. Pool queries: pool.query(...) → USES_DB
 *
 * Output: NDJSON format
 * {source_file, line_num, caller, table, operation, type}
 */

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(projectRoot, 'scripts/atlas/out');

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--write');
const SAMPLE_ONLY = args.includes('--sample');

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

function parseFilePath(line) {
  // Handle both Windows (C:\path\file:123:content) and Unix (/path/file:123:content)
  const parts = line.split(':');

  if (parts.length < 3) return null;

  let filePath, lineNum;

  // Windows path detection: single letter followed by backslash
  if (parts[0].length === 1 && parts.length >= 3) {
    // C:\path\to\file:123:content
    filePath = parts[0] + ':' + parts[1];
    lineNum = parseInt(parts[2]) || 1;
    return { filePath, lineNum, content: parts.slice(3).join(':') };
  } else {
    // Unix: /path/to/file:123:content
    filePath = parts[0];
    lineNum = parseInt(parts[1]) || 1;
    return { filePath, lineNum, content: parts.slice(2).join(':') };
  }
}

function parseDbOperation(text) {
  // Match db.select().from(table) or db.select().from(tableName)
  const selectMatch = text.match(/db\.select\([^)]*\)\.from\((\w+)\)/);
  if (selectMatch) return { table: selectMatch[1], operation: 'select' };

  // Match db.insert(table)
  const insertMatch = text.match(/db\.insert\((\w+)\)/);
  if (insertMatch) return { table: insertMatch[1], operation: 'insert' };

  // Match db.update(table)
  const updateMatch = text.match(/db\.update\((\w+)\)/);
  if (updateMatch) return { table: updateMatch[1], operation: 'update' };

  // Match db.delete().from(table)
  const deleteMatch = text.match(/db\.delete\([^)]*\)\.from\((\w+)\)/);
  if (deleteMatch) return { table: deleteMatch[1], operation: 'delete' };

  return null;
}

function parseSqlTemplate(text) {
  // Match sql`SELECT ... FROM table`
  const selectMatch = text.match(/sql`\s*SELECT\s+.*?\s+FROM\s+(\w+)/i);
  if (selectMatch) return { table: selectMatch[1], operation: 'raw_sql' };

  // Match sql`INSERT INTO table`
  const insertMatch = text.match(/sql`\s*INSERT\s+INTO\s+(\w+)/i);
  if (insertMatch) return { table: insertMatch[1], operation: 'raw_sql' };

  // Match sql`UPDATE table`
  const updateMatch = text.match(/sql`\s*UPDATE\s+(\w+)/i);
  if (updateMatch) return { table: updateMatch[1], operation: 'raw_sql' };

  // Match sql`DELETE FROM table`
  const deleteMatch = text.match(/sql`\s*DELETE\s+FROM\s+(\w+)/i);
  if (deleteMatch) return { table: deleteMatch[1], operation: 'raw_sql' };

  return null;
}

async function main() {
  console.log('🚀 Phase 3 Atlas: Database Usage Extractor (USES_DB edges)');
  console.log();

  const edges = [];

  // Grep for db.select/insert/update/delete patterns
  console.log('[EXTRACT] Drizzle operations (db.select/insert/update/delete)...');
  try {
    const srcDir = path.join(projectRoot, 'sveltekit-frontend/src');
    const matches = execSync(
      `grep -rn "db\\.(select\\|insert\\|update\\|delete)" "${srcDir}" --include="*.ts" --include="*.svelte.ts" 2>/dev/null | head -${SAMPLE_ONLY ? 100 : 1000}`,
      { encoding: 'utf-8' }
    )
      .trim()
      .split('\n')
      .filter(l => l);

    for (const line of matches) {
      const parsed = parseFilePath(line);
      if (!parsed) continue;

      const relPath = path.relative(projectRoot, parsed.filePath);
      const dbOp = parseDbOperation(parsed.content);

      if (dbOp) {
        edges.push({
          source_file: relPath,
          line_num: parsed.lineNum,
          caller: 'drizzle-query',
          table: dbOp.table,
          operation: dbOp.operation,
          type: 'drizzle',
        });
      }
    }
    console.log(`  ✓ Found ${edges.length} Drizzle operations`);
  } catch (e) {
    console.log(`  ⚠ Drizzle scan error: ${e.message}`);
  }

  // Grep for raw SQL patterns
  console.log('[EXTRACT] Raw SQL (sql`...`)...');
  const sqlEdgesCount = edges.length;
  try {
    const srcDir = path.join(projectRoot, 'sveltekit-frontend/src');
    const matches = execSync(
      `grep -rn "sql\\\`" "${srcDir}" --include="*.ts" --include="*.svelte.ts" 2>/dev/null | head -${SAMPLE_ONLY ? 50 : 500}`,
      { encoding: 'utf-8' }
    )
      .trim()
      .split('\n')
      .filter(l => l);

    for (const line of matches) {
      const parsed = parseFilePath(line);
      if (!parsed) continue;

      const relPath = path.relative(projectRoot, parsed.filePath);
      const sqlOp = parseSqlTemplate(parsed.content);

      if (sqlOp) {
        edges.push({
          source_file: relPath,
          line_num: parsed.lineNum,
          caller: 'raw-sql',
          table: sqlOp.table,
          operation: sqlOp.operation,
          type: 'raw_sql',
        });
      }
    }
    console.log(`  ✓ Found ${edges.length - sqlEdgesCount} raw SQL operations`);
  } catch (e) {
    console.log(`  ⚠ SQL scan error: ${e.message}`);
  }

  // Grep for pool.query patterns
  console.log('[EXTRACT] Pool queries (pool.query)...');
  const poolEdgesCount = edges.length;
  try {
    const srcDir = path.join(projectRoot, 'sveltekit-frontend/src');
    const matches = execSync(
      `grep -rn "pool\\.query" "${srcDir}" --include="*.ts" --include="*.svelte.ts" 2>/dev/null | head -${SAMPLE_ONLY ? 50 : 500}`,
      { encoding: 'utf-8' }
    )
      .trim()
      .split('\n')
      .filter(l => l);

    for (const line of matches) {
      const parsed = parseFilePath(line);
      if (!parsed) continue;

      const relPath = path.relative(projectRoot, parsed.filePath);

      edges.push({
        source_file: relPath,
        line_num: parsed.lineNum,
        caller: 'pool-client',
        table: 'unknown',
        operation: 'pool',
        type: 'pool',
      });
    }
    console.log(`  ✓ Found ${edges.length - poolEdgesCount} pool queries`);
  } catch (e) {
    console.log(`  ⚠ Pool scan error: ${e.message}`);
  }

  // Output: NDJSON format
  console.log();
  console.log(`[OUTPUT] ${edges.length} total USES_DB edges`);
  const outputFile = path.join(OUT_DIR, 'db-usage-edges.ndjson');

  let ndjson = '';
  for (const edge of edges) {
    ndjson += JSON.stringify(edge) + '\n';
  }

  if (DRY_RUN) {
    console.log(`[DRY-RUN] Would write ${outputFile}`);
    console.log(`[SAMPLE] First 10 edges:`);
    edges.slice(0, 10).forEach(e => console.log(JSON.stringify(e)));
  } else {
    writeFileSync(outputFile, ndjson);
    console.log(`[WRITE] ✓ ${outputFile}`);
  }

  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total USES_DB edges: ${edges.length}`);
  console.log(`Breakdown:`);
  console.log(`  - Drizzle: ${edges.filter(e => e.type === 'drizzle').length}`);
  console.log(`  - Raw SQL: ${edges.filter(e => e.type === 'raw_sql').length}`);
  console.log(`  - Pool:    ${edges.filter(e => e.type === 'pool').length}`);
  console.log(`Ready for Phase 3 Neo4j sync: node scripts/atlas/phase3-neo4j-sync.mjs`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);