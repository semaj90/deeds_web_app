#!/usr/bin/env node
/**
 * index-vault-md.mjs
 *
 * Scans every markdown surface in the project and ingests it into
 * `vault_md_index` so the agent can query the merged content + frontmatter
 * joins from one Postgres table.
 *
 * Sources scanned:
 *   • docs/obsidian-vault/Files/*.md       md_kind='file'
 *   • docs/obsidian-vault/Clusters/*.md    md_kind='cluster'
 *   • docs/obsidian-vault/Indexes/*.md     md_kind='index'
 *   • docs/obsidian-vault/index.md         md_kind='index'
 *   • src/** /AGENTS.md                    md_kind='agents_md'
 *   • memory/** /*.md                      md_kind='memory'
 *
 * Frontmatter parser: minimal — handles `key: "value"`, `key: value`,
 * `key: ["a","b"]`, `key: 123`, `key: true|false`. No anchors/refs/blocks
 * (the vault generator only uses flat scalar/array values).
 *
 * Idempotency: body_hash is sha256(body). UPSERT on vault_path; rows where
 * body_hash matches are touched only by last_indexed_at = now() (no
 * frontmatter recompute, no link reparse).
 *
 * Usage:
 *   node scripts/index-vault-md.mjs --dry-run
 *   node scripts/index-vault-md.mjs --apply
 *   node scripts/index-vault-md.mjs --apply --kind file
 *   node scripts/index-vault-md.mjs --apply --limit 100
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'node:fs/promises';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');

const args  = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY   = !APPLY;
const argVal = (name, def) => {
  const eq = args.find(a => a.startsWith(`${name}=`));
  if (eq) return eq.split('=')[1];
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return def;
};
const KIND_FILTER = argVal('--kind', null);
const LIMIT       = parseInt(argVal('--limit', '999999'), 10);

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('❌ DATABASE_URL not set'); process.exit(1); }

const pool = new pg.Pool({ connectionString: DB_URL, max: 4 });

console.log(`\n📚 Vault md indexer${DRY ? ' [DRY]' : ''}`);
if (KIND_FILTER) console.log(`   kind filter: ${KIND_FILTER}`);
console.log(`   limit:       ${LIMIT}\n`);

// ── Frontmatter parser ────────────────────────────────────────────────────
function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return { frontmatter: {}, body: text };
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) return { frontmatter: {}, body: text };
  const yaml = text.slice(4, end);
  const body = text.slice(end + 5);
  const fm = {};
  for (const line of yaml.split('\n')) {
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const k = m[1];
    let v = m[2].trim();
    if (v === '') continue;
    if (v.startsWith('"') && v.endsWith('"')) {
      fm[k] = v.slice(1, -1);
    } else if (v.startsWith('[') && v.endsWith(']')) {
      try { fm[k] = JSON.parse(v); } catch { fm[k] = v; }
    } else if (v === 'true' || v === 'false') {
      fm[k] = v === 'true';
    } else if (/^-?\d+(\.\d+)?$/.test(v)) {
      fm[k] = parseFloat(v);
    } else {
      fm[k] = v;
    }
  }
  return { frontmatter: fm, body };
}

function parseLinks(body) {
  const out = new Set();
  const re = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
  let m;
  while ((m = re.exec(body)) !== null) out.add(m[1].trim());
  return [...out];
}

function bodyHash(body) {
  return createHash('sha256').update(body).digest('hex').slice(0, 64);
}

// ── Source enumeration ────────────────────────────────────────────────────
async function* enumerate() {
  const vaultRoot = join(ROOT, 'docs/obsidian-vault');
  const memoryRoot = join(ROOT, 'memory');
  const srcRoot   = join(ROOT, 'src');

  if (!KIND_FILTER || KIND_FILTER === 'file') {
    for await (const p of glob('docs/obsidian-vault/Files/*.md', { cwd: ROOT })) {
      yield { kind: 'file', path: p };
    }
  }
  if (!KIND_FILTER || KIND_FILTER === 'cluster') {
    for await (const p of glob('docs/obsidian-vault/Clusters/*.md', { cwd: ROOT })) {
      yield { kind: 'cluster', path: p };
    }
  }
  if (!KIND_FILTER || KIND_FILTER === 'index') {
    for await (const p of glob('docs/obsidian-vault/Indexes/*.md', { cwd: ROOT })) {
      yield { kind: 'index', path: p };
    }
    if (existsSync(join(vaultRoot, 'index.md')))   yield { kind: 'index', path: 'docs/obsidian-vault/index.md' };
    if (existsSync(join(vaultRoot, 'README.md')))  yield { kind: 'index', path: 'docs/obsidian-vault/README.md' };
  }
  if (!KIND_FILTER || KIND_FILTER === 'agents_md') {
    for await (const p of glob('src/**/AGENTS.md', { cwd: ROOT })) {
      yield { kind: 'agents_md', path: p };
    }
  }
  if (!KIND_FILTER || KIND_FILTER === 'memory') {
    if (existsSync(memoryRoot)) {
      for await (const p of glob('memory/**/*.md', { cwd: ROOT })) {
        yield { kind: 'memory', path: p };
      }
    }
  }
}

// ── Per-row mapping ───────────────────────────────────────────────────────
function deriveJoins(kind, vaultPath, fm) {
  const out = {
    source_path:   null,
    cluster_id:    null,
    embedding_id:  null,
    agents_md_key: null,
    title:         fm.title ?? null,
    summary:       fm.summary ?? fm.topic ?? null,
  };
  if (kind === 'file') {
    out.source_path   = fm.path ?? null;
    out.cluster_id    = (typeof fm.clusterId === 'number') ? fm.clusterId : null;
    out.embedding_id  = fm.embedding_id ?? null;
  } else if (kind === 'cluster') {
    out.cluster_id    = (typeof fm.clusterId === 'number') ? fm.clusterId : null;
    out.title         = out.title ?? fm.cluster_id ?? null;
    out.summary       = fm.topic ?? out.summary;
  } else if (kind === 'agents_md') {
    out.source_path   = vaultPath;
    out.agents_md_key = `agents:${vaultPath}`;
  }
  return out;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  let scanned = 0, inserted = 0, updated = 0, unchanged = 0, skipped = 0;
  const byKind = {};

  for await (const entry of enumerate()) {
    if (scanned >= LIMIT) break;
    scanned++;
    byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;

    let raw;
    try { raw = await readFile(join(ROOT, entry.path), 'utf8'); }
    catch { skipped++; continue; }

    const { frontmatter, body } = parseFrontmatter(raw);
    const links = parseLinks(body);
    const hash  = bodyHash(body);
    const joins = deriveJoins(entry.kind, entry.path, frontmatter);

    if (DRY) {
      if (scanned <= 8) {
        console.log(`   [dry] ${entry.kind.padEnd(10)} ${entry.path.slice(0, 70)}`);
        console.log(`         source=${joins.source_path ?? '-'}  cluster=${joins.cluster_id ?? '-'}  links=${links.length}  hash=${hash.slice(0, 8)}…`);
      }
      inserted++;
      continue;
    }

    const { rows: [{ was_inserted, prev_hash }] } = await pool.query(
      `WITH probe AS (
         SELECT body_hash AS prev_hash FROM vault_md_index WHERE vault_path = $1
       )
       INSERT INTO vault_md_index (
         vault_path, md_kind, source_path, cluster_id, embedding_id,
         agents_md_key, title, summary, frontmatter, links_out,
         body_hash, body_size, last_indexed_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::text[], $11, $12, now())
       ON CONFLICT (vault_path) DO UPDATE SET
         md_kind         = EXCLUDED.md_kind,
         source_path     = EXCLUDED.source_path,
         cluster_id      = EXCLUDED.cluster_id,
         embedding_id    = EXCLUDED.embedding_id,
         agents_md_key   = EXCLUDED.agents_md_key,
         title           = EXCLUDED.title,
         summary         = EXCLUDED.summary,
         frontmatter     = EXCLUDED.frontmatter,
         links_out       = EXCLUDED.links_out,
         body_hash       = EXCLUDED.body_hash,
         body_size       = EXCLUDED.body_size,
         last_indexed_at = now()
       RETURNING (xmax = 0) AS was_inserted,
                 (SELECT prev_hash FROM probe) AS prev_hash`,
      [
        entry.path, entry.kind, joins.source_path, joins.cluster_id, joins.embedding_id,
        joins.agents_md_key, joins.title, joins.summary,
        JSON.stringify(frontmatter), links,
        hash, body.length,
      ],
    );
    if (was_inserted)              inserted++;
    else if (prev_hash === hash)   unchanged++;
    else                           updated++;
  }

  console.log(`\n   scanned:    ${scanned}`);
  console.log(`   inserted:   ${inserted}`);
  console.log(`   updated:    ${updated}   (body_hash changed)`);
  console.log(`   unchanged:  ${unchanged}  (body_hash match — skipped re-write of frontmatter/links)`);
  console.log(`   skipped:    ${skipped}    (read errors)`);
  console.log(`   by kind:   `, byKind);

  if (!DRY) {
    const { rows: [stats] } = await pool.query(`
      SELECT
        (SELECT count(*) FROM vault_md_index)                                                AS total,
        (SELECT count(*) FROM vault_md_index WHERE source_path IS NOT NULL)                  AS with_source,
        (SELECT count(*) FROM vault_md_index WHERE cluster_id IS NOT NULL)                   AS with_cluster,
        (SELECT count(*) FROM vault_md_index WHERE embedding_id IS NOT NULL)                 AS with_embedding,
        (SELECT count(*) FROM vault_md_index WHERE agents_md_key IS NOT NULL)                AS with_agents,
        (SELECT sum(array_length(links_out, 1)) FROM vault_md_index WHERE links_out <> '{}') AS total_links
    `);
    console.log(`\n   DB state: ${stats.total} rows`);
    console.log(`     ↳ ${stats.with_source} link to source files`);
    console.log(`     ↳ ${stats.with_cluster} link to clusters`);
    console.log(`     ↳ ${stats.with_embedding} link to qdrant embeddings`);
    console.log(`     ↳ ${stats.with_agents} are AGENTS.md scopes`);
    console.log(`     ↳ ${stats.total_links} total wiki-links extracted`);
  }

  await pool.end();
  console.log(`\n${DRY ? '🔍 Dry-run complete — re-run with --apply to write.' : '✅ Vault md indexer complete.'}\n`);
}

main().catch(async err => {
  console.error('❌ Indexer failed:', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
