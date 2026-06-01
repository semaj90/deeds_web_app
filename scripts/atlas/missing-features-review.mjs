#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..', '..');
const TMP = resolve(ROOT, '.tmp');
const REPORTS = resolve(ROOT, 'docs', 'reports');
const MAPREDUCE_PATH = resolve(TMP, 'mapreduce-full-v4.ndjson');
const REGISTRY_PATH = resolve(ROOT, 'sveltekit-frontend', 'docs', 'reports', 'feature-gap-registry-live-latest.json');
const PARENT_ATLAS_PATH = resolve(ROOT, 'memory', 'exports', 'parent-atlas', 'parent_atlas_index.json');
const REPO_ROOT_ATLAS_PATH = resolve(ROOT, 'docs', 'graph', 'repo-root-atlas.json');
const OUTPUT_JSON = join(REPORTS, 'missing-features-review-latest.json');
const OUTPUT_MD = join(REPORTS, 'missing-features-review-latest.md');
const OUTPUT_SVG = join(REPORTS, 'missing-features-review-latest.svg');
const EXCLUDED_ROOTS = new Set([
  '.git',
  '.tmp',
  '.cache',
  '.opencode',
  '.svelte-kit',
  '.venv',
  '.python311',
  '.pytest_cache',
  'node_modules',
  'dist',
  'coverage',
  'build',
  'target',
  'logs',
  'minio-data',
  'tmp',
]);

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const staleDaysArg = [...process.argv.slice(2)].find((arg) => arg.startsWith('--stale-days='));
const staleDays = staleDaysArg ? Math.max(1, Number(staleDaysArg.split('=')[1]) || 60) : 60;
const limitArg = [...process.argv.slice(2)].find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 200) : 200;

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

function readNdjson(filePath) {
  try {
    return readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function normalizePathText(value) {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/{2,}/g, '/')
    .trim();
}

function stripChunkSuffix(value) {
  return normalizePathText(value).replace(/#chunk-\d+$/i, '');
}

function pathSegments(value) {
  return stripChunkSuffix(value).split('/').filter(Boolean);
}

function sourceRefPrefix(value) {
  const segments = pathSegments(value);
  if (segments.length === 0) return 'unknown';
  if (segments[0] === 'src') return segments.slice(0, Math.min(4, segments.length)).join('/');
  if (segments[0] === 'sveltekit-frontend' && segments[1] === 'src') {
    return segments.slice(0, Math.min(5, segments.length)).join('/');
  }
  if (segments[0] === 'docs' || segments[0] === 'scripts' || segments[0] === 'memory' || segments[0] === 'tests') {
    return segments.slice(0, Math.min(2, segments.length)).join('/');
  }
  if (segments[0].startsWith('.')) {
    return segments.slice(0, Math.min(2, segments.length)).join('/');
  }
  return segments.slice(0, Math.min(3, segments.length)).join('/');
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function gitLastTouchDays(relativePath) {
  const filePath = normalizePathText(relativePath);
  if (!filePath) return null;
  const result = spawnSync('git', ['log', '-1', '--format=%ct', '--', filePath], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  const text = String(result.stdout ?? '').trim();
  if (!text) return null;
  const ts = Number(text);
  if (!Number.isFinite(ts) || ts <= 0) return null;
  return Math.max(0, Math.floor((Date.now() - ts * 1000) / 86_400_000));
}

function inferFeatureKey(row) {
  return normalizePathText(row?.feature_id ?? row?.feature ?? row?.title ?? 'unknown');
}

function flattenSourceRefs(row) {
  const refs = Array.isArray(row?.sourceRefs)
    ? row.sourceRefs
    : Array.isArray(row?.sourceRefs?.sourceRefs)
      ? row.sourceRefs.sourceRefs
      : [];
  const owner = row?.owner_file ? [row.owner_file] : [];
  return unique([...owner, ...refs].map(stripChunkSuffix));
}

function loadRegistryRows() {
  const registry = readJson(REGISTRY_PATH, { rows: [] });
  return Array.isArray(registry?.rows) ? registry.rows : [];
}

function loadParentAtlasEntries() {
  const parentAtlas = readJson(PARENT_ATLAS_PATH, { entries: [] });
  return Array.isArray(parentAtlas?.entries) ? parentAtlas.entries : [];
}

function loadRepoRootAtlas() {
  return readJson(REPO_ROOT_ATLAS_PATH, null);
}

function loadMapreduceEntries() {
  return readNdjson(MAPREDUCE_PATH);
}

function buildPrefixClusters(rows, field = 'sourceRefs') {
  const clusters = new Map();
  for (const row of rows) {
    const refs = field === 'sourceRefs' ? flattenSourceRefs(row) : unique([row?.filePath ?? row?.path ?? row?.sourceRef ?? '']);
    for (const ref of refs) {
      const prefix = sourceRefPrefix(ref);
      const bucket = clusters.get(prefix) ?? {
        prefix,
        count: 0,
        featureIds: new Set(),
        ownerFiles: new Set(),
        refs: new Set(),
      };
      bucket.count += 1;
      bucket.refs.add(ref);
      if (row?.feature_id) bucket.featureIds.add(row.feature_id);
      if (row?.feature) bucket.featureIds.add(row.feature);
      if (row?.owner_file) bucket.ownerFiles.add(row.owner_file);
      if (row?.filePath) bucket.ownerFiles.add(row.filePath);
      clusters.set(prefix, bucket);
    }
  }
  return [...clusters.values()]
    .map((bucket) => ({
      prefix: bucket.prefix,
      count: bucket.count,
      featureIds: [...bucket.featureIds].sort(),
      ownerFiles: [...bucket.ownerFiles].sort(),
      refs: [...bucket.refs].sort(),
    }))
    .sort((a, b) => b.count - a.count || a.prefix.localeCompare(b.prefix));
}

function buildDuplicateSystems(rows) {
  const pairs = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const left = rows[i];
      const right = rows[j];
      const leftRefs = new Set(flattenSourceRefs(left).map(stripChunkSuffix));
      const rightRefs = new Set(flattenSourceRefs(right).map(stripChunkSuffix));
      const sharedRefs = [...leftRefs].filter((ref) => rightRefs.has(ref));
      const leftPrefix = sourceRefPrefix(left.owner_file ?? flattenSourceRefs(left)[0] ?? '');
      const rightPrefix = sourceRefPrefix(right.owner_file ?? flattenSourceRefs(right)[0] ?? '');
      const sharedPrefix = leftPrefix === rightPrefix ? leftPrefix : null;
      if (sharedRefs.length === 0 && !sharedPrefix) continue;
      pairs.push({
        featureIds: [inferFeatureKey(left), inferFeatureKey(right)].sort(),
        sharedRefs: sharedRefs.sort(),
        sharedPrefix,
        left: {
          feature_id: inferFeatureKey(left),
          owner_file: left.owner_file ?? '',
          prefix: leftPrefix,
        },
        right: {
          feature_id: inferFeatureKey(right),
          owner_file: right.owner_file ?? '',
          prefix: rightPrefix,
        },
      });
    }
  }
  return pairs.sort((a, b) => b.sharedRefs.length - a.sharedRefs.length || a.featureIds.join('|').localeCompare(b.featureIds.join('|')));
}

function buildStaleFeatures(rows) {
  return rows
    .map((row) => {
      const owner = normalizePathText(row.owner_file);
      const touchDays = gitLastTouchDays(owner || flattenSourceRefs(row)[0]);
      const refs = flattenSourceRefs(row);
      const prefix = sourceRefPrefix(owner || refs[0] || '');
      return {
        feature_id: inferFeatureKey(row),
        owner_file: owner,
        prefix,
        last_touch_days: touchDays,
        status: row.status ?? 'unknown',
        nextAction: row.nextAction ?? '',
        sourceRefs: refs,
        isStale: touchDays == null ? false : touchDays >= staleDays,
      };
    })
    .sort((a, b) => {
      const ad = a.last_touch_days ?? Number.POSITIVE_INFINITY;
      const bd = b.last_touch_days ?? Number.POSITIVE_INFINITY;
      return bd - ad || a.feature_id.localeCompare(b.feature_id);
    });
}

function buildMissingCandidates(mapreduceEntries, registryRows) {
  const registryPaths = new Set(
    registryRows.flatMap((row) => flattenSourceRefs(row).map(stripChunkSuffix)).filter(Boolean)
  );
  const candidates = [];
  for (const row of mapreduceEntries) {
    const filePath = normalizePathText(row.filePath ?? row.path ?? '');
    if (!filePath) continue;
    const firstSegment = pathSegments(filePath)[0] ?? '';
    if (EXCLUDED_ROOTS.has(firstSegment)) continue;
    const feature = normalizePathText(row.feature ?? '');
    const importErrorCount = Number(row.importErrorCount ?? 0) || 0;
    const staticImports = Array.isArray(row.staticImports) ? row.staticImports.length : 0;
    const reason = [];
    if (feature === 'unclassified' || !feature) reason.push('unclassified');
    if (importErrorCount >= 2) reason.push(`importErrors:${importErrorCount}`);
    if (!registryPaths.has(filePath) && !registryPaths.has(stripChunkSuffix(filePath))) reason.push('not-in-registry');
    if (reason.length === 0) continue;
    candidates.push({
      filePath,
      prefix: sourceRefPrefix(filePath),
      feature,
      importErrorCount,
      staticImportCount: staticImports,
      stableKey: row.stableKey ?? '',
      reason,
    });
  }
  return candidates
    .sort((a, b) => b.importErrorCount - a.importErrorCount || b.staticImportCount - a.staticImportCount || a.filePath.localeCompare(b.filePath))
    .slice(0, limit);
}

function buildAtlasCoverageByPrefix(parentAtlasEntries) {
  const clusters = new Map();
  for (const entry of parentAtlasEntries) {
    const ref = stripChunkSuffix(entry.sourceRef ?? '');
    if (!ref) continue;
    const prefix = sourceRefPrefix(ref);
    const bucket = clusters.get(prefix) ?? { prefix, count: 0, refs: new Set(), ids: new Set() };
    bucket.count += 1;
    bucket.refs.add(ref);
    if (entry.id) bucket.ids.add(entry.id);
    clusters.set(prefix, bucket);
  }
  return [...clusters.values()]
    .map((bucket) => ({
      prefix: bucket.prefix,
      count: bucket.count,
      refs: [...bucket.refs].sort(),
      ids: [...bucket.ids].sort(),
    }))
    .sort((a, b) => b.count - a.count || a.prefix.localeCompare(b.prefix));
}

function mdTable(rows, columns) {
  const header = `| ${columns.map((col) => col.label).join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${columns.map((col) => col.value(row)).join(' | ')} |`);
  return [header, divider, ...body].join('\n');
}

function esc(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildSvg(report) {
  const width = 1600;
  const height = 1080;
  const margin = 48;
  const left = margin;
  const top = margin;
  const right = width - margin;
  const sectionGap = 18;
  const palette = {
    bg: '#0e1116',
    panel: '#151a22',
    panel2: '#11161d',
    text: '#e8eef7',
    muted: '#9aa7b5',
    accent: '#7dd3fc',
    warning: '#fbbf24',
    danger: '#fb7185',
    success: '#34d399',
    line: '#263041',
  };

  const prefixRows = report.registryPrefixClusters.slice(0, 10);
  const missingRows = report.missingFeatureCandidates.slice(0, 10);
  const dupRows = report.duplicateSystems.slice(0, 10);
  const atlasRows = report.atlasPrefixCoverage.slice(0, 10);

  const sections = [];
  let cursorY = top;

  function header(title, subtitle) {
    const h = `
      <text x="${left}" y="${cursorY}" fill="${palette.text}" font-size="28" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-weight="700">${esc(title)}</text>
      <text x="${left}" y="${cursorY + 24}" fill="${palette.muted}" font-size="14" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">${esc(subtitle)}</text>
    `;
    cursorY += 40;
    return h;
  }

  function sectionBox(title, subtitle, contentHeight) {
    const boxY = cursorY;
    const box = `
      <rect x="${left}" y="${boxY}" width="${right - left}" height="${contentHeight}" rx="16" fill="${palette.panel}" stroke="${palette.line}" />
    `;
    const head = `
      <text x="${left + 18}" y="${boxY + 28}" fill="${palette.text}" font-size="18" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-weight="700">${esc(title)}</text>
      <text x="${left + 18}" y="${boxY + 48}" fill="${palette.muted}" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">${esc(subtitle)}</text>
    `;
    return { boxY, box, head };
  }

  function hexGlyph(cx, cy, radius, fill, stroke, label, label2) {
    const points = Array.from({ length: 6 }, (_, i) => {
      const angle = Math.PI / 3 * i - Math.PI / 6;
      return `${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`;
    }).join(' ');
    return `
      <polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="2" />
      <text x="${cx}" y="${(cy - 2).toFixed(1)}" text-anchor="middle" fill="${palette.text}" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-weight="700">${esc(label)}</text>
      <text x="${cx}" y="${(cy + 14).toFixed(1)}" text-anchor="middle" fill="${palette.muted}" font-size="10" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">${esc(label2)}</text>
    `;
  }

  sections.push(header('Missing Features Review', `${report.summary.registryRowCount} registry rows · ${report.summary.mapreduceEntryCount} mapreduce entries · ${report.summary.parentAtlasEntryCount} atlas entries`));

  // Summary chips
  const chipsY = cursorY + 4;
  const chips = [
    { label: 'Missing', value: report.summary.missingCandidateCount, color: palette.warning },
    { label: 'Duplicate', value: report.summary.duplicateSystemCount, color: palette.danger },
    { label: 'Stale', value: report.summary.staleFeatureCount, color: palette.success },
    { label: 'Prefix clusters', value: report.summary.registryPrefixClusterCount, color: palette.accent },
  ];
  let chipX = left;
  for (const chip of chips) {
    sections.push(`
      <rect x="${chipX}" y="${chipsY}" width="220" height="58" rx="14" fill="${palette.panel2}" stroke="${palette.line}" />
      <text x="${chipX + 16}" y="${chipsY + 22}" fill="${palette.muted}" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">${esc(chip.label)}</text>
      <text x="${chipX + 16}" y="${chipsY + 44}" fill="${chip.color}" font-size="24" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-weight="800">${esc(chip.value)}</text>
    `);
    chipX += 236;
  }
  cursorY += 78;

  // Prefix clusters
  const prefixBoxHeight = 280;
  const prefixBox = sectionBox('SourceRef Prefix Clusters', 'Registry rows grouped by sourceRef prefix', prefixBoxHeight);
  sections.push(prefixBox.box, prefixBox.head);
  const clusterBaseY = prefixBox.boxY + 74;
  const clusterSpacing = 132;
  prefixRows.forEach((row, index) => {
    const cx = left + 92 + index * clusterSpacing;
    const cy = clusterBaseY + 56;
    const radius = 34 + Math.min(22, Math.max(0, row.count));
    const fill = index % 3 === 0 ? '#153047' : index % 3 === 1 ? '#1b2c3e' : '#162432';
    sections.push(hexGlyph(cx, cy, radius, fill, palette.accent, String(row.count), row.prefix));
  });
  cursorY += prefixBoxHeight + sectionGap;

  // Missing candidates
  const missingBoxHeight = 240;
  const missingBox = sectionBox('Top Missing Feature Candidates', 'Mapreduce files with import errors or not yet represented in the registry', missingBoxHeight);
  sections.push(missingBox.box, missingBox.head);
  const missingStartY = missingBox.boxY + 76;
  missingRows.forEach((row, index) => {
    const y = missingStartY + index * 15;
    sections.push(`
      <circle cx="${left + 18}" cy="${y - 3}" r="4" fill="${palette.warning}" />
      <text x="${left + 34}" y="${y}" fill="${palette.text}" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">${esc(row.filePath)}</text>
      <text x="${right - 290}" y="${y}" fill="${palette.muted}" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">${esc(row.reason.join(', '))}</text>
    `);
  });
  cursorY += missingBoxHeight + sectionGap;

  // Duplicate systems + atlas coverage side-by-side
  const halfWidth = Math.floor((right - left - 18) / 2);
  const dupBoxHeight = 250;
  sections.push(`
    <rect x="${left}" y="${cursorY}" width="${halfWidth}" height="${dupBoxHeight}" rx="16" fill="${palette.panel}" stroke="${palette.line}" />
    <rect x="${left + halfWidth + 18}" y="${cursorY}" width="${halfWidth}" height="${dupBoxHeight}" rx="16" fill="${palette.panel}" stroke="${palette.line}" />
    <text x="${left + 18}" y="${cursorY + 28}" fill="${palette.text}" font-size="18" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-weight="700">Duplicate Systems</text>
    <text x="${left + 18}" y="${cursorY + 48}" fill="${palette.muted}" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">Shared refs or shared prefixes across feature rows</text>
    <text x="${left + halfWidth + 36}" y="${cursorY + 28}" fill="${palette.text}" font-size="18" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-weight="700">Atlas Coverage by Prefix</text>
    <text x="${left + halfWidth + 36}" y="${cursorY + 48}" fill="${palette.muted}" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">Parent atlas entries grouped by sourceRef prefix</text>
  `);

  dupRows.forEach((row, index) => {
    const y = cursorY + 76 + index * 16;
    sections.push(`
      <circle cx="${left + 18}" cy="${y - 3}" r="4" fill="${palette.danger}" />
      <text x="${left + 34}" y="${y}" fill="${palette.text}" font-size="11" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">${esc(row.featureIds.join(' / '))}</text>
    `);
  });
  atlasRows.forEach((row, index) => {
    const y = cursorY + 76 + index * 16;
    sections.push(`
      <circle cx="${left + halfWidth + 36}" cy="${y - 3}" r="4" fill="${palette.success}" />
      <text x="${left + halfWidth + 52}" y="${y}" fill="${palette.text}" font-size="11" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">${esc(row.prefix)} · ${esc(row.count)}</text>
    `);
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Missing features review">
  <rect width="100%" height="100%" fill="${palette.bg}" />
  ${sections.join('\n')}
</svg>\n`;
}

function main() {
  if (!existsSync(MAPREDUCE_PATH)) {
    throw new Error(`Missing mapreduce input: ${MAPREDUCE_PATH}`);
  }

  const registryRows = loadRegistryRows();
  const parentAtlasEntries = loadParentAtlasEntries();
  const repoRootAtlas = loadRepoRootAtlas();
  const mapreduceEntries = loadMapreduceEntries();

  const missingCandidates = buildMissingCandidates(mapreduceEntries, registryRows);
  const staleFeatures = buildStaleFeatures(registryRows);
  const duplicateSystems = buildDuplicateSystems(registryRows);
  const registryPrefixClusters = buildPrefixClusters(registryRows, 'sourceRefs');
  const mapreducePrefixClusters = buildPrefixClusters(mapreduceEntries, 'filePath');
  const atlasPrefixCoverage = buildAtlasCoverageByPrefix(parentAtlasEntries);

  const summary = {
    registryRowCount: registryRows.length,
    mapreduceEntryCount: mapreduceEntries.length,
    parentAtlasEntryCount: parentAtlasEntries.length,
    repoRootAtlas: repoRootAtlas
      ? {
          fileCount: repoRootAtlas.summary?.fileCount ?? null,
          dirCount: repoRootAtlas.summary?.dirCount ?? null,
          workspaceCount: repoRootAtlas.summary?.workspaceCount ?? null,
          clusterAliasCount: repoRootAtlas.summary?.clusterAliasCount ?? null,
        }
      : null,
    missingCandidateCount: missingCandidates.length,
    staleFeatureCount: staleFeatures.filter((item) => item.isStale).length,
    duplicateSystemCount: duplicateSystems.length,
    registryPrefixClusterCount: registryPrefixClusters.length,
    mapreducePrefixClusterCount: mapreducePrefixClusters.length,
    atlasPrefixCoverageCount: atlasPrefixCoverage.length,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    staleDays,
    limit,
    inputs: {
      mapreduce: MAPREDUCE_PATH,
      registry: REGISTRY_PATH,
      parentAtlas: PARENT_ATLAS_PATH,
      repoRootAtlas: REPO_ROOT_ATLAS_PATH,
    },
    summary,
    registryPrefixClusters: registryPrefixClusters.slice(0, 50),
    mapreducePrefixClusters: mapreducePrefixClusters.slice(0, 50),
    atlasPrefixCoverage: atlasPrefixCoverage.slice(0, 50),
    missingFeatureCandidates: missingCandidates.slice(0, 200),
    staleFeatures,
    duplicateSystems: duplicateSystems.slice(0, 100),
  };

  const md = [
    '# Missing Features Review',
    '',
    `Generated: ${report.generatedAt}`,
    `Stale threshold: ${staleDays} days`,
    '',
    '## Summary',
    '',
    `- Registry rows: **${summary.registryRowCount}**`,
    `- Mapreduce entries: **${summary.mapreduceEntryCount}**`,
    `- Parent atlas entries: **${summary.parentAtlasEntryCount}**`,
    `- Missing candidates: **${summary.missingCandidateCount}**`,
    `- Stale features: **${summary.staleFeatureCount}**`,
    `- Duplicate systems: **${summary.duplicateSystemCount}**`,
    '',
    '## Top Missing Feature Candidates',
    '',
    mdTable(report.missingFeatureCandidates.slice(0, 25), [
      { label: 'File', value: (row) => `\`${row.filePath}\`` },
      { label: 'Prefix', value: (row) => row.prefix },
      { label: 'Feature', value: (row) => row.feature || 'unclassified' },
      { label: 'Import Errors', value: (row) => String(row.importErrorCount) },
      { label: 'Reason', value: (row) => row.reason.join(', ') },
    ]),
    '',
    '## Stale Feature Candidates',
    '',
    mdTable(report.staleFeatures.filter((row) => row.isStale).slice(0, 25), [
      { label: 'Feature', value: (row) => row.feature_id },
      { label: 'Owner File', value: (row) => `\`${row.owner_file}\`` },
      { label: 'Prefix', value: (row) => row.prefix },
      { label: 'Last Touch (days)', value: (row) => (row.last_touch_days == null ? 'unknown' : String(row.last_touch_days)) },
      { label: 'Status', value: (row) => row.status },
    ]),
    '',
    '## Duplicate Systems',
    '',
    mdTable(report.duplicateSystems.slice(0, 25), [
      { label: 'Feature Pair', value: (row) => row.featureIds.join(' / ') },
      { label: 'Shared Prefix', value: (row) => row.sharedPrefix ?? '' },
      { label: 'Shared Refs', value: (row) => String(row.sharedRefs.length) },
      { label: 'Left Owner', value: (row) => `\`${row.left.owner_file}\`` },
      { label: 'Right Owner', value: (row) => `\`${row.right.owner_file}\`` },
    ]),
    '',
    '## Registry SourceRef Clusters',
    '',
    mdTable(report.registryPrefixClusters.slice(0, 20), [
      { label: 'Prefix', value: (row) => row.prefix },
      { label: 'Count', value: (row) => String(row.count) },
      { label: 'Feature IDs', value: (row) => row.featureIds.slice(0, 4).join(', ') },
      { label: 'Owners', value: (row) => row.ownerFiles.slice(0, 3).join(', ') },
    ]),
    '',
    '## Mapreduce Path Clusters',
    '',
    mdTable(report.mapreducePrefixClusters.slice(0, 20), [
      { label: 'Prefix', value: (row) => row.prefix },
      { label: 'Count', value: (row) => String(row.count) },
      { label: 'Files', value: (row) => row.refs.slice(0, 3).join(', ') },
    ]),
    '',
    '## Atlas Coverage by Prefix',
    '',
    mdTable(report.atlasPrefixCoverage.slice(0, 20), [
      { label: 'Prefix', value: (row) => row.prefix },
      { label: 'Count', value: (row) => String(row.count) },
      { label: 'Sample Refs', value: (row) => row.refs.slice(0, 3).join(', ') },
    ]),
    '',
    '## Next Step',
    '',
    'Use this report to decide archive candidates and rerun the parent atlas refresh only after the production-ready feature list is frozen.',
    '',
  ].join('\n');

  if (!dryRun) {
    writeFileSync(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    writeFileSync(OUTPUT_MD, md, 'utf8');
    writeFileSync(OUTPUT_SVG, buildSvg(report), 'utf8');
  }

  console.log(JSON.stringify({ ok: true, summary, outputs: { json: OUTPUT_JSON, md: OUTPUT_MD, svg: OUTPUT_SVG } }, null, 2));
}

main();
