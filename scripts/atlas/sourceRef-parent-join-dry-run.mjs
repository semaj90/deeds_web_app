#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const TMP = path.join(ROOT, '.tmp');
const REPORTS = path.join(ROOT, 'docs', 'reports');

const PATH_MAP_PATH = path.join(TMP, 'path-map.json');
const SOURCE_REF_MAP_PATH = path.join(ROOT, 'memory', 'exports', 'sourceRef-cardId-map.json');
const PARENT_ATLAS_PATH = path.join(ROOT, 'memory', 'exports', 'parent-atlas', 'parent_atlas_index.json');
const INVENTORY_PATH = path.join(REPORTS, 'sourceRef-atlas-join-inventory.json');
const CROSSWALK_PATH = path.join(REPORTS, 'doc-feature-crosswalk-2026-06-01.json');
const OUTPUT_JSON_PATH = path.join(REPORTS, 'sourceRef-parent-join-dry-run.json');
const OUTPUT_MD_PATH = path.join(REPORTS, 'sourceRef-parent-join-dry-run.md');
const OUTPUT_PACKET_PATH = path.join(TMP, 'sourceRef-parent-join-packets.jsonl');

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');
const LIMIT = Number.parseInt(args.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? '120', 10);

const DOC_SCAN_GROUPS = [
  {
    id: 'sourceRef_pathmap',
    label: 'SourceRef / pathmap spine',
    pattern: 'sourceRef|path-map|stableKey|feature_id|title_id|mapreduce-path-join',
    roots: ['docs', 'memory', 'scripts', 'sveltekit-frontend/docs/obsidian-vault/Files'],
  },
  {
    id: 'parent_atlas',
    label: 'Parent atlas / packet flow',
    pattern: 'parent atlas|parent_atlas|NES chrom|NES/Glyph|packet|feature-command-atlas',
    roots: ['docs', 'memory', 'scripts', 'sveltekit-frontend/docs/obsidian-vault/Files'],
  },
  {
    id: 'neo4j',
    label: 'Neo4j contextual trees / multi-hop traversal',
    pattern: 'Neo4j|multi-hop|context tree|graph',
    roots: ['docs', 'memory', 'scripts', 'sveltekit-frontend/docs/obsidian-vault/Files'],
  },
  {
    id: 'qdrant',
    label: 'Qdrant semantic analysis / clustering',
    pattern: 'Qdrant|semantic|clustering|HNSW|vector',
    roots: ['docs', 'memory', 'scripts', 'sveltekit-frontend/docs/obsidian-vault/Files'],
  },
  {
    id: 'redis',
    label: 'Redis / Bitfrost cache lane',
    pattern: 'Redis|Bitfrost|cache',
    roots: ['docs', 'memory', 'scripts', 'sveltekit-frontend/docs/obsidian-vault/Files'],
  },
  {
    id: 'offline',
    label: 'Offline processing / mapreduce / DuckDB',
    pattern: 'DuckDB|mapreduce|offline|SeaweedFS',
    roots: ['docs', 'memory', 'scripts', 'sveltekit-frontend/docs/obsidian-vault/Files'],
  },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function normalizeSourceRef(value) {
  return String(value ?? '').replace(/\\/g, '/').trim().toLowerCase();
}

function sourceRefPrefix(value) {
  const normalized = normalizeSourceRef(value);
  const hashIndex = normalized.indexOf('#');
  return hashIndex === -1 ? normalized : normalized.slice(0, hashIndex);
}

function nonEmpty(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function shortHash(input, length = 16) {
  return crypto.createHash('sha256').update(String(input)).digest('hex').slice(0, length);
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}

function sum(items, key) {
  return items.reduce((total, item) => total + Number(item?.[key] ?? 0), 0);
}

function topEntries(map, limit = 10) {
  return [...map.entries()]
    .map(([value, items]) => ({ value, count: items.length }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit);
}

function runRgScan(group) {
  const args = [
    '-uu',
    '-l',
    '--glob',
    '!**/node_modules/**',
    '--glob',
    '!**/.svelte-kit/**',
    '--glob',
    '!**/.vite/**',
    '--glob',
    '!**/dist/**',
    '--glob',
    '!**/build/**',
    group.pattern,
    ...group.roots,
  ];

  const result = spawnSync('rg', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) {
    return {
      ok: false,
      error: result.error.message,
      files: [],
      status: result.status,
    };
  }

  const files = String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    ok: result.status === 0 || result.status === 1,
    error: result.stderr ? String(result.stderr).trim() : '',
    files,
    status: result.status,
  };
}

function clusterPathRows(pathRows, limit) {
  const buckets = new Map();
  for (const row of pathRows) {
    const feature = nonEmpty(row.feature) || 'unclassified';
    const directory = nonEmpty(row.directory) || path.posix.dirname(nonEmpty(row.filePath) || '.');
    const key = `${feature}@@${directory}`;
    const existing = buckets.get(key);
    const normalizedFilePath = nonEmpty(row.filePath).replace(/\\/g, '/');
    if (existing) {
      existing.rows.push({ ...row, filePath: normalizedFilePath });
    } else {
      buckets.set(key, {
        key,
        feature,
        directory,
        rows: [{ ...row, filePath: normalizedFilePath }],
      });
    }
  }

  return [...buckets.values()]
    .map((bucket) => {
      const rows = bucket.rows.sort((a, b) => (b.importErrorCount ?? 0) - (a.importErrorCount ?? 0) || (b.resolvedCount ?? 0) - (a.resolvedCount ?? 0));
      const filePaths = [...new Set(rows.map((row) => row.filePath))];
      const packetId = `srpkt_${shortHash(bucket.key)}`;
      return {
        schemaVersion: 'sourceRef.parent.join.packet.v1',
        packetId,
        title_id: shortHash(bucket.key, 16),
        title: `${bucket.feature} @ ${bucket.directory}`,
        feature_id: bucket.feature,
        sourceRef: bucket.directory,
        sourceRefs: filePaths.slice(0, 8),
        coldOriginals: filePaths.slice(0, 8),
        summary: `files=${rows.length}; importErrors=${sum(rows, 'importErrorCount')}; resolved=${sum(rows, 'resolvedCount')}`,
        metrics: {
          fileCount: rows.length,
          importErrorCount: sum(rows, 'importErrorCount'),
          resolvedCount: sum(rows, 'resolvedCount'),
          totalLines: sum(rows, 'lines'),
          staticImportCount: sum(rows, 'staticImportCount'),
        },
        joinSpine: {
          file_path: bucket.directory,
          stableKeys: rows.slice(0, 8).map((row) => row.stableKey).filter(Boolean),
          sourceRef: bucket.directory,
          feature_id: bucket.feature,
        },
      };
    })
    .sort((a, b) => b.metrics.fileCount - a.metrics.fileCount || a.title.localeCompare(b.title))
    .slice(0, limit);
}

function clusterSourceRefs(atlasEntries, sourceRefMapEntries, limit) {
  const rows = [];
  for (const entry of atlasEntries) {
    if (!nonEmpty(entry?.sourceRef)) continue;
    rows.push({
      kind: 'parent_atlas',
      sourceRef: nonEmpty(entry.sourceRef),
      normalized: normalizeSourceRef(entry.sourceRef),
      prefix: sourceRefPrefix(entry.sourceRef),
      cardId: nonEmpty(entry.id),
      title: nonEmpty(entry.title) || '(no title)',
    });
  }
  for (const entry of sourceRefMapEntries) {
    if (!nonEmpty(entry?.sourceRef)) continue;
    rows.push({
      kind: 'sourceRef_map',
      sourceRef: nonEmpty(entry.sourceRef),
      normalized: normalizeSourceRef(entry.sourceRef),
      prefix: sourceRefPrefix(entry.sourceRef),
      cardId: nonEmpty(entry.cardId),
      title: nonEmpty(entry.title) || '(no title)',
    });
  }

  const buckets = groupBy(rows, (row) => row.prefix || row.normalized);
  return [...buckets.values()]
    .map((bucket) => {
      const uniqueSourceRefs = [...new Set(bucket.map((row) => row.sourceRef))];
      const uniqueCardIds = [...new Set(bucket.map((row) => row.cardId).filter(Boolean))];
      const atlasCount = bucket.filter((row) => row.kind === 'parent_atlas').length;
      const mapCount = bucket.filter((row) => row.kind === 'sourceRef_map').length;
      const packetId = `srprefix_${shortHash(bucket[0].prefix || bucket[0].normalized)}`;
      return {
        schemaVersion: 'sourceRef.prefix.packet.v1',
        packetId,
        title_id: shortHash(bucket[0].prefix || bucket[0].normalized, 16),
        title: bucket[0].prefix || bucket[0].normalized,
        feature_id: 'sourceRef.pathmap',
        sourceRef: bucket[0].prefix || bucket[0].normalized,
        sourceRefs: uniqueSourceRefs.slice(0, 10),
        parentAtlasCardIds: uniqueCardIds.slice(0, 10),
        coldOriginals: uniqueSourceRefs.slice(0, 10),
        summary: `sourceRefs=${uniqueSourceRefs.length}; atlas=${atlasCount}; sourceRefMap=${mapCount}`,
        metrics: {
          sourceRefCount: uniqueSourceRefs.length,
          atlasCount,
          mapCount,
          cardIdCount: uniqueCardIds.length,
        },
        joinSpine: {
          sourceRef: bucket[0].prefix || bucket[0].normalized,
          feature_id: 'sourceRef.pathmap',
          parent_atlas_card_id: uniqueCardIds[0] || null,
        },
      };
    })
    .sort((a, b) => b.metrics.sourceRefCount - a.metrics.sourceRefCount || a.title.localeCompare(b.title))
    .slice(0, limit);
}

function validatePacket(packet) {
  const errors = [];
  if (!packet || typeof packet !== 'object') errors.push('packet is not an object');
  if (typeof packet.packetId !== 'string' || packet.packetId.trim().length === 0) errors.push('packetId missing');
  if (typeof packet.title_id !== 'string' || packet.title_id.trim().length === 0) errors.push('title_id missing');
  if (typeof packet.feature_id !== 'string' || packet.feature_id.trim().length === 0) errors.push('feature_id missing');
  if (typeof packet.sourceRef !== 'string' || packet.sourceRef.trim().length === 0) errors.push('sourceRef missing');
  if (!Array.isArray(packet.sourceRefs)) errors.push('sourceRefs must be an array');
  if (typeof packet.summary !== 'string' || packet.summary.trim().length === 0) errors.push('summary missing');
  return errors;
}

function buildMd(report) {
  const lines = [];
  lines.push('# SourceRef Parent Join Dry Run');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Mode: ${report.mode}`);
  lines.push('');
  lines.push('## Inputs');
  lines.push(`- path-map: ${report.inputs.pathMap}`);
  lines.push(`- sourceRef-cardId-map: ${report.inputs.sourceRefCardMap}`);
  lines.push(`- parent atlas: ${report.inputs.parentAtlas}`);
  lines.push(`- inventory: ${report.inputs.inventory}`);
  lines.push(`- crosswalk: ${report.inputs.crosswalk}`);
  lines.push('');
  lines.push('## Scanner');
  lines.push(`- rg command: ${report.scanner.command}`);
  lines.push(`- rg groups: ${report.scanner.groups.length}`);
  for (const group of report.scanner.groups) {
    lines.push(`- ${group.label}: ${group.fileCount} files${group.error ? ` (error: ${group.error})` : ''}`);
  }
  lines.push('');
  lines.push('## Summary');
  lines.push(`- path rows: ${report.summary.pathRows}`);
  lines.push(`- sourceRef map rows: ${report.summary.sourceRefMapRows}`);
  lines.push(`- parent atlas rows with sourceRef: ${report.summary.parentAtlasRowsWithSourceRef}`);
  lines.push(`- matched sourceRef map rows: ${report.summary.matchedSourceRefMapRows}`);
  lines.push(`- unmatched sourceRef map rows: ${report.summary.unmatchedSourceRefMapRows}`);
  lines.push(`- unmatched parent atlas rows: ${report.summary.unmatchedParentAtlasRows}`);
  lines.push(`- packet manifests: ${report.summary.packetManifests}`);
  lines.push(`- packet validation errors: ${report.summary.packetValidationErrors}`);
  lines.push('');
  lines.push('## Top SourceRef Prefix Clusters');
  for (const row of report.top.sourceRefClusters) {
    lines.push(`- ${row.title} | refs=${row.metrics.sourceRefCount} atlas=${row.metrics.atlasCount} map=${row.metrics.mapCount}`);
  }
  if (report.top.sourceRefClusters.length === 0) lines.push('- none');
  lines.push('');
  lines.push('## Top Path Packets');
  for (const row of report.top.pathPackets) {
    lines.push(`- ${row.title} | files=${row.metrics.fileCount} errors=${row.metrics.importErrorCount} resolved=${row.metrics.resolvedCount}`);
  }
  if (report.top.pathPackets.length === 0) lines.push('- none');
  lines.push('');
  lines.push('## Unmatched Rows');
  lines.push(`- sourceRef map sample: ${report.unmatched.sourceRefMap.slice(0, 5).map((row) => row.sourceRef).join(', ') || 'none'}`);
  lines.push(`- parent atlas sample: ${report.unmatched.parentAtlas.slice(0, 5).map((row) => row.sourceRef).join(', ') || 'none'}`);
  lines.push(`- path row sample: ${report.unmatched.pathRows.slice(0, 5).map((row) => row.filePath).join(', ') || 'none'}`);
  lines.push('');
  lines.push('## Doc Scan Families');
  for (const row of report.docMatches) {
    lines.push(`- ${row.label}: ${row.fileCount} docs`);
  }
  if (report.docMatches.length === 0) lines.push('- none');
  lines.push('');
  lines.push('## Next Safe Action');
  lines.push('- Review the packet manifests, then move only the stale generated evidence that is already summarized.');
  lines.push('- Keep source files, schema files, and live completion notes active.');
  lines.push('- Treat SeaweedFS, Postgres, Qdrant, Neo4j, and Redis as warm/cold targets, not the source of truth.');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  ensureDir(TMP);
  ensureDir(REPORTS);

  const inventory = readJsonIfExists(INVENTORY_PATH, {});
  const pathMap = readJsonIfExists(PATH_MAP_PATH, {});
  const sourceRefMap = readJsonIfExists(SOURCE_REF_MAP_PATH, {});
  const parentAtlas = readJsonIfExists(PARENT_ATLAS_PATH, { entries: [] });
  const crosswalk = readJsonIfExists(CROSSWALK_PATH, null);

  if (!pathMap || Object.keys(pathMap).length === 0) {
    throw new Error(`path map not found or empty: ${PATH_MAP_PATH}`);
  }
  if (!parentAtlas || !Array.isArray(parentAtlas.entries)) {
    throw new Error(`parent atlas not found or invalid: ${PARENT_ATLAS_PATH}`);
  }

  const pathRows = Object.values(pathMap).map((row) => ({
    ...row,
    filePath: nonEmpty(row.filePath).replace(/\\/g, '/'),
    directory: nonEmpty(row.directory).replace(/\\/g, '/'),
    feature: nonEmpty(row.feature) || 'unclassified',
  }));
  const sourceRefMapEntries = Object.values(sourceRefMap).map((row) => ({
    ...row,
    sourceRef: nonEmpty(row.sourceRef),
    normalized: normalizeSourceRef(row.sourceRef),
    prefix: sourceRefPrefix(row.sourceRef),
  }));
  const atlasEntriesWithSourceRef = (parentAtlas.entries || []).filter((entry) => nonEmpty(entry?.sourceRef));
  const atlasEntriesNormalized = atlasEntriesWithSourceRef.map((entry) => ({
    ...entry,
    sourceRef: nonEmpty(entry.sourceRef),
    normalized: normalizeSourceRef(entry.sourceRef),
    prefix: sourceRefPrefix(entry.sourceRef),
    cardId: nonEmpty(entry.id),
  }));

  const atlasSet = new Set(atlasEntriesNormalized.map((entry) => entry.normalized));
  const mapSet = new Set(sourceRefMapEntries.map((entry) => entry.normalized));

  const matchedSourceRefMapRows = sourceRefMapEntries.filter((entry) => atlasSet.has(entry.normalized));
  const unmatchedSourceRefMapRows = sourceRefMapEntries.filter((entry) => !atlasSet.has(entry.normalized));
  const unmatchedParentAtlasRows = atlasEntriesNormalized.filter((entry) => !mapSet.has(entry.normalized));
  const unmatchedPathRows = pathRows
    .filter((row) => row.feature === 'unclassified' || Number(row.importErrorCount ?? 0) > 0)
    .sort((a, b) => Number(b.importErrorCount ?? 0) - Number(a.importErrorCount ?? 0) || Number(b.lines ?? 0) - Number(a.lines ?? 0))
    .slice(0, 100);

  const sourceRefClusters = clusterSourceRefs(atlasEntriesNormalized, sourceRefMapEntries, LIMIT);
  const pathPackets = clusterPathRows(pathRows, LIMIT);

  const docScanRoots = ['docs', 'memory', 'scripts', 'sveltekit-frontend/docs/obsidian-vault/Files'];
  const scannerGroups = DOC_SCAN_GROUPS.map((group) => {
    const scan = runRgScan(group);
    return {
      ...group,
      fileCount: scan.files.length,
      sampleFiles: scan.files.slice(0, 10).map((filePath) => filePath.replace(/\\/g, '/')),
      error: scan.ok ? '' : scan.error || `rg exit ${scan.status}`,
    };
  });

  const packetManifests = [...sourceRefClusters, ...pathPackets];
  const packetValidationErrors = packetManifests.reduce((count, packet) => count + validatePacket(packet).length, 0);
  const packetJsonl = packetManifests.map((packet) => JSON.stringify(packet)).join('\n') + (packetManifests.length > 0 ? '\n' : '');

  fs.writeFileSync(OUTPUT_PACKET_PATH, packetJsonl, 'utf8');

  const report = {
    generatedAt: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'apply-not-supported',
    inputs: {
      pathMap: path.relative(ROOT, PATH_MAP_PATH).replace(/\\/g, '/'),
      sourceRefCardMap: path.relative(ROOT, SOURCE_REF_MAP_PATH).replace(/\\/g, '/'),
      parentAtlas: path.relative(ROOT, PARENT_ATLAS_PATH).replace(/\\/g, '/'),
      inventory: path.relative(ROOT, INVENTORY_PATH).replace(/\\/g, '/'),
      crosswalk: crosswalk ? path.relative(ROOT, CROSSWALK_PATH).replace(/\\/g, '/') : null,
    },
    scanner: {
      command: 'rg -uu -l across docs/memory/scripts/obsidian-vault for sourceRef/pathmap traversal families',
      groups: scannerGroups,
    },
    summary: {
      pathRows: pathRows.length,
      sourceRefMapRows: sourceRefMapEntries.length,
      parentAtlasRowsWithSourceRef: atlasEntriesNormalized.length,
      matchedSourceRefMapRows: matchedSourceRefMapRows.length,
      unmatchedSourceRefMapRows: unmatchedSourceRefMapRows.length,
      unmatchedParentAtlasRows: unmatchedParentAtlasRows.length,
      packetManifests: packetManifests.length,
      packetValidationErrors,
    },
    top: {
      sourceRefClusters: sourceRefClusters.slice(0, 12),
      pathPackets: pathPackets.slice(0, 12),
      features: topEntries(groupBy(pathRows, (row) => nonEmpty(row.feature) || 'unclassified'), 12),
      directories: topEntries(groupBy(pathRows, (row) => nonEmpty(row.directory) || path.posix.dirname(nonEmpty(row.filePath) || '.')), 12),
    },
    unmatched: {
      sourceRefMap: unmatchedSourceRefMapRows.slice(0, 50),
      parentAtlas: unmatchedParentAtlasRows.slice(0, 50),
      pathRows: unmatchedPathRows.slice(0, 50),
    },
    docMatches: scannerGroups.map((group) => ({
      id: group.id,
      label: group.label,
      fileCount: group.fileCount,
      sampleFiles: group.sampleFiles,
      error: group.error || null,
    })),
    inventory,
    notes: [
      'Cold originals stay in archive stores; the packet report points back to them.',
      'The join spine remains file_path -> stableKey -> sourceRef -> feature_id -> packetId.',
      'Qdrant point ids are not the join key.',
      'Redis/Bitfrost is for exact-hit reuse; Postgres/Qdrant/Neo4j are warm indexes, not source-of-truth.',
    ],
  };

  fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(OUTPUT_MD_PATH, buildMd(report), 'utf8');

  console.log('[sourceRef-parent-join] dry-run report written');
  console.log(`  json: ${path.relative(ROOT, OUTPUT_JSON_PATH).replace(/\\/g, '/')}`);
  console.log(`  md:   ${path.relative(ROOT, OUTPUT_MD_PATH).replace(/\\/g, '/')}`);
  console.log(`  packets: ${path.relative(ROOT, OUTPUT_PACKET_PATH).replace(/\\/g, '/')}`);
  console.log(`  packetManifests: ${packetManifests.length}`);
  console.log(`  sourceRefClusters: ${sourceRefClusters.length}`);
  console.log(`  pathPackets: ${pathPackets.length}`);
  console.log(`  matchedSourceRefMapRows: ${matchedSourceRefMapRows.length}`);
  console.log(`  unmatchedSourceRefMapRows: ${unmatchedSourceRefMapRows.length}`);
  console.log(`  unmatchedParentAtlasRows: ${unmatchedParentAtlasRows.length}`);

  if (packetManifests.length > 0) {
    console.log('\nExample packet:');
    console.log(JSON.stringify(packetManifests[0], null, 2));
  }
}

main().catch((error) => {
  console.error('[sourceRef-parent-join] fatal:', error?.message ?? error);
  process.exit(1);
});
