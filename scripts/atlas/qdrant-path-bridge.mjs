#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..', '..');
const TMP = resolve(ROOT, '.tmp');
const REPORTS = resolve(ROOT, 'docs', 'reports');

const PATH_MAP_PATH = join(TMP, 'path-map.json');
const PARENT_ATLAS_PATH = join(ROOT, 'memory', 'exports', 'parent-atlas', 'parent_atlas_index.json');
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768';
const OUTPUT_JSON = join(REPORTS, 'qdrant-path-bridge-latest.json');
const OUTPUT_MD = join(REPORTS, 'qdrant-path-bridge-latest.md');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const limitArg = [...process.argv.slice(2)].find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 250) : 250;

function normalizePathText(value) {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/{2,}/g, '/')
    .trim()
    .toLowerCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

function loadPathMap() {
  const raw = readJson(PATH_MAP_PATH, {});
  const byPath = new Map();
  const byStableKey = new Map();
  for (const [stableKey, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== 'object') continue;
    const filePath = normalizePathText(entry.filePath ?? entry.path ?? '');
    if (!filePath) continue;
    const value = {
      stableKey: String(stableKey),
      filePath,
      feature: entry.feature ?? 'unclassified',
      importErrorCount: Number(entry.importErrorCount ?? 0) || 0,
      staticImportCount: Number(entry.staticImportCount ?? 0) || 0,
      resolvedCount: Number(entry.resolvedCount ?? 0) || 0,
      directory: entry.directory ?? '',
      extension: entry.extension ?? '',
      lines: Number(entry.lines ?? 0) || 0,
    };
    byPath.set(filePath, value);
    byStableKey.set(String(stableKey), value);
  }
  return { byPath, byStableKey };
}

function loadParentAtlas() {
  const raw = readJson(PARENT_ATLAS_PATH, { entries: [] });
  const bySourceRef = new Map();
  const byId = new Map();
  for (const entry of Array.isArray(raw?.entries) ? raw.entries : []) {
    const sourceRef = normalizePathText(entry?.sourceRef ?? '');
    const id = String(entry?.id ?? '');
    const value = {
      id,
      sourceRef,
      kind: entry?.kind ?? 'unknown',
      som_bmu_row: entry?.som_bmu_row ?? '',
      som_bmu_col: entry?.som_bmu_col ?? '',
      som_bmu_distance: entry?.som_bmu_distance ?? '',
      reward_count: entry?.reward_count ?? 0,
      reward_avg: entry?.reward_avg ?? '',
      reward_total: entry?.reward_total ?? '',
      outcome_count: entry?.outcome_count ?? 0,
      outcome_reward_sum: entry?.outcome_reward_sum ?? 0,
      vector64: entry?.vector64 ?? 'no',
    };
    if (sourceRef && !bySourceRef.has(sourceRef)) bySourceRef.set(sourceRef, value);
    if (id && !byId.has(id)) byId.set(id, value);
  }
  return { bySourceRef, byId };
}

async function scrollQdrantPoints() {
  const points = [];
  let offset = null;
  while (points.length < limit) {
    const pageLimit = Math.min(100, limit - points.length);
    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: pageLimit,
        with_payload: true,
        with_vector: false,
        offset,
      }),
    });
    if (!res.ok) {
      throw new Error(`Qdrant scroll failed: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    const pagePoints = Array.isArray(data?.result?.points) ? data.result.points : [];
    if (pagePoints.length === 0) break;
    points.push(...pagePoints);
    offset = data?.result?.next_page_offset ?? null;
    if (!offset) break;
  }
  return points.slice(0, limit);
}

function getQdrantFilePath(point) {
  const payload = point?.payload ?? {};
  return normalizePathText(
    payload.file_path ??
      payload.relativePath ??
      payload.filePath ??
      payload.sourceRef ??
      payload.source_ref ??
      ''
  );
}

function getPayloadSourceRefs(point) {
  const payload = point?.payload ?? {};
  if (Array.isArray(payload.sourceRefs)) return unique(payload.sourceRefs.map(normalizePathText));
  if (Array.isArray(payload.source_refs)) return unique(payload.source_refs.map(normalizePathText));
  return [];
}

function buildBridgeRows(points, pathMap, parentAtlas) {
  const rows = [];
  const qdrantPrefixCounts = new Map();
  const matchedParentAtlasIds = new Set();

  for (const point of points) {
    const qdrantFilePath = getQdrantFilePath(point);
    if (!qdrantFilePath) continue;

    const mapreduce = pathMap.byPath.get(qdrantFilePath) ?? null;
    const parentAtlasEntry =
      parentAtlas.bySourceRef.get(qdrantFilePath) ??
      parentAtlas.bySourceRef.get(`sveltekit-frontend/${qdrantFilePath}`) ??
      parentAtlas.bySourceRef.get(`src/${qdrantFilePath}`) ??
      null;

    const sourceRefs = unique([
      qdrantFilePath,
      ...getPayloadSourceRefs(point),
      parentAtlasEntry?.sourceRef,
    ]);

    const bridgeStatus = parentAtlasEntry && mapreduce
      ? 'full-match'
      : parentAtlasEntry
        ? 'atlas-only'
        : mapreduce
          ? 'mapreduce-only'
          : 'unmatched';

    if (parentAtlasEntry?.id) matchedParentAtlasIds.add(parentAtlasEntry.id);

    const prefix = qdrantFilePath.split('/').slice(0, 3).join('/') || qdrantFilePath;
    qdrantPrefixCounts.set(prefix, (qdrantPrefixCounts.get(prefix) ?? 0) + 1);

    rows.push({
      qdrant_point_id: String(point?.id ?? ''),
      qdrant_file_path: qdrantFilePath,
      qdrant_source_refs: sourceRefs,
      qdrant_feature_tags: unique(point?.payload?.tags ?? []),
      mapreduce_stable_key: mapreduce?.stableKey ?? '',
      mapreduce_feature: mapreduce?.feature ?? '',
      mapreduce_import_error_count: mapreduce?.importErrorCount ?? 0,
      mapreduce_static_import_count: mapreduce?.staticImportCount ?? 0,
      parent_atlas_card_id: parentAtlasEntry?.id ?? '',
      parent_atlas_source_ref: parentAtlasEntry?.sourceRef ?? '',
      parent_atlas_kind: parentAtlasEntry?.kind ?? '',
      parent_atlas_reward_count: parentAtlasEntry?.reward_count ?? 0,
      bridge_status: bridgeStatus,
    });
  }

  return {
    rows,
    qdrantPrefixCounts: [...qdrantPrefixCounts.entries()]
      .map(([prefix, count]) => ({ prefix, count }))
      .sort((a, b) => b.count - a.count || a.prefix.localeCompare(b.prefix)),
    matchedParentAtlasIds: [...matchedParentAtlasIds],
  };
}

function mdTable(rows, columns) {
  const header = `| ${columns.map((col) => col.label).join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${columns.map((col) => col.value(row)).join(' | ')} |`);
  return [header, divider, ...body].join('\n');
}

function main() {
  if (!existsSync(PATH_MAP_PATH)) {
    throw new Error(`Missing path map: ${PATH_MAP_PATH}`);
  }
  if (!existsSync(PARENT_ATLAS_PATH)) {
    throw new Error(`Missing parent atlas: ${PARENT_ATLAS_PATH}`);
  }

  const pathMap = loadPathMap();
  const parentAtlas = loadParentAtlas();

  return scrollQdrantPoints()
    .then((points) => {
      const bridge = buildBridgeRows(points, pathMap, parentAtlas);
      const summary = {
        qdrantPointCount: points.length,
        bridgeRowCount: bridge.rows.length,
        fullMatchCount: bridge.rows.filter((row) => row.bridge_status === 'full-match').length,
        atlasOnlyCount: bridge.rows.filter((row) => row.bridge_status === 'atlas-only').length,
        mapreduceOnlyCount: bridge.rows.filter((row) => row.bridge_status === 'mapreduce-only').length,
        unmatchedCount: bridge.rows.filter((row) => row.bridge_status === 'unmatched').length,
        uniqueQdrantPrefixes: bridge.qdrantPrefixCounts.length,
        matchedParentAtlasIds: bridge.matchedParentAtlasIds.length,
      };

      const report = {
        generatedAt: new Date().toISOString(),
        dryRun,
        limit,
        qdrantUrl: QDRANT_URL,
        collection: QDRANT_COLLECTION,
        inputs: {
          pathMap: PATH_MAP_PATH,
          parentAtlas: PARENT_ATLAS_PATH,
        },
        summary,
        qdrantPrefixCounts: bridge.qdrantPrefixCounts.slice(0, 50),
        bridgeRows: bridge.rows.slice(0, 250),
      };

      if (!dryRun) {
        mkdirSync(REPORTS, { recursive: true });
        writeFileSync(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
        writeFileSync(
          OUTPUT_MD,
          [
            '# Qdrant Path Bridge',
            '',
            `Generated: ${report.generatedAt}`,
            `Collection: ${QDRANT_COLLECTION}`,
            `Limit: ${limit}`,
            '',
            '## Summary',
            '',
            `- Qdrant points: **${summary.qdrantPointCount}**`,
            `- Bridge rows: **${summary.bridgeRowCount}**`,
            `- Full matches: **${summary.fullMatchCount}**`,
            `- Atlas-only matches: **${summary.atlasOnlyCount}**`,
            `- Mapreduce-only matches: **${summary.mapreduceOnlyCount}**`,
            `- Unmatched: **${summary.unmatchedCount}**`,
            '',
            '## Top Qdrant Prefixes',
            '',
            mdTable(report.qdrantPrefixCounts.slice(0, 20), [
              { label: 'Prefix', value: (row) => row.prefix },
              { label: 'Count', value: (row) => String(row.count) },
            ]),
            '',
            '## Sample Bridge Rows',
            '',
            mdTable(report.bridgeRows.slice(0, 25), [
              { label: 'Qdrant File', value: (row) => `\`${row.qdrant_file_path}\`` },
              { label: 'StableKey', value: (row) => row.mapreduce_stable_key || '' },
              { label: 'Atlas Card', value: (row) => row.parent_atlas_card_id || '' },
              { label: 'Status', value: (row) => row.bridge_status },
            ]),
            '',
          ].join('\n'),
          'utf8'
        );
      }

      console.log(JSON.stringify({ ok: true, summary, outputs: { json: OUTPUT_JSON, md: OUTPUT_MD } }, null, 2));
    })
    .catch((error) => {
      console.error('[atlas:qdrant:path-bridge] Failed:', error);
      process.exitCode = 1;
    });
}

main();
