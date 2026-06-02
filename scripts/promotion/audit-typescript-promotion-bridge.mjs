#!/usr/bin/env node
/**
 * audit-typescript-promotion-bridge.mjs
 * READ-ONLY. Greps for TS modules that interact with promotion tables/paths.
 * Emits .tmp/typescript-promotion-bridge-audit.{json,md}
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const SRC = resolve(ROOT, 'sveltekit-frontend/src');

function rg(pattern, extraFlags = '') {
  try {
    const out = execSync(
      `rg --json -l ${extraFlags} "${pattern}" "${SRC}"`,
      { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }
    );
    const files = out.trim().split('\n')
      .filter(Boolean)
      .map(l => { try { const o = JSON.parse(l); return o.type === 'match' ? null : o.data?.path?.text; } catch { return null; } })
      .filter(Boolean);
    // rg --json -l gives one 'summary' line per file match differently — use plain -l
    return [];
  } catch { return []; }
}

function rgFiles(pattern) {
  try {
    return execSync(`rg -l "${pattern}" "${SRC}"`, { encoding: 'utf8', maxBuffer: 4*1024*1024 })
      .trim().split('\n').filter(Boolean)
      .map(f => f.replaceAll('\\', '/').replace(ROOT.replaceAll('\\','/') + '/', ''));
  } catch { return []; }
}

const PROBES = [
  { key: 'reads_task_semantic_packets', pattern: 'task_semantic_packets' },
  { key: 'reads_parent_atlas_documents', pattern: 'parent_atlas_documents' },
  { key: 'reads_parent_atlas_vectors', pattern: 'parent_atlas_vectors' },
  { key: 'reads_nes_chrom_packets', pattern: 'nes_chrom_packets' },
  { key: 'reads_code_llm_index', pattern: 'code_llm_index' },
  { key: 'uses_source_ref', pattern: 'source_ref' },
  { key: 'uses_alias_id', pattern: 'alias_id' },
  { key: 'uses_qdrant_point_id', pattern: 'qdrant_point_id' },
  { key: 'calls_qdrant_upsert', pattern: 'qdrantClient|qdrant.*upsert|upsertPoints' },
  { key: 'calls_promote_to_postgres', pattern: 'promote-to-postgres|promoteToPostgres' },
  { key: 'builds_parent_atlas_packet', pattern: 'parent_atlas|parentAtlas' },
  { key: 'dollar_lib_alias', pattern: '\$lib/server' },
];

async function main() {
  const result = { generated: new Date().toISOString(), probes: {} };

  for (const { key, pattern } of PROBES) {
    const files = rgFiles(pattern);
    result.probes[key] = { count: files.length, files: files.slice(0, 10) };
  }

  // Check $lib alias resolution issue in standalone scripts
  result.dollar_lib_in_scripts = rgFiles('\$lib').filter(f => f.includes('/scripts/')).length;

  // Gates
  result.gates = {
    task_semantic_packets_has_ts_consumers: result.probes['reads_task_semantic_packets'].count > 0,
    parent_atlas_documents_has_ts_consumers: result.probes['reads_parent_atlas_documents'].count > 0,
    qdrant_upsert_callers_exist: result.probes['calls_qdrant_upsert'].count > 0,
    dollar_lib_in_scripts_count: result.dollar_lib_in_scripts,
    dollar_lib_breaks_in_standalone: result.dollar_lib_in_scripts > 0,
    source_ref_ts_consumers: result.probes['uses_source_ref'].count,
    alias_id_ts_consumers: result.probes['uses_alias_id'].count,
  };

  mkdirSync(resolve(ROOT, '.tmp'), { recursive: true });
  const jsonPath = resolve(ROOT, '.tmp/typescript-promotion-bridge-audit.json');
  const mdPath = resolve(ROOT, '.tmp/typescript-promotion-bridge-audit.md');
  writeFileSync(jsonPath, JSON.stringify(result, null, 2));

  const icon = v => v ? '✅' : '❌';
  const lines = [
    '# TypeScript Promotion Bridge Audit',
    `**Generated:** ${result.generated}`,
    '',
    '## Gates',
    '| Gate | Value |',
    '|------|-------|',
    ...Object.entries(result.gates).map(([k, v]) =>
      `| ${k} | ${typeof v === 'boolean' ? icon(v)+' '+v : v} |`
    ),
    '',
    '> ⚠ **$lib alias breaks in standalone scripts** — promotion scripts must use relative imports or tsx with path alias resolution.',
    '',
    '## Probe Results',
    ...Object.entries(result.probes).map(([k, v]) =>
      `### ${k}\n- Files: ${v.count}\n${v.files.slice(0,5).map(f=>`  - ${f}`).join('\n')}`
    ),
  ];
  writeFileSync(mdPath, lines.join('\n'));

  console.log('[audit-ts-bridge] Probes:');
  for (const [k,v] of Object.entries(result.probes)) {
    console.log(`  ${v.count > 0 ? '✅' : '—'} ${k}: ${v.count} files`);
  }
  console.log(`\n  ⚠  $lib aliases in scripts: ${result.dollar_lib_in_scripts} — use relative imports in standalone scripts`);
  console.log(`\nReports: ${jsonPath}\n         ${mdPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
