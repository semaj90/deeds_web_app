#!/usr/bin/env node
/**
 * weekly-cold-archive.mjs
 *
 * Aggregate the last 7 nightly OpenCode summaries into a cold archive bundle.
 * The bundle is written to disk and, when DATABASE_URL is available, mirrored
 * into ace_context_sources as a durable weekly note trail for ACE retrieval.
 *
 * Usage:
 *   node scripts/opencode/weekly-cold-archive.mjs
 *   node scripts/opencode/weekly-cold-archive.mjs --dry-run
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const DRY_RUN = process.argv.includes('--dry-run');

const NIGHTLY_DIR = resolve(ROOT, '.opencode', 'summaries');
const OUT_DIR = resolve(ROOT, '.opencode', 'cold-archive');
const ISO = new Date().toISOString();
const WEEK_KEY = isoWeekKey(new Date());
const OUT_MD = resolve(OUT_DIR, `weekly-${WEEK_KEY}.md`);
const OUT_JSON = resolve(OUT_DIR, `weekly-${WEEK_KEY}.json`);

function isoWeekKey(date) {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

async function listNightlyFiles() {
  if (!existsSync(NIGHTLY_DIR)) return [];
  const entries = await readdir(NIGHTLY_DIR);
  return entries
    .filter((name) => /^nightly-\d{4}-\d{2}-\d{2}\.md$/.test(name))
    .sort()
    .reverse()
    .slice(0, 7)
    .map((name) => resolve(NIGHTLY_DIR, name));
}

async function readNightlyBundle(paths) {
  const bundle = [];
  for (const path of paths) {
    try {
      const content = await readFile(path, 'utf8');
      const rel = relative(ROOT, path).replace(/\\/g, '/');
      const lines = content.split(/\r?\n/);
      const title = lines.find((line) => line.startsWith('# '))?.slice(2).trim() ?? rel;
      const openTasks = lines.find((line) => /^## Open Tasks/.test(line)) ?? null;
      bundle.push({
        path: rel,
        title,
        bytes: Buffer.byteLength(content, 'utf8'),
        sha256: sha256(content),
        openTasks,
        content,
      });
    } catch {
      // skip unreadable file
    }
  }
  return bundle;
}

async function insertPostgresArchive(record) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return { status: 'skipped', reason: 'DATABASE_URL not set' };

  let pg;
  try {
    ({ default: pg } = await import('pg'));
  } catch {
    return { status: 'skipped', reason: 'pg not installed' };
  }

  const client = new pg.Client({ connectionString: dbUrl, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query(
      `
      INSERT INTO ace_context_sources (
        source_kind,
        stable_key,
        file_path,
        directory_path,
        score,
        reason,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      ON CONFLICT DO NOTHING
      `,
      [
        'wiki_note',
        record.stableKey,
        record.filePath,
        record.directoryPath,
        0.9,
        'weekly cold archive from nightly summaries',
        JSON.stringify(record.metadata),
      ]
    );
    return { status: 'inserted' };
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const nightlyPaths = await listNightlyFiles();
  const bundle = await readNightlyBundle(nightlyPaths);
  const totalBytes = bundle.reduce((sum, item) => sum + item.bytes, 0);

  const record = {
    weekKey: WEEK_KEY,
    generatedAt: ISO,
    nightlyCount: bundle.length,
    totalBytes,
    sources: bundle.map(({ path, title, bytes, sha256 }) => ({ path, title, bytes, sha256 })),
    stableKey: `weekly-cold-archive:${WEEK_KEY}`,
    filePath: relative(ROOT, OUT_MD).replace(/\\/g, '/'),
    directoryPath: '.opencode/cold-archive',
    metadata: {
      kind: 'weekly_cold_archive',
      weekKey: WEEK_KEY,
      nightlyCount: bundle.length,
      nightlySources: bundle.map(({ path, sha256 }) => ({ path, sha256 })),
      totalBytes,
      generatedAt: ISO,
    },
  };

  const md = [
    `# Weekly Cold Archive — ${WEEK_KEY}`,
    '',
    `> Generated: ${ISO}`,
    '',
    `## Snapshot`,
    `- nightly summaries included: ${bundle.length}`,
    `- total bytes: ${totalBytes}`,
    `- output markdown: \`${record.filePath}\``,
    '',
    `## Included Nightlies`,
    ...bundle.map((item) => `- \`${item.path}\` — ${item.title} (${item.bytes} bytes, sha=${item.sha256})`),
    '',
    `## Notes`,
    '- This archive is a cold, durable rollup of the last seven nightly summaries.',
    '- It is meant for later ACE retrieval and operator review.',
    '- It does not replace the live hot cache or nightly summary lane.',
  ].join('\n');

  const json = JSON.stringify(record, null, 2);

  console.log(`\n📦 Weekly cold archive — ${WEEK_KEY}${DRY_RUN ? ' [DRY]' : ''}`);
  console.log(`   nightly summaries : ${bundle.length}`);
  console.log(`   total bytes       : ${totalBytes}`);
  console.log(`   output md         : ${record.filePath}`);

  if (bundle.length === 0) {
    console.log('\n   no nightly summaries found — skipping cold archive');
    return;
  }

  if (DRY_RUN) {
    console.log('\n   dry-run only — no files written, no DB insert attempted');
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_MD, md, 'utf8');
  await writeFile(OUT_JSON, json, 'utf8');

  const pgResult = await insertPostgresArchive(record);
  console.log(`   postgres          : ${pgResult.status}${pgResult.reason ? ` (${pgResult.reason})` : ''}`);
  console.log(`   ✅ wrote ${relative(ROOT, OUT_MD).replace(/\\/g, '/')}`);
  console.log(`   ✅ wrote ${relative(ROOT, OUT_JSON).replace(/\\/g, '/')}`);
}

main().catch((err) => {
  console.error(`✗ weekly-cold-archive failed: ${err.message}`);
  process.exit(1);
});
