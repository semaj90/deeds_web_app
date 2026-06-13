import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new Pool({ connectionString: DATABASE_URL });

const SEARCH_ROOTS = [
  path.join(ROOT, 'sveltekit-frontend'),
  ROOT,
  path.join(ROOT, 'sveltekit-frontend', 'src'),
];

function normalizePath(p) {
  if (!p) return null;
  return p.replace(/\\/g, '/').replace(/^[/\\]+/, '');
}

function resolveFile(sourcePath) {
  const norm = normalizePath(sourcePath);
  if (!norm) return null;
  const base = norm.replace(/#.*$/, '');
  for (const root of SEARCH_ROOTS) {
    const abs = path.join(root, base);
    if (fs.existsSync(abs)) return { abs, norm: base };
  }
  return null;
}

function buildMetadata(sourcePath) {
  const norm = normalizePath(sourcePath)?.replace(/#.*$/, '') ?? null;
  const resolved = resolveFile(sourcePath);

  if (!resolved) {
    return {
      path: norm,
      file_url: null,
      repo_url: null,
      source_url: null,
      mtime: null,
      hash: null,
      directory_path: norm ? norm.split('/').slice(0, -1).join('/') || null : null,
      indexed_at: new Date().toISOString(),
    };
  }

  const { abs, norm: resolvedNorm } = resolved;
  let stat = null;
  let hash = null;

  try {
    stat = fs.statSync(abs);
  } catch { /* non-fatal */ }

  try {
    const buf = fs.readFileSync(abs);
    hash = `sha256:${createHash('sha256').update(buf).digest('hex')}`;
  } catch { /* non-fatal */ }

  const fileUrl = `file:///${abs.replace(/\\/g, '/')}`;
  const dirPath = resolvedNorm.split('/').slice(0, -1).join('/') || null;

  return {
    path: resolvedNorm,
    file_url: fileUrl,
    repo_url: null,
    source_url: null,
    mtime: stat?.mtime.toISOString() ?? null,
    hash,
    directory_path: dirPath,
    indexed_at: new Date().toISOString(),
  };
}

async function run() {
  console.log('=== Step 1: Copying metadata from payload for existing rows via SQL ===');
  const sqlCopy = `
    UPDATE atlas_packets
    SET metadata = jsonb_build_object(
      'path', payload->>'path',
      'file_url', payload->>'file_url',
      'repo_url', payload->>'repo_url',
      'source_url', payload->>'source_url',
      'mtime', payload->>'mtime',
      'hash', payload->>'hash',
      'directory_path', payload->>'directory_path',
      'indexed_at', COALESCE(payload->>'indexed_at', payload->>'enriched_at')
    )
    WHERE payload->>'hash' IS NOT NULL
      AND (metadata->>'hash' IS NULL OR metadata = '{}'::jsonb);
  `;
  
  const resCopy = await pool.query(sqlCopy);
  console.log(`  SQL copy: Updated ${resCopy.rowCount} rows.`);

  console.log('=== Step 2: Resolving leftover files on disk and computing hashes ===');
  const { rows } = await pool.query(`
    SELECT packet_id, source_path, payload->>'path' AS payload_path
    FROM atlas_packets
    WHERE (source_path IS NOT NULL OR payload->>'path' IS NOT NULL)
      AND (metadata->>'hash' IS NULL OR metadata = '{}'::jsonb)
  `);

  console.log(`  Found ${rows.length} rows needing file-based metadata resolution.`);

  let resolved = 0;
  for (const row of rows) {
    const src = row.source_path || row.payload_path;
    if (!src) continue;

    const meta = buildMetadata(src);
    await pool.query(`
      UPDATE atlas_packets
      SET 
        metadata = $1::jsonb,
        payload = COALESCE(payload, '{}') || $1::jsonb,
        updated_at = now()
      WHERE packet_id = $2
    `, [JSON.stringify(meta), row.packet_id]);
    resolved++;
  }

  console.log(`  File resolution: Resolved and updated ${resolved} rows.`);

  console.log('=== Step 3: Verifying final metadata coverage ===');
  const coverage = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE metadata IS NOT NULL AND metadata != '{}'::jsonb) AS has_metadata,
      COUNT(*) FILTER (WHERE metadata ? 'path') AS has_path,
      COUNT(*) FILTER (WHERE metadata ? 'hash') AS has_hash,
      COUNT(*) FILTER (WHERE metadata ? 'mtime') AS has_mtime
    FROM atlas_packets;
  `);
  console.log(JSON.stringify(coverage.rows, null, 2));

  await pool.end();
}

run().catch(console.error);
