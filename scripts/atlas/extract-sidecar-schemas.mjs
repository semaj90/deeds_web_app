#!/usr/bin/env node
/**
 * extract-sidecar-schemas.mjs
 *
 * Pulls the Drizzle TS table blocks from the auto-introspected schema
 * (.tmp/drizzle-introspect/schema.ts) for the 10 core-app tables that are
 * currently undeclared, and writes one sidecar schema file per table to
 * sveltekit-frontend/src/lib/server/db/schema/<name>.ts.
 *
 * NON-DESTRUCTIVE: skips writing if a target file already exists.
 *
 * Tables targeted (core-app drift, Tier 1):
 *   case_notes, case_statute_links, case_note_versions, case_note_evidence_refs,
 *   legal_documents, statute_chunks, timeline_events,
 *   workspaces, workspace_notes, workspace_sessions
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

const INTROSPECT_SCHEMA = '.tmp/drizzle-introspect/schema.ts';
const TARGET_DIR = 'sveltekit-frontend/src/lib/server/db/schema';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

// Round 1 (2026-05-30 — turned out to be redundant with schema-postgres.ts;
// banners added in the sidecar files pointing to the canonical declaration):
//   case_notes, case_statute_links, case_note_versions, case_note_evidence_refs,
//   legal_documents, statute_chunks, timeline_events,
//   workspaces, workspace_notes, workspace_sessions

// Round 3 (2026-05-30) — Tier D promotions from real-gap-classification.md
// `embeddings` is FK-referenced by case_chunks.chunk_embedding_id (schema dep).
// `model_weights` is consumed by admin/model-manager + 2 routes + dashboard.
const TARGETS = [
  { table: 'embeddings',    exportName: 'embeddings' },
  { table: 'model_weights', exportName: 'modelWeights' },
];

// Round 2 (2026-05-30) — Tier A from real-gap-classification.md (DONE):
//   feature_registry_vectors, codebase_embeddings, codebase_files,
//   intent_synthesis_rewards, feature_cards, codebase_relationship_reports,
//   vector_smoke

function camelToKebab(name) {
  return name.replace(/_/g, '-');
}

function extractTableBlock(source, exportName) {
  // Match: export const <exportName> = pgTable("<table>", { ... });
  // The block ends at the closing }); at column 0
  const startMarker = `export const ${exportName} = pgTable(`;
  const startIdx = source.indexOf(startMarker);
  if (startIdx === -1) {
    return { found: false };
  }

  // Walk forward, tracking brace depth, until we hit the matching });
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let escape = false;

  for (let i = startIdx; i < source.length; i++) {
    const ch = source[i];

    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === '\\') { escape = true; continue; }
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) {
        // Next char should be ; ending the statement
        let end = i + 1;
        while (end < source.length && source[end] !== ';') end++;
        return {
          found: true,
          block: source.slice(startIdx, end + 1),
          startIdx,
          endIdx: end + 1,
        };
      }
    }
  }
  return { found: false };
}

function detectImports(block) {
  const imports = new Set();

  // Detect pg-core types used
  const pgCoreTypes = [
    'pgTable', 'pgEnum', 'pgSchema',
    'text', 'varchar', 'char',
    'integer', 'bigint', 'smallint', 'serial', 'bigserial',
    'boolean', 'real', 'doublePrecision', 'numeric',
    'timestamp', 'date', 'time', 'interval',
    'jsonb', 'json', 'uuid',
    'index', 'uniqueIndex', 'primaryKey', 'foreignKey', 'check',
    'vector', 'halfvec', 'sparsevec', 'bit',
  ];
  for (const t of pgCoreTypes) {
    // boundary-aware match — t followed by ( or non-word
    const re = new RegExp(`(^|[^a-zA-Z0-9_])${t}\\s*\\(`, 'm');
    if (re.test(block)) imports.add(t);
  }

  // sql tagged template
  const usesSql = /\bsql`/.test(block) || /\bsql\(/.test(block);

  return { pgCore: Array.from(imports).sort(), usesSql };
}

function main() {
  console.log('🛠️  Sidecar schema extractor');
  console.log('   Source:', INTROSPECT_SCHEMA);
  console.log('   Mode:', APPLY ? 'APPLY' : 'DRY-RUN');
  console.log();

  if (!existsSync(INTROSPECT_SCHEMA)) {
    console.error(`ERROR: ${INTROSPECT_SCHEMA} not found. Run \`drizzle-kit introspect\` first.`);
    process.exit(1);
  }

  if (!existsSync(TARGET_DIR)) {
    console.error(`ERROR: ${TARGET_DIR} not found.`);
    process.exit(1);
  }

  const source = readFileSync(INTROSPECT_SCHEMA, 'utf-8');
  console.log(`[1/3] Loaded ${source.length} bytes of introspect schema`);

  const results = [];

  for (const { table, exportName } of TARGETS) {
    const targetFile = path.join(TARGET_DIR, `${camelToKebab(table)}.ts`);

    if (existsSync(targetFile)) {
      results.push({ table, status: 'skip-exists', file: targetFile });
      continue;
    }

    const { found, block } = extractTableBlock(source, exportName);
    if (!found) {
      results.push({ table, status: 'not-found-in-introspect', file: targetFile });
      continue;
    }

    const { pgCore, usesSql } = detectImports(block);

    const header = `/**
 * ${exportName} — sidecar schema
 *
 * Auto-extracted from drizzle-kit introspect (2026-05-30 drift remediation).
 * Live DB table: \`${table}\`
 *
 * NOTE: this file mirrors the LIVE DB shape. If you change the schema here,
 * make a matching SQL migration in drizzle/manual/ to keep the DB in sync.
 */

import { ${pgCore.join(', ')} } from 'drizzle-orm/pg-core';
${usesSql ? `import { sql } from 'drizzle-orm';\n` : ''}
${block}

export type ${exportName.charAt(0).toUpperCase() + exportName.slice(1)} = typeof ${exportName}.$inferSelect;
export type New${exportName.charAt(0).toUpperCase() + exportName.slice(1)} = typeof ${exportName}.$inferInsert;
`;

    results.push({ table, status: 'ready', file: targetFile, content: header, blockSize: block.length });
  }

  console.log(`[2/3] Processed ${results.length} targets`);
  console.log();

  for (const r of results) {
    const icon = r.status === 'ready' ? '✓' : r.status === 'skip-exists' ? '~' : '✗';
    console.log(`  ${icon} ${r.table.padEnd(30)} ${r.status}${r.blockSize ? ` (${r.blockSize} bytes)` : ''}`);
  }

  console.log();
  console.log(`[3/3] ${APPLY ? 'Writing' : 'Previewing'} ${results.filter(r => r.status === 'ready').length} new sidecars...`);

  if (APPLY) {
    for (const r of results) {
      if (r.status !== 'ready') continue;
      writeFileSync(r.file, r.content);
      console.log(`  → ${r.file}`);
    }
  } else {
    console.log('  [DRY-RUN] use --apply to write files');
  }

  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  const ready = results.filter(r => r.status === 'ready').length;
  const skipped = results.filter(r => r.status === 'skip-exists').length;
  const missing = results.filter(r => r.status === 'not-found-in-introspect').length;
  console.log(`Ready to write: ${ready}`);
  console.log(`Already exist:  ${skipped}`);
  console.log(`Not in introspect: ${missing}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main();