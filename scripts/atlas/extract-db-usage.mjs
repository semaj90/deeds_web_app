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

import { execFileSync, execSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import path from 'path';
import { createGraphifySnapshotEvidenceBinderV1 } from './lib/graphify-snapshot-evidence-binder-v1.mjs';
import { fileURLToPath } from 'url';
import { buildGraphEdgeProposalFromSnapshotV1 } from '../packets/graph-edge-proposal-v1.mjs';
import { resolveProposalOutputDirV1 } from './lib/proposal-output-dir-v1.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const outputDirArg = process.argv.slice(2).find((arg) => arg.startsWith('--output-dir='))?.slice('--output-dir='.length);
const OUT_DIR = resolveProposalOutputDirV1(projectRoot, outputDirArg);
const admission = JSON.parse(readFileSync(path.join(projectRoot, 'docs/reports/workspace-revision-tournament-admission-v1.json'), 'utf8'));
const manifestPath = path.resolve(projectRoot, admission.manifestPath ?? '');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const snapshotRoot = path.join(projectRoot, '.tmp/workspace-source-snapshots', manifest.snapshotRevision.replace(/^sha256:/, ''));
const sourceEvidenceBinder = createGraphifySnapshotEvidenceBinderV1({ admission, manifest, snapshotRoot });

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--write');
const SAMPLE_ONLY = args.includes('--sample');

if (!DRY_RUN && !existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

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

function findRgMatches(pattern, srcDir, limit) {
  const output = execFileSync('rg', ['--json', '--glob', '*.ts', '--glob', '*.svelte.ts', pattern, srcDir], { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 });
  return output.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)).filter((event) => event.type === 'match').slice(0, limit).map((event) => ({ filePath: event.data.path.text, lineNum: event.data.line_number, content: event.data.lines.text.trimEnd() }));
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

function parsePoolQuery(text) {
  // pool.query('SELECT ... FROM table ...')  or  pool.query(`...`)  or  pool.query(someSqlVar)
  // Extract the first string/template literal argument from pool.query(...)
  const argMatch = text.match(/pool\.query\s*\(\s*(?:'([^']*)'|`([^`]*)`|"([^"]*)")/);
  const sql = argMatch ? (argMatch[1] ?? argMatch[2] ?? argMatch[3] ?? '') : '';

  if (!sql) return null; // dynamic variable — can't resolve statically

  // Ignore transaction control — no table involved
  if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/i.test(sql)) return null;

  // SELECT ... FROM table
  const selectMatch = sql.match(/\bFROM\s+"?(\w+)"?/i);
  if (selectMatch) return { table: selectMatch[1], operation: 'select' };

  // INSERT INTO table
  const insertMatch = sql.match(/\bINSERT\s+INTO\s+"?(\w+)"?/i);
  if (insertMatch) return { table: insertMatch[1], operation: 'insert' };

  // UPDATE table
  const updateMatch = sql.match(/\bUPDATE\s+"?(\w+)"?/i);
  if (updateMatch) return { table: updateMatch[1], operation: 'update' };

  // DELETE FROM table
  const deleteMatch = sql.match(/\bDELETE\s+FROM\s+"?(\w+)"?/i);
  if (deleteMatch) return { table: deleteMatch[1], operation: 'delete' };

  // CREATE TABLE / DROP TABLE / TRUNCATE
  const ddlMatch = sql.match(/\b(?:CREATE|DROP|TRUNCATE)\s+(?:TABLE\s+)?"?(\w+)"?/i);
  if (ddlMatch) return { table: ddlMatch[1], operation: 'ddl' };

  return null; // SQL present but table not parseable inline
}

function parseSqlTemplate(text) {
  // Match sql`SELECT ... FROM table`
  const selectMatch = text.match(/sql`\s*SELECT\s+[\s\S]*?\s+FROM\s+(\w+)/i);
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
  const qdrantEdges = [];

  // Grep for db.select/insert/update/delete patterns
  console.log('[EXTRACT] Drizzle operations (db.select/insert/update/delete)...');
  try {
    const srcDir = path.join(snapshotRoot, 'sveltekit-frontend/src');
    const matches = findRgMatches('db\\.(select|insert|update|delete)', srcDir, SAMPLE_ONLY ? 100 : 1000);

    for (const match of matches) {
      const relPath = path.relative(snapshotRoot, match.filePath).replace(/\\/g, '/');
      const dbOp = parseDbOperation(match.content);

      if (dbOp) {
        edges.push({
          source_file: relPath,
          line_num: match.lineNum,
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
    const srcDir = path.join(snapshotRoot, 'sveltekit-frontend/src');
    const matches = findRgMatches('sql`', srcDir, SAMPLE_ONLY ? 50 : 500);

    for (const match of matches) {
      const relPath = path.relative(snapshotRoot, match.filePath).replace(/\\/g, '/');
      const sourceLines = readFileSync(match.filePath, 'utf-8').split(/\r?\n/);
      const templateLines = sourceLines.slice(match.lineNum - 1, match.lineNum + 29);
      const templateText = templateLines.join('\n');
      const templateStart = templateText.indexOf('sql`');
      const templateEnd = templateText.indexOf('`', templateStart + 4);
      const sqlOp = parseSqlTemplate(templateEnd >= 0 ? templateText.slice(templateStart, templateEnd + 1) : templateText);

      if (sqlOp) {
        edges.push({
          source_file: relPath,
          line_num: match.lineNum,
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

  // Grep for pool.query patterns — capture 3 lines of context so multiline
  // template literals (`INSERT INTO table\n  ...`) are included in the match.
  console.log('[EXTRACT] Pool queries (pool.query)...');
  const poolEdgesCount = edges.length;
  try {
    const srcDir = path.join(snapshotRoot, 'sveltekit-frontend/src');
    // -A 3: 3 lines after the match line to capture multiline SQL args
    const raw = execSync(
      `grep -rn -A 3 "pool\\.query" "${srcDir}" --include="*.ts" --include="*.svelte.ts" 2>/dev/null | head -${SAMPLE_ONLY ? 200 : 2000}`,
      { encoding: 'utf-8' }
    ).trim();

    // Group lines by match block:
    //   Match lines:   "path/file.ts:123:content"   (colon separator)
    //   Context lines: "path/file.ts-123-content"   (hyphen separator for -A/-B)
    //   Block separator: "--"
    // We collapse each block into one joined text string for the parser.
    const blocks = [];
    let current = null;

    // Extract content from a grep context line (hyphen-separated)
    function contextContent(line) {
      // Strip leading "path-linenum-" prefix; the content is everything after the second hyphen-number
      const m = line.match(/^.+?-\d+-(.*)$/);
      return m ? m[1] : line;
    }

    for (const line of raw.split('\n')) {
      if (line === '--') { current = null; continue; }

      // Detect match line vs context line by whether it contains "pool.query"
      // Match lines use ':' as separator; context lines use '-'
      if (line.includes('pool.query')) {
        const parsed = parseFilePath(line);
        if (parsed) {
          current = { filePath: parsed.filePath, lineNum: parsed.lineNum, text: parsed.content ?? '' };
          blocks.push(current);
        }
      } else if (current) {
        // Context line — append raw content for SQL extraction
        current.text += ' ' + contextContent(line);
      }
    }

    let poolResolved = 0;
    let poolUnknown = 0;
    const seen = new Set();
    for (const block of blocks) {
      const key = `${block.filePath}:${block.lineNum}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Skip transaction control lines
      if (/pool\.query\s*\(\s*['"`]?\s*(BEGIN|COMMIT|ROLLBACK)\s*['"`]?\s*\)/i.test(block.text)) continue;

      const relPath = path.relative(snapshotRoot, block.filePath).replace(/\\/g, '/');
      const poolOp = parsePoolQuery(block.text);
      if (!poolOp) {
        poolUnknown++;
        continue;
      }

      const table = poolOp?.table ?? 'unknown';
      const operation = poolOp?.operation ?? 'pool';
      if (table !== 'unknown') poolResolved++; else poolUnknown++;

      edges.push({
        source_file: relPath,
        line_num: block.lineNum,
        caller: 'pool-client',
        table,
        operation,
        type: 'pool',
      });
    }
    console.log(`  ✓ Emitted ${edges.length - poolEdgesCount} resolved pool edges (${poolResolved} resolved, ${poolUnknown} unresolved)`);
  } catch (e) {
    console.log(`  ⚠ Pool scan error: ${e.message}`);
  }

  console.log('[EXTRACT] Qdrant vector-store calls (proposal-only)...');
  try {
    const srcDir = path.join(snapshotRoot, 'sveltekit-frontend/src');
    const matches = findRgMatches(
      '(?:getQdrantManager\\s*\\(\\)\\s*\\.|\\b(?:qdrant|qdrantClient|this\\.qdrant)\\s*\\.\\s*)(search|query|upsert|scroll|retrieve|setPayload|delete)\\s*\\(',
      srcDir,
      SAMPLE_ONLY ? 100 : 3000,
    );
    for (const match of matches) {
      const operation = match.content.match(/(search|query|upsert|scroll|retrieve|setPayload|delete)/i)?.[1];
      if (!operation) continue;
      qdrantEdges.push({
        source_file: path.relative(snapshotRoot, match.filePath).split(path.sep).join('/'),
        line_num: match.lineNum,
        caller: 'qdrant-client',
        target: 'qdrant',
        operation: operation.toLowerCase(),
        type: 'qdrant',
        relation: 'USES_QDRANT',
      });
    }
    console.log(`  ✓ Found ${qdrantEdges.length} Qdrant call candidates`);
  } catch (e) {
    console.log(`  ⚠ Qdrant scan error: ${e.message}`);
  }

  // Output: NDJSON format
  console.log();
  console.log(`[OUTPUT] ${edges.length} total USES_DB edges`);
  const outputFile = path.join(OUT_DIR, 'db-usage-edges.ndjson');

  let ndjson = '';
  let snapshotBoundProposals = 0;
  let reviewRequiredProposals = 0;
  for (const edge of edges) {
    const proposal = buildGraphEdgeProposalFromSnapshotV1({
      source_locator: edge.source_file,
      target_label: edge.table,
      relation: 'USES_DB',
      line: edge.line_num,
      caller: edge.caller,
      type: edge.type,
      metadata: { operation: edge.operation, table: edge.table },
    }, sourceEvidenceBinder);
    if (proposal.workspace_revision === admission.workspaceRevision && proposal.source_revision && proposal.evidence.source_content_digest) snapshotBoundProposals++;
    if (proposal.admission_status === 'REVIEW_REQUIRED' && proposal.canonical_authority === false) reviewRequiredProposals++;
    ndjson += JSON.stringify({ ...edge, proposal }) + '\n';
  }

  const qdrantOutputFile = path.join(OUT_DIR, 'qdrant-usage-proposals.ndjson');
  let qdrantNdjson = '';
  let qdrantSnapshotBound = 0;
  let qdrantReviewRequired = 0;
  for (const edge of qdrantEdges) {
    const proposal = buildGraphEdgeProposalFromSnapshotV1({
      source_locator: edge.source_file,
      target_label: edge.target,
      relation: edge.relation,
      line: edge.line_num,
      caller: edge.caller,
      type: edge.type,
      metadata: { operation: edge.operation },
    }, sourceEvidenceBinder);
    if (proposal.workspace_revision === admission.workspaceRevision && proposal.source_revision && proposal.evidence.source_content_digest) qdrantSnapshotBound++;
    if (proposal.admission_status === 'REVIEW_REQUIRED' && proposal.canonical_authority === false) qdrantReviewRequired++;
    qdrantNdjson += JSON.stringify({ ...edge, proposal }) + '\n';
  }

  if (DRY_RUN) {
    console.log(`[DRY-RUN] Would write ${outputFile}`);
    console.log(`[PROPOSAL-LINEAGE] ${snapshotBoundProposals}/${edges.length} snapshot-bound; ${reviewRequiredProposals}/${edges.length} review-required; canonical writes=0`);
    console.log(`[QDRANT-PROPOSALS] ${qdrantEdges.length} candidates; ${qdrantSnapshotBound}/${qdrantEdges.length} snapshot-bound; ${qdrantReviewRequired}/${qdrantEdges.length} review-required; would write ${qdrantOutputFile}; canonical writes=0`);
    console.log(`[SAMPLE] First 10 edges:`);
    edges.slice(0, 10).forEach(e => console.log(JSON.stringify(e)));
  } else {
    const outputOptions = outputDirArg ? { flag: 'wx' } : undefined;
    writeFileSync(outputFile, ndjson, outputOptions);
    writeFileSync(qdrantOutputFile, qdrantNdjson, outputOptions);
    console.log(`[WRITE] ✓ ${outputFile}`);
    console.log(`[WRITE] ✓ ${qdrantOutputFile} (proposal-only)`);
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
