#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import pg from 'pg';
import { REPO_ROOT } from './_atlas-utils.mjs';

const { Pool } = pg;

const FRONTEND = join(REPO_ROOT, 'sveltekit-frontend');
const DRIZZLE_DIR = join(FRONTEND, 'drizzle');
const JOURNAL_PATH = join(DRIZZLE_DIR, 'meta', '_journal.json');

const ARGS = process.argv.slice(2);
const JSON_OUT = ARGS.includes('--json');

function loadEnv() {
  const env = { ...process.env };
  const envPath = join(FRONTEND, '.env');
  if (!existsSync(envPath)) return env;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !env[match[1]]) {
      env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return env;
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function readJournal() {
  if (!existsSync(JOURNAL_PATH)) return { entries: [] };
  return JSON.parse(readFileSync(JOURNAL_PATH, 'utf8'));
}

function scanMigrationFiles() {
  return readdirSync(DRIZZLE_DIR)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name) && statSync(join(DRIZZLE_DIR, name)).isFile())
    .map((name) => {
      const prefix = name.slice(0, 4);
      const stem = basename(name, '.sql');
      const owner = stem.replace(/^\d{4}_/, '').split('_')[0] ?? stem;
      const filePath = join(DRIZZLE_DIR, name);
      return {
        file: name,
        stem,
        prefix,
        owner,
        mtimeMs: statSync(filePath).mtimeMs,
        hash: sha256(readFileSync(filePath, 'utf8')),
      };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}

async function loadDbState(pool) {
  const drizzleRows = await pool.query('SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id');
  const legacyRows = await pool.query('SELECT filename, applied_at FROM public.migrations ORDER BY filename');
  return {
    drizzleRows: drizzleRows.rows,
    legacyRows: legacyRows.rows,
  };
}

function classifyFiles(files, journalTags, appliedTags) {
  const prefixGroups = new Map();
  for (const file of files) {
    if (!prefixGroups.has(file.prefix)) prefixGroups.set(file.prefix, []);
    prefixGroups.get(file.prefix).push(file);
  }

  const duplicatePrefixes = [];
  for (const [prefix, items] of prefixGroups.entries()) {
    if (items.length > 1) {
      duplicatePrefixes.push({
        prefix,
        files: items.map((item) => item.file),
        owners: [...new Set(items.map((item) => item.owner))],
      });
    }
  }

  const collisionPrefixes = new Set(duplicatePrefixes.map((entry) => entry.prefix));

  const classifications = files.map((file) => {
    const inJournal = journalTags.has(file.stem);
    const applied = appliedTags.has(file.stem);
    let status = 'FILE_ONLY';
    if (applied) status = 'APPLIED';
    else if (inJournal) status = 'JOURNALED_NOT_APPLIED';
    if (collisionPrefixes.has(file.prefix)) {
      status = 'NUMBER_COLLISION';
    }
    return {
      file: file.file,
      prefix: file.prefix,
      owner: file.owner,
      status,
      journaled: inJournal,
      applied,
      hash: file.hash,
    };
  });

  return { classifications, duplicatePrefixes };
}

async function main() {
  const journal = readJournal();
  const journalEntries = journal.entries ?? [];
  const journalTags = new Set(journalEntries.map((entry) => entry.tag));

  const files = scanMigrationFiles();
  const env = loadEnv();
  const conn = env.DATABASE_URL || process.env.DATABASE_URL || '';

  let dbState = { drizzleRows: [], legacyRows: [] };
  if (conn) {
    const pool = new Pool({ connectionString: conn, max: 1 });
    try {
      dbState = await loadDbState(pool);
    } finally {
      await pool.end();
    }
  }

  const appliedTags = new Set([
    ...dbState.drizzleRows.map((row) => String(row.id).padStart(4, '0')),
    ...dbState.legacyRows.map((row) => String(row.filename).replace(/\.sql$/, '')),
  ]);

  const { classifications, duplicatePrefixes } = classifyFiles(files, journalTags, appliedTags);

  const journalMissingFiles = journalEntries
    .map((entry) => `${entry.tag}.sql`)
    .filter((name) => !files.some((file) => file.file === name));

  const hashDrift = journalEntries
    .filter((entry) => files.some((file) => file.stem === entry.tag))
    .map((entry) => {
      const file = files.find((candidate) => candidate.stem === entry.tag);
      const live = dbState.drizzleRows.find((row) => Number(row.id) === Number(entry.idx) + 1);
      return {
        tag: entry.tag,
        file: file?.file ?? null,
        fileHash: file?.hash ?? null,
        dbHash: live?.hash ?? null,
        drift: Boolean(live && file && live.hash !== file.hash),
      };
    })
    .filter((row) => row.drift);

  const journalWhen = journalEntries.map((entry) => Number(entry.when ?? 0));
  let journalTimestampsMonotonic = true;
  for (let i = 1; i < journalWhen.length; i += 1) {
    if (journalWhen[i] < journalWhen[i - 1]) {
      journalTimestampsMonotonic = false;
      break;
    }
  }

  const report = {
    status: duplicatePrefixes.length === 0 && journalMissingFiles.length === 0 && hashDrift.length === 0 && journalTimestampsMonotonic
      ? 'PASS'
      : 'FAIL',
    counts: {
      fileCount: files.length,
      journalEntryCount: journalEntries.length,
      appliedDrizzleRows: dbState.drizzleRows.length,
      appliedLegacyRows: dbState.legacyRows.length,
      duplicatePrefixCount: duplicatePrefixes.length,
      journalMissingFileCount: journalMissingFiles.length,
      hashDriftCount: hashDrift.length,
      journalTimestampsMonotonic,
    },
    classifications,
    duplicatePrefixes,
    journalMissingFiles,
    hashDrift,
    liveSchema: null,
  };

  if (conn) {
    const pool = new Pool({ connectionString: conn, max: 1 });
    try {
      const columns = await pool.query(`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'semantic_signals'
          AND column_name = 'workspace_revision'
      `);
      report.liveSchema = {
        semanticSignalsWorkspaceRevisionPresent: columns.rowCount > 0,
        semanticSignalsWorkspaceRevisionNullable: columns.rows[0]?.is_nullable ?? null,
      };
    } finally {
      await pool.end();
    }
  }

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Migration identity report: ${report.status}`);
    console.log(`  files: ${report.counts.fileCount}`);
    console.log(`  journal entries: ${report.counts.journalEntryCount}`);
    console.log(`  applied drizzle rows: ${report.counts.appliedDrizzleRows}`);
    console.log(`  applied legacy rows: ${report.counts.appliedLegacyRows}`);
    console.log(`  duplicate prefixes: ${report.counts.duplicatePrefixCount}`);
    console.log(`  journal missing files: ${report.counts.journalMissingFileCount}`);
    console.log(`  hash drift: ${report.counts.hashDriftCount}`);
    console.log(`  journal timestamps monotonic: ${report.counts.journalTimestampsMonotonic}`);
    if (report.duplicatePrefixes.length > 0) {
      console.log('  duplicate prefixes:');
      for (const item of report.duplicatePrefixes) {
        console.log(`    ${item.prefix}: ${item.files.join(', ')} [owners: ${item.owners.join(', ')}]`);
      }
    }
  }

  process.exit(report.status === 'PASS' ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
