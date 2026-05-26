#!/usr/bin/env node
/**
 * Push the feature_cards/_design/feature_cards design document to CouchDB.
 *
 * Views are built for the feature-card mirror and downstream analysis:
 *   - by_kind         → kind + audit status counts
 *   - by_feature_key  → direct feature key lookup
 *   - by_term         → normalized label/import/module/dependency term lookup
 *   - by_audit_status → status counts for the mirror
 *
 * Usage:
 *   node scripts/couchdb-push-feature-card-views.mjs
 *   node scripts/couchdb-push-feature-card-views.mjs --dry-run
 *   node scripts/couchdb-push-feature-card-views.mjs --warm
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const REPORTS_DIR = join(ROOT, 'docs', 'reports');
const DESIGN_ID = '_design/feature_cards';
const DB = process.env.COUCHDB_FEATURES_DB ?? 'feature_cards';
const DRY_RUN = process.argv.includes('--dry-run');
const WARM = process.argv.includes('--warm');

const RAW_URL = process.env.COUCHDB_URL ?? 'http://admin:deeds123@127.0.0.1:5984';
const parsed = new URL(RAW_URL);
const AUTH = parsed.username
  ? { Authorization: `Basic ${Buffer.from(`${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`).toString('base64')}` }
  : {};
parsed.username = '';
parsed.password = '';
const BASE = parsed.toString().replace(/\/$/, '');

function writeJson(pathname, value) {
  mkdirSync(join(pathname, '..'), { recursive: true });
  writeFileSync(pathname, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(pathname, value) {
  mkdirSync(join(pathname, '..'), { recursive: true });
  writeFileSync(pathname, value, 'utf8');
}

async function couch(method, path, body) {
  const res = await fetch(`${BASE}/${DB}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...AUTH },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json };
}

function buildDesignDoc() {
  return {
    language: 'javascript',
    views: {
      by_kind: {
        map: `function (doc) {
  if (doc.type !== 'feature_card') return;
  emit([doc.kind || 'feature', doc.auditStatus || 'SPEC_ONLY'], {
    id: doc._id,
    title: doc.title || (doc.payload && doc.payload.name) || '',
    featureKeys: doc.featureKeys || [],
    qdrantTags: doc.qdrantTags || [],
    staticImports: doc.staticImports || [],
    dynamicImports: doc.dynamicImports || []
  });
}`,
        reduce: '_count',
      },
      by_feature_key: {
        map: `function (doc) {
  if (doc.type !== 'feature_card') return;
  (doc.featureKeys || []).forEach(function (featureKey) {
    emit(featureKey, {
      id: doc._id,
      title: doc.title || (doc.payload && doc.payload.name) || '',
      kind: doc.kind || 'feature',
      auditStatus: doc.auditStatus || 'SPEC_ONLY'
    });
  });
}`,
        reduce: '_count',
      },
      by_term: {
        map: `function (doc) {
  if (doc.type !== 'feature_card') return;
  function norm(value) {
    return String(value || '').trim().toLowerCase().replace(/[_\\s]+/g, '-').replace(/[^a-z0-9-/+.]+/g, '-').replace(/-{2,}/g, '-');
  }
  function emitTerms(values, termType) {
    (values || []).forEach(function (value) {
      var term = norm(value);
      if (term) {
        emit([termType, term], {
          id: doc._id,
          kind: doc.kind || 'feature',
          auditStatus: doc.auditStatus || 'SPEC_ONLY'
        });
      }
    });
  }
  emitTerms(doc.qdrantTags, 'label');
  emitTerms(doc.featureKeys, 'featureKey');
  emitTerms(doc.staticImports, 'staticImport');
  emitTerms(doc.dynamicImports, 'dynamicImport');
  emitTerms(doc.pathAliases, 'pathAlias');
  emitTerms(doc.schemaTables, 'schemaTable');
}`,
        reduce: '_count',
      },
      by_audit_status: {
        map: `function (doc) {
  if (doc.type !== 'feature_card') return;
  emit([doc.auditStatus || 'SPEC_ONLY', doc.kind || 'feature'], 1);
}`,
        reduce: '_sum',
      },
    },
  };
}

async function ensureDb() {
  const res = await fetch(`${BASE}/${DB}`, { method: 'HEAD', headers: AUTH });
  if (res.status === 404) {
    const create = await fetch(`${BASE}/${DB}`, { method: 'PUT', headers: AUTH });
    if (!create.ok && create.status !== 412) {
      throw new Error(`create db failed: ${create.status}`);
    }
  }
}

async function ensureFeatureCardCouchViews({ dryRun = false, warm = false } = {}) {
  await ensureDb();
  const designDoc = buildDesignDoc();
  const existingRes = await couch('GET', `/${encodeURIComponent(DESIGN_ID)}`);
  const existing = existingRes.ok ? existingRes.json : null;
  const viewNames = Object.keys(designDoc.views);
  let changed = false;

  if (existing) {
    const existingViews = Object.keys(existing.views ?? {});
    changed = viewNames.some((view) => JSON.stringify(existing.views?.[view]) !== JSON.stringify(designDoc.views[view]))
      || existingViews.length !== viewNames.length;
  } else {
    changed = true;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    db: DB,
    designId: DESIGN_ID,
    dryRun,
    warm,
    changed,
    views: viewNames,
    existingRev: existing?._rev ?? null,
    upserted: false,
    warmChecks: [],
  };

  if (!dryRun && changed) {
    const payload = existing?._rev ? { ...designDoc, _rev: existing._rev } : designDoc;
    const putRes = await couch('PUT', `/${encodeURIComponent(DESIGN_ID)}`, payload);
    if (!putRes.ok) {
      throw new Error(`design doc upsert failed: ${putRes.status}`);
    }
    report.upserted = true;
  }

  if (warm && !dryRun) {
    const warmChecks = [
      '/_design/feature_cards/_view/by_kind?limit=1',
      '/_design/feature_cards/_view/by_feature_key?limit=1',
      '/_design/feature_cards/_view/by_term?limit=1',
      '/_design/feature_cards/_view/by_audit_status?reduce=true&group=true&limit=1',
    ];
    for (const path of warmChecks) {
      const res = await fetch(`${BASE}/${DB}${path}`, { headers: AUTH });
      report.warmChecks.push({
        path,
        ok: res.ok,
        status: res.status,
      });
    }
  }

  const jsonPath = join(REPORTS_DIR, 'feature-card-couchdb-design.json');
  const mdPath = join(REPORTS_DIR, 'feature-card-couchdb-design.md');
  writeJson(jsonPath, report);
  writeText(mdPath, [
    '# Feature Card CouchDB Design',
    '',
    `Generated: ${report.generatedAt}`,
    `DB: ${report.db}`,
    `Design doc: ${report.designId}`,
    `Dry run: ${report.dryRun ? 'yes' : 'no'}`,
    `Changed: ${report.changed ? 'yes' : 'no'}`,
    `Upserted: ${report.upserted ? 'yes' : 'no'}`,
    '',
    '## Views',
    ...report.views.map((view) => `- ${view}`),
    '',
    '## Warm Checks',
    ...(report.warmChecks.length > 0
      ? report.warmChecks.map((row) => `- ${row.path} (${row.status})`)
      : ['- none']),
  ].join('\n'));

  return { ...report, jsonPath, mdPath };
}

async function main() {
  const report = await ensureFeatureCardCouchViews({ dryRun: DRY_RUN, warm: WARM });
  console.log(JSON.stringify({
    ok: true,
    report: {
      jsonPath: report.jsonPath,
      mdPath: report.mdPath,
    },
    changed: report.changed,
    upserted: report.upserted,
    warmChecks: report.warmChecks,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[couchdb:feature-cards:views] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { buildDesignDoc, ensureFeatureCardCouchViews, DESIGN_ID, DB };
