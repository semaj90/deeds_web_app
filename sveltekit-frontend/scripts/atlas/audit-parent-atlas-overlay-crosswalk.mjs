#!/usr/bin/env node
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');
const CANONICAL_DOC_ROOT = process.env.PARENT_ATLAS_DOC_ROOT
  ? path.resolve(process.env.PARENT_ATLAS_DOC_ROOT)
  : path.resolve('C:/Users/james/Documents/Codex/2026-05-12/ve-updated-the-local-quantization-notebook');

const INPUTS = {
  canonical: path.join(CANONICAL_DOC_ROOT, 'docs', 'atlas', 'feature-registry.json'),
  app: path.join(APP_ROOT, 'docs', 'atlas', 'feature-registry.json'),
};

const OUT_JSON = path.join(APP_ROOT, 'docs', 'reports', 'parent-atlas-overlay-crosswalk-report.json');
const OUT_MD = path.join(APP_ROOT, 'docs', 'reports', 'parent-atlas-overlay-crosswalk-report.md');

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeId(value) {
  return normalizeText(value).replace(/\s+/g, '_');
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item != null);
  if (value == null) return [];
  return [value];
}

function featureId(row) {
  return row.feature_id ?? row.featureId ?? row.featureKey ?? row.feature_key ?? row.id ?? null;
}

function titleOf(row) {
  return row.title ?? row.label ?? row.feature_label ?? row.featureLabel ?? featureId(row) ?? '';
}

function sourceRefsOf(row) {
  return [
    ...asArray(row.sourceRefs),
    ...asArray(row.source_refs),
    ...asArray(row.source_ref),
    ...asArray(row.sourceRef),
    ...asArray(row.owner_file),
    ...asArray(row.ownerFile),
    ...asArray(row.path),
    ...asArray(row.file_path),
    ...asArray(row.filePath),
  ].map(String);
}

function tagsOf(row) {
  return [
    ...asArray(row.qdrantTags),
    ...asArray(row.qdrant_tags),
    ...asArray(row.tags),
    ...asArray(row.turbovecLabel),
    ...asArray(row.turbovec_label),
    ...asArray(row.retrieval_lane),
    ...asArray(row.storage_lane),
  ].map(String);
}

function tokenSet(...values) {
  const tokens = new Set();
  for (const value of values) {
    for (const token of normalizeText(value).split(' ')) {
      if (token.length >= 3) tokens.add(token);
    }
  }
  return tokens;
}

function intersectCount(a, b) {
  let count = 0;
  for (const item of a) {
    if (b.has(item)) count += 1;
  }
  return count;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function indexAppRows(appRows) {
  const exact = new Map();
  for (const row of appRows) {
    const id = featureId(row);
    if (!id) continue;
    const key = normalizeId(id);
    if (!exact.has(key)) exact.set(key, []);
    exact.get(key).push(row);
  }
  return { exact };
}

function scoreMatch(rootRow, appRow) {
  const rootId = normalizeId(featureId(rootRow));
  const appId = normalizeId(featureId(appRow));
  const reasons = [];
  let score = 0;

  if (rootId && appId && rootId === appId) {
    score += 100;
    reasons.push('feature_id exact match');
  }

  const rootRefs = new Set(sourceRefsOf(rootRow).map(normalizeText).filter(Boolean));
  const appRefs = new Set(sourceRefsOf(appRow).map(normalizeText).filter(Boolean));
  const sourceRefOverlap = intersectCount(rootRefs, appRefs);
  if (sourceRefOverlap > 0) {
    score += sourceRefOverlap * 20;
    reasons.push(`sourceRefs overlap (${sourceRefOverlap})`);
  }

  const rootTags = new Set(tagsOf(rootRow).map(normalizeText).filter(Boolean));
  const appTags = new Set(tagsOf(appRow).map(normalizeText).filter(Boolean));
  const tagOverlap = intersectCount(rootTags, appTags);
  if (tagOverlap > 0) {
    score += tagOverlap * 10;
    reasons.push(`tag/label overlap (${tagOverlap})`);
  }

  const rootTokens = tokenSet(featureId(rootRow), titleOf(rootRow), rootRow.summary, rootRow.description, tagsOf(rootRow).join(' '));
  const appTokens = tokenSet(featureId(appRow), titleOf(appRow), appRow.summary, appRow.description, tagsOf(appRow).join(' '));
  const textOverlap = intersectCount(rootTokens, appTokens);
  if (textOverlap > 0) {
    score += Math.min(30, textOverlap * 3);
    reasons.push(`label/description fuzzy overlap (${textOverlap})`);
  }

  return { score, reasons };
}

function classifyRoot(rootRow, appRows, appIndex) {
  const id = featureId(rootRow);
  const exactMatches = appIndex.exact.get(normalizeId(id)) ?? [];
  if (exactMatches.length > 0) {
    return {
      rootFeatureId: id,
      rootTitle: titleOf(rootRow),
      classification: 'MAPPED_EXACT',
      matches: exactMatches.slice(0, 8).map((row) => ({
        feature_id: featureId(row),
        title: titleOf(row),
        score: 100,
        reasons: ['feature_id exact match'],
        sourceRefs: sourceRefsOf(row).slice(0, 5),
      })),
    };
  }

  const scored = appRows
    .map((row) => ({ row, ...scoreMatch(rootRow, row) }))
    .filter((item) => item.score >= 12)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  if (scored.length > 0) {
    return {
      rootFeatureId: id,
      rootTitle: titleOf(rootRow),
      classification: 'MAPPED_HEURISTIC',
      matches: scored.map((item) => ({
        feature_id: featureId(item.row),
        title: titleOf(item.row),
        score: item.score,
        reasons: item.reasons,
        sourceRefs: sourceRefsOf(item.row).slice(0, 5),
      })),
    };
  }

  const hasContractEvidence = sourceRefsOf(rootRow).length > 0 || tagsOf(rootRow).length > 0 || rootRow.status === 'implemented';
  return {
    rootFeatureId: id,
    rootTitle: titleOf(rootRow),
    classification: hasContractEvidence ? 'ROOT_CONTRACT_ONLY' : 'MISSING_APP_OVERLAY',
    matches: [],
  };
}

function classifyAppOnly(appRows, mappedAppIds) {
  return appRows
    .filter((row) => !mappedAppIds.has(normalizeId(featureId(row))))
    .map((row) => {
      const refs = sourceRefsOf(row);
      const tags = tagsOf(row);
      const classification = refs.length > 0 || tags.length > 0
        ? 'APP_CODEBASE_INVENTORY'
        : 'CANDIDATE_CANONICAL_FEATURE';
      return {
        feature_id: featureId(row),
        title: titleOf(row),
        classification,
        sourceRefs: refs.slice(0, 5),
        tags: tags.slice(0, 8),
      };
    });
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Parent Atlas Overlay Crosswalk');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- canonical root rows: ${report.summary.canonicalRows}`);
  lines.push(`- app inventory rows: ${report.summary.appRows}`);
  lines.push(`- MAPPED_EXACT: ${report.summary.byRootClassification.MAPPED_EXACT ?? 0}`);
  lines.push(`- MAPPED_HEURISTIC: ${report.summary.byRootClassification.MAPPED_HEURISTIC ?? 0}`);
  lines.push(`- ROOT_CONTRACT_ONLY: ${report.summary.byRootClassification.ROOT_CONTRACT_ONLY ?? 0}`);
  lines.push(`- MISSING_APP_OVERLAY: ${report.summary.byRootClassification.MISSING_APP_OVERLAY ?? 0}`);
  lines.push(`- APP_CODEBASE_INVENTORY: ${report.summary.byAppClassification.APP_CODEBASE_INVENTORY ?? 0}`);
  lines.push(`- CANDIDATE_CANONICAL_FEATURE: ${report.summary.byAppClassification.CANDIDATE_CANONICAL_FEATURE ?? 0}`);
  lines.push('');
  lines.push('## Root Feature Mapping');
  lines.push('');
  for (const item of report.rootMappings) {
    lines.push(`- ${item.rootFeatureId}: ${item.classification}`);
    for (const match of item.matches.slice(0, 3)) {
      lines.push(`  - ${match.feature_id} (${match.score}) - ${match.reasons.join('; ')}`);
    }
  }
  lines.push('');
  lines.push('## Decision Rule');
  lines.push('');
  lines.push('- If most root features map heuristically, keep both registries and store this crosswalk.');
  lines.push('- If root features are truly absent, add root feature IDs as canonical labels into the app overlay.');
  lines.push('- If app rows are inventory rows, do not treat them as registry drift.');
  return lines.join('\n');
}

async function main() {
  const sourceStatus = {
    canonical: existsSync(INPUTS.canonical) ? 'READY' : 'MISSING_SOURCE',
    app: existsSync(INPUTS.app) ? 'READY' : 'MISSING_SOURCE',
  };
  if (sourceStatus.canonical !== 'READY' || sourceStatus.app !== 'READY') {
    const report = {
      generatedAt: new Date().toISOString(),
      inputs: INPUTS,
      sourceStatus,
      summary: {
        canonicalRows: 0,
        appRows: 0,
        byRootClassification: {},
        byAppClassification: {},
      },
      rootMappings: [],
      appOnlyRows: [],
    };
    await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
    await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
    await fs.writeFile(OUT_MD, renderMarkdown(report), 'utf8');
    console.log(JSON.stringify({ ok: false, sourceStatus, report: OUT_JSON }, null, 2));
    return;
  }

  const canonicalRows = await readJson(INPUTS.canonical);
  const appRows = await readJson(INPUTS.app);
  const canonical = Array.isArray(canonicalRows) ? canonicalRows : [];
  const app = Array.isArray(appRows) ? appRows : [];
  const appIndex = indexAppRows(app);
  const rootMappings = canonical.map((row) => classifyRoot(row, app, appIndex));
  const mappedAppIds = new Set(
    rootMappings.flatMap((mapping) => mapping.matches.map((match) => normalizeId(match.feature_id))),
  );
  const appOnlyRows = classifyAppOnly(app, mappedAppIds);

  const countBy = (rows, key) => rows.reduce((acc, row) => {
    const value = row[key] ?? 'UNKNOWN';
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});

  const report = {
    generatedAt: new Date().toISOString(),
    inputs: INPUTS,
    sourceStatus,
    summary: {
      canonicalRows: canonical.length,
      appRows: app.length,
      byRootClassification: countBy(rootMappings, 'classification'),
      byAppClassification: countBy(appOnlyRows, 'classification'),
    },
    rootMappings,
    appOnlyRows: appOnlyRows.slice(0, 250),
  };

  await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
  await fs.writeFile(OUT_MD, renderMarkdown(report), 'utf8');

  console.log(JSON.stringify({
    ok: true,
    canonicalRows: canonical.length,
    appRows: app.length,
    rootClassifications: report.summary.byRootClassification,
    appClassifications: report.summary.byAppClassification,
    report: OUT_JSON,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
