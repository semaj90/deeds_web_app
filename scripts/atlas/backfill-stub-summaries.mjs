#!/usr/bin/env node
/**
 * scripts/atlas/backfill-stub-summaries.mjs
 *
 * Backfills the `summary` column for parent_atlas_documents rows where
 * length(summary) < 20. No LLM calls — fully deterministic.
 *
 * Strategy:
 *   1. JSON/config/dependency files → derive from file path + source_kind
 *   2. Source files with summary_lod1 set → copy lod1 into summary
 *   3. Source files with route_handlers → derive from handlers + feature_id
 *   4. Source files with exports → derive from exports + feature_id
 *   5. Remaining → derive from rel_path + feature_id + file_ext
 *
 * Also backfills missing feature_id and source_ref parsing:
 *   - source_ref → rel_path (already populated, just verify)
 *   - source_ref → file_ext
 *   - source_ref path segments → feature_id if null
 *
 * Usage:
 *   node scripts/atlas/backfill-stub-summaries.mjs --dry-run
 *   node scripts/atlas/backfill-stub-summaries.mjs --apply
 *   node scripts/atlas/backfill-stub-summaries.mjs --apply --batch=500
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');
const APPLY = process.argv.includes('--apply');
const batchArg = process.argv.find(a => a.startsWith('--batch='));
const BATCH_SIZE = batchArg ? parseInt(batchArg.split('=')[1]) : 500;

function loadEnv() {
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
}
loadEnv();

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

// ── Deterministic summary derivation ─────────────────────────────────────────

const EXT_LABELS = {
  '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML', '.toml': 'TOML',
  '.ts': 'TypeScript', '.svelte': 'Svelte', '.mjs': 'ES module',
  '.js': 'JavaScript', '.py': 'Python', '.rs': 'Rust', '.go': 'Go',
  '.md': 'Markdown', '.sql': 'SQL', '.proto': 'Protobuf',
  '.css': 'CSS', '.scss': 'SCSS', '.html': 'HTML', '.sh': 'Shell script',
  '.d.ts': 'TypeScript declarations',
};

const KIND_LABELS = {
  dependency: 'Vendor dependency',
  generated: 'Auto-generated',
  config: 'Config',
  test: 'Test',
  doc: 'Documentation',
  source: null,
};

function basename(sourceRef) {
  return path.basename(sourceRef);
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function featureLabel(featureId) {
  if (!featureId) return null;
  return capitalize(featureId.replace(/-/g, ' '));
}

function routeHandlerSummary(handlers, featureId) {
  if (!handlers || !Array.isArray(handlers) || handlers.length === 0) return null;
  const methods = [...new Set(handlers.map(h => (h.method ?? h).toUpperCase()))].slice(0, 4);
  const feat = featureLabel(featureId);
  return `${feat ? feat + ' — ' : ''}${methods.join('/')} endpoint.`;
}

function exportsSummary(exports, featureId) {
  if (!exports) return null;
  const names = Array.isArray(exports)
    ? exports.map(e => (typeof e === 'string' ? e : e.name ?? e.exported)).filter(Boolean)
    : Object.keys(exports);
  if (names.length === 0) return null;
  const feat = featureLabel(featureId);
  const top = names.slice(0, 4).join(', ');
  return `${feat ? feat + ' — e' : 'E'}xports: ${top}${names.length > 4 ? ` +${names.length - 4} more` : ''}.`;
}

function pathDerivedFeatureId(sourceRef) {
  const parts = sourceRef.split('/').filter(Boolean);
  // Skip common noise prefixes
  const skip = new Set(['src', 'lib', 'server', 'routes', 'api', 'sveltekit-frontend',
    'scripts', 'docker', 'services', 'dist', 'build', '.svelte-kit', 'node_modules',
    'target', 'release', 'debug', '.fingerprint', '.venv', 'site-packages']);
  const meaningful = parts.filter(p => !skip.has(p) && !p.startsWith('.') && p !== 'index.ts' && p !== '+server.ts' && p !== '+page.svelte');
  const candidate = meaningful[0] ?? parts[parts.length - 2] ?? parts[parts.length - 1];
  return candidate ? candidate.replace(/\.[^.]+$/, '') : null;
}

function deriveSummary(row) {
  const {
    source_ref, feature_id, file_ext, source_kind,
    summary_lod1, route_handlers, exports: rowExports,
    imports, is_route, is_svelte_comp, has_auth, has_zod, line_count,
  } = row;

  const ext = file_ext ?? path.extname(source_ref);
  const name = basename(source_ref);
  const feat = feature_id ?? pathDerivedFeatureId(source_ref);
  const kindLabel = KIND_LABELS[source_kind ?? 'source'];

  // 1. Use existing lod1 if available and substantive
  if (summary_lod1 && summary_lod1.length >= 20) {
    return summary_lod1;
  }

  // 2. Config / dependency / generated — deterministic from kind + ext + name
  if (source_kind === 'dependency') {
    return `Vendor dependency: ${name}.`;
  }
  if (source_kind === 'generated') {
    return `Auto-generated file: ${name}.`;
  }
  if (source_kind === 'config' || ['.json', '.yaml', '.yml', '.toml'].includes(ext)) {
    const extLabel = EXT_LABELS[ext] ?? ext.replace('.', '').toUpperCase();
    const featStr = feat ? ` for ${featureLabel(feat)}` : '';
    return `${extLabel} config${featStr}: ${name}.`;
  }
  if (source_kind === 'doc' || ['.md', '.mdx'].includes(ext)) {
    return `Documentation: ${featureLabel(feat) ?? name}.`;
  }
  if (source_kind === 'test' || name.includes('.test.') || name.includes('.spec.')) {
    return `Tests for ${featureLabel(feat) ?? name.replace(/\.(test|spec)\.(ts|js|mjs)$/, '')}.`;
  }

  // 3. Route with handlers
  if (is_route) {
    const handlerSum = routeHandlerSummary(route_handlers, feat);
    if (handlerSum) return handlerSum;
    const extLabel = EXT_LABELS[ext] ?? 'module';
    const authStr = has_auth ? ' Auth required.' : '';
    return `${featureLabel(feat) ?? 'API'} route handler.${authStr}`;
  }

  // 4. Svelte component
  if (is_svelte_comp || ext === '.svelte') {
    return `${featureLabel(feat) ?? 'UI'} Svelte component.`;
  }

  // 5. Source file with exports
  const expSum = exportsSummary(rowExports, feat);
  if (expSum) return expSum;

  // 6. Fallback: feature + ext + line count hint
  const extLabel = EXT_LABELS[ext] ?? ext.replace('.', '').toUpperCase();
  const sizeHint = line_count && line_count > 300 ? ` (${line_count} lines)` : '';
  return `${featureLabel(feat) ?? extLabel} ${kindLabel ?? extLabel} module${sizeHint}.`;
}

function deriveFeatureId(sourceRef) {
  return pathDerivedFeatureId(sourceRef);
}

function deriveFileExt(sourceRef) {
  return path.extname(sourceRef) || null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══ Backfill Stub Summaries ════════════════════════════════');
  console.log(`  Mode:       ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Batch size: ${BATCH_SIZE}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  const { rows } = await pool.query(`
    SELECT
      id, source_ref, feature_id, rel_path, file_ext, source_kind,
      summary, summary_lod1, route_handlers, exports, imports,
      is_route, is_svelte_comp, has_auth, has_zod, line_count
    FROM parent_atlas_documents
    WHERE length(summary) < 20 OR summary IS NULL
    ORDER BY source_kind, source_ref
  `);

  console.log(`\n  Stub rows:  ${rows.length}`);

  const updates = [];

  for (const row of rows) {
    const newSummary = deriveSummary(row);
    const newFeatureId = row.feature_id ?? deriveFeatureId(row.source_ref);
    const newFileExt = row.file_ext ?? deriveFileExt(row.source_ref);

    const summaryChanged = newSummary && newSummary !== row.summary;
    const featureChanged = newFeatureId && newFeatureId !== row.feature_id;
    const extChanged = newFileExt && newFileExt !== row.file_ext;

    if (summaryChanged || featureChanged || extChanged) {
      updates.push({
        id: row.id,
        summary: summaryChanged ? newSummary : row.summary,
        feature_id: featureChanged ? newFeatureId : row.feature_id,
        file_ext: extChanged ? newFileExt : row.file_ext,
        source_ref: row.source_ref,
      });
    }
  }

  console.log(`  Updates:    ${updates.length}`);

  // Sample output
  const sample = updates.slice(0, 8);
  for (const u of sample) {
    console.log(`\n  ${u.source_ref}`);
    console.log(`    feature_id: ${u.feature_id}`);
    console.log(`    summary:    ${u.summary}`);
  }

  if (!APPLY) {
    console.log('\n  [dry-run] Pass --apply to write changes.');
    await pool.end();
    return;
  }

  // Apply in batches
  let applied = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const u of batch) {
        await client.query(
          `UPDATE parent_atlas_documents
           SET summary    = $1,
               feature_id = COALESCE(feature_id, $2),
               file_ext   = COALESCE(file_ext, $3),
               updated_at = now()
           WHERE id = $4`,
          [u.summary, u.feature_id, u.file_ext, u.id]
        );
      }
      await client.query('COMMIT');
      applied += batch.length;
      process.stdout.write(`\r  Applied: ${applied}/${updates.length}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('\n  ROLLBACK batch', i, err.message);
    } finally {
      client.release();
    }
  }

  // Final counts
  const { rows: stats } = await pool.query(`
    SELECT
      count(*) as total,
      count(*) FILTER (WHERE length(summary) >= 20) as has_summary,
      count(*) FILTER (WHERE feature_id IS NOT NULL) as has_feature_id,
      count(*) FILTER (WHERE file_ext IS NOT NULL) as has_file_ext
    FROM parent_atlas_documents
  `);
  const s = stats[0];
  console.log(`\n\n  Final state:`);
  console.log(`    Total docs:     ${s.total}`);
  console.log(`    Has summary:    ${s.has_summary} (${Math.round(s.has_summary/s.total*100)}%)`);
  console.log(`    Has feature_id: ${s.has_feature_id} (${Math.round(s.has_feature_id/s.total*100)}%)`);
  console.log(`    Has file_ext:   ${s.has_file_ext} (${Math.round(s.has_file_ext/s.total*100)}%)`);

  await pool.end();
  console.log('\n  Done.\n');
}

main().catch(err => { console.error(err); process.exit(1); });
