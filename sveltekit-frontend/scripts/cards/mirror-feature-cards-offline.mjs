#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sortObject, stableHash } from '../index/shared.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..', '..');
const INPUT_PATH = join(ROOT, 'memory', 'exports', 'feature-map-cards.jsonl');
const REPORTS_DIR = join(ROOT, 'docs', 'reports');
const COUCHDB_DB = process.env.COUCHDB_FEATURES_DB ?? 'feature_cards';
const DUCKDB_CANDIDATES = [
  process.env.DUCKDB_BIN,
  'C:\\Users\\james\\AppData\\Local\\Programs\\DuckDB\\duckdb.exe',
  'duckdb',
].filter(Boolean);
const DUCKDB_DB_PATH = join(REPORTS_DIR, 'feature-card.duckdb');
const APPLY_COUCHDB = process.argv.includes('--couchdb') || process.argv.includes('--apply-storage');
const APPLY_DUCKDB = process.argv.includes('--duckdb') || process.argv.includes('--apply-storage');

function readJsonl(pathname) {
  if (!existsSync(pathname)) return [];
  const raw = readFileSync(pathname, 'utf8').trim();
  if (!raw) return [];
  return raw.split(/\r?\n/).map((line) => JSON.parse(line));
}

function writeJson(pathname, value) {
  mkdirSync(join(pathname, '..'), { recursive: true });
  writeFileSync(pathname, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(pathname, value) {
  mkdirSync(join(pathname, '..'), { recursive: true });
  writeFileSync(pathname, value, 'utf8');
}

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-/+.]+/g, '-')
    .replace(/-{2,}/g, '-');
}

function toOfflineDoc(card) {
  const payload = card?.payload ?? {};
  return {
    _id: card.id,
    type: 'feature_card',
    kind: card.kind,
    labels: card.labels ?? [],
    summary: card.summary ?? '',
    sourceRefs: card.sourceRefs ?? [],
    scores: card.scores ?? {},
    payload: {
      id: payload.id,
      name: payload.name ?? '',
      intent: payload.intent ?? '',
      service: payload.service ?? '',
      stores: payload.stores ?? [],
      modules: payload.modules ?? [],
      imports: payload.imports ?? [],
      dependencies: payload.dependencies ?? [],
      languages: payload.languages ?? [],
      networking: payload.networking ?? [],
      offlineProcessing: payload.offlineProcessing ?? [],
      cache: payload.cache ?? [],
      inferenceFallbacks: payload.inferenceFallbacks ?? [],
      clusters: payload.clusters ?? [],
      status: payload.status ?? '',
      params: payload.params ?? {},
      pathMapping: payload.pathMapping ?? [],
      failOpen: Boolean(payload.failOpen),
    },
    contentHash: stableHash(JSON.stringify(sortObject(card))),
    updatedAt: new Date().toISOString(),
    source: 'memory/exports/feature-map-cards.jsonl',
  };
}

function toDuckdbRow(card) {
  const payload = card?.payload ?? {};
  return {
    id: card.id,
    kind: card.kind,
    labels: card.labels ?? [],
    summary: card.summary ?? '',
    sourceRefs: card.sourceRefs ?? [],
    score_rank: Number(card?.scores?.rank ?? 0),
    score_authority: Number(card?.scores?.authority ?? 0),
    score_recency: Number(card?.scores?.recency ?? 0),
    payload: {
      id: payload.id,
      name: payload.name ?? '',
      intent: payload.intent ?? '',
      service: payload.service ?? '',
      stores: payload.stores ?? [],
      modules: payload.modules ?? [],
      imports: payload.imports ?? [],
      dependencies: payload.dependencies ?? [],
      languages: payload.languages ?? [],
      networking: payload.networking ?? [],
      offlineProcessing: payload.offlineProcessing ?? [],
      cache: payload.cache ?? [],
      inferenceFallbacks: payload.inferenceFallbacks ?? [],
      clusters: payload.clusters ?? [],
      status: payload.status ?? '',
      params: payload.params ?? {},
      pathMapping: payload.pathMapping ?? [],
      failOpen: Boolean(payload.failOpen),
    },
  };
}

async function writeCouchdbDocs(cards) {
  if (!APPLY_COUCHDB) {
    return { enabled: false, wrote: 0, skipped: cards.length, failed: 0, db: COUCHDB_DB, designDoc: { enabled: false, changed: false, upserted: false } };
  }

  try {
    const { ensureFeatureCardCouchViews } = await import('../couchdb-push-feature-card-views.mjs');
    const { writeCardsToCouchDB } = await import('../../src/lib/server/agents/regen/writers/couchdb-writer.ts');
    const designDoc = await ensureFeatureCardCouchViews({ dryRun: false, warm: true });
    const docs = cards.map(toOfflineDoc);
    const result = await writeCardsToCouchDB(docs.map((doc) => ({
      id: doc._id,
      dirPath: `feature-card/${doc.kind}`,
      title: doc.payload.name || doc.id,
      summary: doc.summary,
      staticImports: doc.payload.imports,
      dynamicImports: [],
      pathAliases: doc.payload.pathMapping,
      featureKeys: [doc.payload.id],
      routeSurfaces: [],
      schemaTables: [],
      qdrantTags: doc.labels,
      neo4jNodeId: undefined,
      couchDocId: doc._id,
      auditStatus: 'SPEC_ONLY',
      recommendations: doc.payload.dependencies,
      activityScore: Number(doc?.scores?.rank ?? 0),
      lastAccessedAt: undefined,
      lastIndexedAt: doc.updatedAt,
      contentHash: doc.contentHash,
      gates: {},
    })), {
      enabled: true,
      database: COUCHDB_DB,
      source: 'feature-card-offline-mirror',
    });

    return {
      enabled: true,
      db: COUCHDB_DB,
      wrote: result.wrote,
      skipped: result.skipped,
      failed: result.failed,
      conflicted: result.conflicted,
      designDoc: {
        enabled: true,
        changed: designDoc.changed,
        upserted: designDoc.upserted,
        views: designDoc.views,
        warmChecks: designDoc.warmChecks,
      },
    };
  } catch (error) {
    return {
      enabled: true,
      db: COUCHDB_DB,
      wrote: 0,
      skipped: cards.length,
      failed: cards.length,
      designDoc: { enabled: true, changed: false, upserted: false },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function writeDuckdbArtifact(cards) {
  const reportPath = join(REPORTS_DIR, 'feature-card-duckdb-ready.json');
  const rows = cards.map(toDuckdbRow);
  const duckdbBin = resolveDuckdbBin();
  const report = {
    generatedAt: new Date().toISOString(),
    source: INPUT_PATH,
    rows: rows.length,
    richRows: rows.filter((row) => Object.values(row.payload).some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value))).length,
    preview: rows.slice(0, 25),
    note: 'DuckDB-friendly JSON export plus a persisted DuckDB database for downstream batch analysis.',
  };
  writeJson(reportPath, report);

  const ndjsonPath = join(REPORTS_DIR, 'feature-card-duckdb-ready.ndjson');
  writeText(ndjsonPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}${rows.length ? '\n' : ''}`);
  const duckdbReadyPath = pathToSqlPath(ndjsonPath);
  const termsSql = [
    `CREATE OR REPLACE TABLE feature_card_terms AS`,
    `SELECT id AS card_id, 'label' AS term_type, unnest(labels) AS term_value FROM feature_cards`,
    `UNION ALL`,
    `SELECT id AS card_id, 'module' AS term_type, unnest(payload.modules) AS term_value FROM feature_cards`,
    `UNION ALL`,
    `SELECT id AS card_id, 'import' AS term_type, unnest(payload.imports) AS term_value FROM feature_cards`,
    `UNION ALL`,
    `SELECT id AS card_id, 'dependency' AS term_type, unnest(payload.dependencies) AS term_value FROM feature_cards`,
    `UNION ALL`,
    `SELECT id AS card_id, 'language' AS term_type, unnest(payload.languages) AS term_value FROM feature_cards`,
    `UNION ALL`,
    `SELECT id AS card_id, 'networking' AS term_type, unnest(payload.networking) AS term_value FROM feature_cards`,
    `UNION ALL`,
    `SELECT id AS card_id, 'offline' AS term_type, unnest(payload.offlineProcessing) AS term_value FROM feature_cards`,
    `UNION ALL`,
    `SELECT id AS card_id, 'cache' AS term_type, unnest(payload.cache) AS term_value FROM feature_cards`,
    `UNION ALL`,
    `SELECT id AS card_id, 'fallback' AS term_type, unnest(payload.inferenceFallbacks) AS term_value FROM feature_cards;`,
  ].join(' ');
  const sql = [
    "INSTALL json;",
    "LOAD json;",
    `CREATE OR REPLACE TABLE feature_cards AS SELECT * FROM read_ndjson_auto('${duckdbReadyPath}');`,
    termsSql,
    'CHECKPOINT;',
  ].join(' ');
  const duckdbResult = spawnSync(duckdbBin, [DUCKDB_DB_PATH, '-c', sql], { encoding: 'utf8' });
  const duckdb = {
    bin: duckdbBin,
    binCandidates: DUCKDB_CANDIDATES,
    dbPath: DUCKDB_DB_PATH,
    ok: duckdbResult.status === 0,
    status: duckdbResult.status,
    stdout: (duckdbResult.stdout ?? '').trim().slice(0, 1200),
    stderr: (duckdbResult.stderr ?? '').trim().slice(0, 1200),
    rows: rows.length,
  };
  if (duckdbResult.error || duckdbResult.status !== 0) {
    duckdb.ok = false;
    duckdb.error = duckdbResult.error ? duckdbResult.error.message : 'duckdb exited non-zero';
  }
  return { reportPath, ndjsonPath, rows: rows.length, duckdb };
}

function pathToSqlPath(pathname) {
  return String(pathname).replace(/\\/g, '/').replace(/'/g, "''");
}

function resolveDuckdbBin() {
  for (const candidate of DUCKDB_CANDIDATES) {
    if (candidate === 'duckdb') return candidate;
    if (existsSync(candidate)) return candidate;
  }
  return 'duckdb';
}

async function main() {
  const cards = readJsonl(INPUT_PATH);
  const offlineCards = cards.filter((card) => card && typeof card === 'object' && card.kind === 'feature');

  const couchdb = await writeCouchdbDocs(offlineCards);
  const duckdb = writeDuckdbArtifact(offlineCards);

  const report = {
    generatedAt: new Date().toISOString(),
    input: INPUT_PATH,
    cards: offlineCards.length,
    couchdb,
    duckdb: { ...duckdb.duckdb, prepared: true, liveWriteRequested: APPLY_DUCKDB },
    note: 'Offline mirror is opt-in and non-authoritative; Postgres remains the source of truth.',
  };

  mkdirSync(REPORTS_DIR, { recursive: true });
  writeJson(join(REPORTS_DIR, 'feature-card-offline-mirror-report.json'), report);
  writeText(join(REPORTS_DIR, 'feature-card-offline-mirror-report.md'), [
    '# Feature Card Offline Mirror Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Cards: ${report.cards}`,
    '',
    `CouchDB: ${report.couchdb.enabled ? 'enabled' : 'disabled'} | wrote: ${report.couchdb.wrote ?? 0} | skipped: ${report.couchdb.skipped ?? 0} | failed: ${report.couchdb.failed ?? 0}`,
    `DuckDB: ${report.duckdb.skipped ? 'prepared only' : 'ready'} | rows: ${report.duckdb.rows ?? 0}`,
    '',
    'This mirror is intentionally downstream-only. It does not replace the Postgres registry or the Redis hot path.',
  ].join('\n'));

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`[feature-card-offline-mirror] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
