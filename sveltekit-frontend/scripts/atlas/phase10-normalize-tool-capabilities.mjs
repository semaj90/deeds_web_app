#!/usr/bin/env node
/**
 * Phase 10 §5a: Normalize tool_registry.tool_capabilities/tool_constraints to a common shape.
 *
 * Resolves a real design gap found 2026-09-16 (openspec/changes/add-packet-ontology-registry/
 * tasks.md §5): tool_registry holds 3 distinct tool categories, each with a different (and, until
 * now, undocumented) capability shape — api:* routes (HTTP methods), mcp:* generic tools (a
 * placeholder tag), and 6 individually-named canonical tools (empty — never backfilled at all).
 * Section 5's schema-aware filtering design assumed a single supportedPacketTypes/supportedLanguages/
 * supportedExtensions shape that had zero real data anywhere.
 *
 * This migration is ADDITIVE, not a replace — existing keys are preserved verbatim inside the new
 * shape (httpMethods for api:*, legacyTag for mcp:*), new keys are added alongside them. No data
 * is destroyed. See tasks.md §5a for the full per-category backfill table this implements.
 */

import { Command } from 'commander';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const program = new Command();
program
  .option('--dry-run', 'Show what would be changed without applying')
  .option('--apply', 'Apply changes to the database')
  .option('--verbose', 'Show per-row plan detail');
program.parse(process.argv);
const options = program.opts();
const DRY_RUN = options.dryRun;
const VERBOSE = options.verbose;

// Per-category backfill values for the 6 canonical tools — exact table from tasks.md §5a.
const CANONICAL_TOOL_CLASSIFICATION = {
  'rg.lexical_search': { supportedPacketTypes: ['code', 'test', 'doc'], domainTags: ['lexical-search'] },
  'qdrant.dense_search': { supportedPacketTypes: [], domainTags: ['vector-search'] },
  'ornith.explain_code': { supportedPacketTypes: ['code'], domainTags: ['llm-explain'] },
  'trace.kag_search': { supportedPacketTypes: [], domainTags: ['kag', 'graph-rag'] },
  'atlas.topology_expand': { supportedPacketTypes: [], domainTags: ['topology', 'graph'] },
  'neo4j.dependency_closure': { supportedPacketTypes: ['code'], domainTags: ['graph', 'dependency'] },
};

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Builds the new tool_capabilities value for one row. Never drops existing data. */
function buildCapabilities(toolId, existingCapabilities) {
  const base = {
    supportedPacketTypes: [],
    supportedLanguages: [],
    supportedExtensions: [],
    domainTags: [],
    deprecated: false,
  };

  if (toolId.startsWith('api:')) {
    return {
      ...base,
      httpMethods: Array.isArray(existingCapabilities) ? existingCapabilities : [],
      supportedPacketTypes: ['api'],
    };
  }
  if (toolId.startsWith('mcp:')) {
    return {
      ...base,
      legacyTag: Array.isArray(existingCapabilities) ? existingCapabilities : [],
    };
  }
  if (CANONICAL_TOOL_CLASSIFICATION[toolId]) {
    return { ...base, ...CANONICAL_TOOL_CLASSIFICATION[toolId] };
  }
  // Unknown category (new tool added since this script was written) — permissive wildcard
  // default, never a guess. Preserve whatever was already there under a generic key.
  return { ...base, legacyValue: existingCapabilities ?? null };
}

/** Builds the new tool_constraints value for one row. Preserves existing keys verbatim. */
function buildConstraints(existingConstraints) {
  const base = isPlainObject(existingConstraints) ? existingConstraints : {};
  return { ...base, maxLatencyMs: base.maxLatencyMs ?? null };
}

async function main() {
  console.log('🔄 Phase 10 §5a: Normalize tool_capabilities/tool_constraints');
  console.log(DRY_RUN ? '(DRY RUN - no changes will be applied)' : '(APPLY mode)');
  console.log('');

  const result = await pool.query(
    `SELECT tool_id, tool_capabilities, tool_constraints FROM tool_registry ORDER BY tool_id;`
  );

  const plan = result.rows.map((row) => ({
    tool_id: row.tool_id,
    newCapabilities: buildCapabilities(row.tool_id, row.tool_capabilities),
    newConstraints: buildConstraints(row.tool_constraints),
  }));

  const byCategory = { api: 0, mcp: 0, canonical: 0, unknown: 0 };
  for (const p of plan) {
    if (p.tool_id.startsWith('api:')) byCategory.api++;
    else if (p.tool_id.startsWith('mcp:')) byCategory.mcp++;
    else if (CANONICAL_TOOL_CLASSIFICATION[p.tool_id]) byCategory.canonical++;
    else byCategory.unknown++;
  }

  console.log(`📊 ${plan.length} tool_registry rows found:`);
  console.log(`   api:*        ${byCategory.api}`);
  console.log(`   mcp:*        ${byCategory.mcp}`);
  console.log(`   canonical    ${byCategory.canonical} (expect 6)`);
  console.log(`   unknown      ${byCategory.unknown} (new tools since this script was written — check these)`);
  console.log('');

  if (VERBOSE) {
    for (const p of plan.slice(0, 5)) {
      console.log(`   ${p.tool_id}`);
      console.log(`     capabilities: ${JSON.stringify(p.newCapabilities)}`);
      console.log(`     constraints:  ${JSON.stringify(p.newConstraints)}`);
    }
    if (plan.length > 5) console.log(`   ... and ${plan.length - 5} more`);
    console.log('');
  }

  if (DRY_RUN) {
    console.log('✨ Dry run complete. Use --apply to write these changes.');
    process.exit(0);
  }

  if (!options.apply) {
    console.error('❌ Specify --dry-run or --apply.');
    process.exit(1);
  }

  let updated = 0;
  for (const p of plan) {
    await pool.query(
      `UPDATE tool_registry SET tool_capabilities = $2, tool_constraints = $3, updated_at = NOW()
       WHERE tool_id = $1;`,
      [p.tool_id, JSON.stringify(p.newCapabilities), JSON.stringify(p.newConstraints)]
    );
    updated++;
  }

  console.log(`✅ Updated ${updated}/${plan.length} rows.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
