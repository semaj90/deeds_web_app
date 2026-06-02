#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { readJson, readText, resolveRepoPath, writeJson, writeMarkdown, parentAtlasMarkdown, topEntries } from './_atlas-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolveRepoPath('.');
dotenv.config({ path: path.join(REPO_ROOT, '.env') });
dotenv.config({ path: path.join(REPO_ROOT, '.env.local') });

const REPORT_JSON = resolveRepoPath('docs/reports/parent-atlas-feature-command-atlas-projection.json');
const REPORT_MD = resolveRepoPath('docs/reports/parent-atlas-feature-command-atlas-projection.md');
const CYPHER_PATH = resolveRepoPath('docs/graph/parent-atlas-feature-command-atlas.cypher');
const MANIFEST_PATH = resolveRepoPath('docs/reports/parent-atlas-feature-command-atlas.json');
const TODO_PATH = resolveRepoPath('MASTER-FEATURE-TODO-2026-05-20.md');
const POSTGRES_TABLE = 'parent_atlas_jobs';

const argv = new Set(process.argv.slice(2));
const WRITE_POSTGRES = argv.has('--write-postgres') || argv.has('--write');
const WRITE_CYPHER = argv.has('--write-cypher') || argv.has('--write');

function sha1(input) {
  return crypto.createHash('sha1').update(String(input ?? '')).digest('hex').slice(0, 16);
}

function laneSemanticHash(lane) {
  const payload = [
    lane.laneId,
    lane.title,
    lane.description,
    lane.matchCount,
    ...(lane.topMatches ?? []).map((entry) => `${entry.featureKey ?? entry.title ?? ''}|${(entry.sourceRefs ?? []).join(',')}`),
    ...(lane.todoAnchors ?? []),
  ].join('\n');
  return sha1(payload);
}

function readManifest() {
  const manifest = readJson(MANIFEST_PATH, null);
  if (!manifest?.lanes?.length) {
    throw new Error(`Missing manifest: ${MANIFEST_PATH}. Run npm run atlas:feature-command-atlas first.`);
  }
  return manifest;
}

function buildCypher(manifest) {
  const lines = [
    '// Parent Atlas feature command atlas projection',
    `// generatedAt: ${manifest.generatedAt}`,
    '',
  ];

  for (const lane of manifest.lanes) {
    const laneId = `parent_atlas:${lane.laneId}`;
    const semanticHash = laneSemanticHash(lane);
    const primarySourceRef = lane.topMatches?.[0]?.sourceRefs?.[0] ?? null;
    lines.push(
      `MERGE (c:ParentAtlasContainer {containerId: ${JSON.stringify(laneId)}})`,
      `SET c.title = ${JSON.stringify(lane.title)},`,
      `    c.description = ${JSON.stringify(lane.description)},`,
      `    c.matchCount = ${Number(lane.matchCount ?? 0)},`,
      `    c.sourceRefAnchors = ${Number(lane.topMatches?.reduce((sum, entry) => sum + (entry.sourceRefs?.length ?? 0), 0) ?? 0)},`,
      `    c.semanticHash = ${JSON.stringify(semanticHash)},`,
      `    c.primarySourceRef = ${JSON.stringify(primarySourceRef)},`,
      `    c.updatedAt = datetime();`,
      ''
    );

    const laneMatches = lane.topMatches ?? [];
    laneMatches.slice(0, 25).forEach((entry, index) => {
      const featureKey = entry.featureKey ?? entry.title ?? `lane:${lane.laneId}:match:${index}`;
      const featureNodeId = `parent_atlas_feature:${featureKey}`;
      lines.push(
        `MERGE (f:ParentAtlasFeature {featureKey: ${JSON.stringify(featureKey)}})`,
        `SET f.title = ${JSON.stringify(entry.title ?? featureKey)},`,
        `    f.status = ${JSON.stringify(entry.status ?? 'unknown')},`,
        `    f.nextQuery = ${JSON.stringify(entry.nextQuery ?? null)},`,
        `    f.semanticHash = ${JSON.stringify(sha1(`${laneId}|${featureKey}`))};`,
        `MATCH (c:ParentAtlasContainer {containerId: ${JSON.stringify(laneId)}}), (f:ParentAtlasFeature {featureKey: ${JSON.stringify(featureKey)}})`,
        `MERGE (c)-[:CONTAINS_FEATURE {rank: ${index + 1}, score: ${Number(entry.laneScore ?? 0)}}]->(f);`,
        ''
      );

      for (const sourceRef of entry.sourceRefs ?? []) {
        const sourceNodeId = `source_ref:${sha1(sourceRef)}`;
        lines.push(
          `MERGE (s:SourceRef {sourceRefId: ${JSON.stringify(sourceNodeId)}})`,
          `SET s.sourceRef = ${JSON.stringify(sourceRef)},`,
          `    s.kind = 'sourceRef',`,
          `    s.updatedAt = datetime();`,
          `MATCH (f:ParentAtlasFeature {featureKey: ${JSON.stringify(featureKey)}}), (s:SourceRef {sourceRefId: ${JSON.stringify(sourceNodeId)}})`,
          `MERGE (f)-[:SUPPORTED_BY_SOURCE_REF]->(s);`,
          ''
        );
      }
    });
  }

  return `${lines.join('\n')}\n`;
}

async function writePostgres(manifest) {
  const databaseUrl = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    return { attempted: false, applied: false, reason: 'DATABASE_URL missing' };
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 2,
    idleTimeoutMillis: 15_000,
    connectionTimeoutMillis: 5_000,
  });

  const rows = [];
  for (const lane of manifest.lanes) {
    const laneId = `parent_atlas:${lane.laneId}`;
    const payload = {
      laneId,
      title: lane.title,
      description: lane.description,
      matchCount: lane.matchCount ?? 0,
      sourceRefAnchors: lane.topMatches?.reduce((sum, entry) => sum + (entry.sourceRefs?.length ?? 0), 0) ?? 0,
      sourceRefs: [...new Set((lane.topMatches ?? []).flatMap((entry) => entry.sourceRefs ?? []))],
      featureKeys: (lane.topMatches ?? []).map((entry) => entry.featureKey ?? entry.title ?? null).filter(Boolean),
      todoAnchors: lane.todoAnchors ?? [],
      semanticHash: laneSemanticHash(lane),
      manifestGeneratedAt: manifest.generatedAt,
    };

    rows.push({
      record_id: laneId,
      status: 'ready',
      payload,
    });
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.${POSTGRES_TABLE} (
        id serial PRIMARY KEY,
        record_id text,
        status varchar(32) NOT NULL DEFAULT 'pending',
        payload jsonb,
        created_at timestamptz DEFAULT now()
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${POSTGRES_TABLE}_status ON public.${POSTGRES_TABLE}(status);`);
    await pool.query(`DELETE FROM public.${POSTGRES_TABLE} WHERE record_id = ANY($1::text[])`, [rows.map((row) => row.record_id)]);
    for (const row of rows) {
      await pool.query(
        `INSERT INTO public.${POSTGRES_TABLE} (record_id, status, payload) VALUES ($1, $2, $3::jsonb)`,
        [row.record_id, row.status, JSON.stringify(row.payload)]
      );
    }
    const countResult = await pool.query(`SELECT count(*)::int AS count FROM public.${POSTGRES_TABLE} WHERE record_id = ANY($1::text[])`, [rows.map((row) => row.record_id)]);
    return {
      attempted: true,
      applied: true,
      rows: rows.length,
      verifiedRows: countResult.rows?.[0]?.count ?? 0,
      table: POSTGRES_TABLE,
    };
  } catch (error) {
    return { attempted: true, applied: false, error: error?.message ?? String(error), table: POSTGRES_TABLE };
  } finally {
    await pool.end().catch(() => {});
  }
}

function renderMarkdown(report) {
  return parentAtlasMarkdown('Parent Atlas Feature Command Atlas Projection', {
    lanes: report.summary.lanesProjected,
    postgresRows: report.summary.postgresRowsWritten,
    cypherLines: report.summary.cypherLines,
    sourceRefAnchors: report.summary.sourceRefAnchors,
  }, report.lanes.map((lane) => `${lane.title}: postgres=${lane.postgresStatus}, semanticHash=${lane.semanticHash}, features=${lane.featureCount}`));
}

async function main() {
  const manifest = readManifest();
  const todoText = readText(TODO_PATH, '');
  const cypher = buildCypher(manifest);

  if (WRITE_CYPHER) {
    fs.mkdirSync(path.dirname(CYPHER_PATH), { recursive: true });
    fs.writeFileSync(CYPHER_PATH, cypher, 'utf8');
  }

  const postgres = WRITE_POSTGRES ? await writePostgres(manifest) : { attempted: false, applied: false, table: POSTGRES_TABLE };

  const lanes = manifest.lanes.map((lane) => ({
    laneId: lane.laneId,
    title: lane.title,
    featureCount: lane.topMatches?.length ?? 0,
    matchCount: lane.matchCount ?? 0,
    semanticHash: laneSemanticHash(lane),
    sourceRefAnchors: lane.topMatches?.reduce((sum, entry) => sum + (entry.sourceRefs?.length ?? 0), 0) ?? 0,
    topFeatureKeys: (lane.topMatches ?? []).slice(0, 8).map((entry) => entry.featureKey ?? entry.title ?? null).filter(Boolean),
    todoAnchors: (lane.todoAnchors ?? []).slice(0, 8),
    postgresStatus: postgres.applied ? 'written' : postgres.attempted ? 'blocked' : 'skipped',
  }));

  const report = {
    generatedAt: new Date().toISOString(),
    inputs: {
      manifestPath: MANIFEST_PATH,
      todoPath: TODO_PATH,
    },
    outputs: {
      cypherPath: WRITE_CYPHER ? CYPHER_PATH : null,
      postgresTable: POSTGRES_TABLE,
    },
    summary: {
      lanesProjected: lanes.length,
      postgresRowsWritten: postgres.applied ? (postgres.verifiedRows ?? lanes.length) : 0,
      cypherLines: cypher.split('\n').filter(Boolean).length,
      sourceRefAnchors: manifest.summary?.sourceRefAnchors ?? 0,
      todoAnchorsMatched: (todoText.match(/sourceRef|feature_id|Neo4j|Qdrant|Postgres 18|SOM|XGBoost|PyTorch/gi) ?? []).length,
    },
    postgres,
    lanes,
    topLanes: topEntries(new Map(lanes.map((lane) => [lane.laneId, lane.matchCount])), 6),
  };

  writeJson(REPORT_JSON, report);
  writeMarkdown(REPORT_MD, renderMarkdown(report));

  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);
  if (WRITE_CYPHER) console.log(`Wrote ${CYPHER_PATH}`);
  console.log(`Projected lanes: ${report.summary.lanesProjected}`);
  console.log(`Postgres rows: ${report.summary.postgresRowsWritten}`);
}

main().catch((error) => {
  console.error('Parent Atlas feature command projection failed:', error?.message ?? error);
  process.exit(1);
});
