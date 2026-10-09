import crypto from 'node:crypto';
import { normalizeDocumentationUrlV1 } from './documentation-demand-v1.mjs';

const sha256Json = (value) => crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');

export function buildDocumentationCrawlAllowlistV1({ demandPlan, crawlerManifest, maxSources = 10 }) {
  if (demandPlan?.schema !== 'atlas.documentation-demand.v1'
    || demandPlan.status !== 'READ_ONLY_DETERMINISTIC_FETCH_PLAN'
    || demandPlan.canonicalAuthority !== false
    || demandPlan.fetchPerformed !== false
    || demandPlan.datastoreWritesPerformed !== false
    || !Array.isArray(demandPlan.demands)) {
    throw new Error('DOCUMENTATION_DEMAND_PLAN_NOT_VERIFIED');
  }
  if (sha256Json(demandPlan.demands) !== demandPlan.demandChecksum) {
    throw new Error('DOCUMENTATION_DEMAND_CHECKSUM_MISMATCH');
  }
  if (!crawlerManifest || !Array.isArray(crawlerManifest.sources)) {
    throw new Error('CRAWLER_MANIFEST_INVALID');
  }
  if (!Number.isInteger(maxSources) || maxSources < 1 || maxSources > 100) {
    throw new Error('MAX_SOURCES_OUT_OF_RANGE');
  }

  const sourceById = new Map();
  for (const source of crawlerManifest.sources) {
    if (typeof source?.source_id !== 'string' || !source.source_id.trim()
      || !Array.isArray(source.pages) || source.pages.some((page) => typeof page !== 'string')) {
      throw new Error('CRAWLER_MANIFEST_SOURCE_INVALID');
    }
    if (sourceById.has(source.source_id)) throw new Error(`DUPLICATE_CRAWLER_SOURCE:${source.source_id}`);
    sourceById.set(source.source_id, source);
  }

  const ranked = [...demandPlan.demands].sort((left, right) =>
    right.relevanceScore - left.relevanceScore || left.sourceId.localeCompare(right.sourceId));
  const selectedSources = [];
  const selections = [];
  const skipped = [];
  for (let index = 0; index < ranked.length; index += 1) {
    const demand = ranked[index];
    if (typeof demand?.sourceId !== 'string' || !Number.isFinite(demand.relevanceScore)
      || !Array.isArray(demand.officialUrls) || demand.officialUrls.some((url) => typeof url !== 'string')) {
      throw new Error('DOCUMENTATION_DEMAND_ENTRY_INVALID');
    }
    const source = sourceById.get(demand.sourceId);
    if (!source) {
      skipped.push({ sourceId: demand.sourceId, rank: index + 1, reason: 'SOURCE_NOT_IN_CRAWLER_MANIFEST' });
      continue;
    }
    if (demand.fetchStatus === 'ALREADY_INDEXED' || demand.fetchStatus === 'NO_CATALOG_URLS') {
      skipped.push({ sourceId: demand.sourceId, rank: index + 1, reason: 'NO_MISSING_CATALOG_URLS' });
      continue;
    }
    const plannedUrls = new Set((Array.isArray(demand.indexedDocumentation?.missingUrls)
      ? demand.indexedDocumentation.missingUrls
      : demand.officialUrls).map(normalizeDocumentationUrlV1).filter(Boolean));
    const exactPages = [...new Set(source.pages.filter((page) => plannedUrls.has(normalizeDocumentationUrlV1(page))))];
    if (exactPages.length === 0) {
      skipped.push({ sourceId: demand.sourceId, rank: index + 1, reason: 'NO_EXACT_PLANNED_URL_MATCH' });
      continue;
    }
    if (selectedSources.length >= maxSources) {
      skipped.push({ sourceId: demand.sourceId, rank: index + 1, reason: 'MAX_SOURCE_LIMIT_REACHED' });
      continue;
    }
    const selectedSource = { ...source, pages: [...exactPages] };
    selectedSources.push(selectedSource);
    selections.push({
      sourceId: demand.sourceId,
      rank: index + 1,
      relevanceScore: demand.relevanceScore,
      pages: [...exactPages],
      sourceChecksum: sha256Json(selectedSource),
    });
  }

  const metadata = {
    schema: 'atlas.documentation-crawl-allowlist.v1',
    demandChecksum: demandPlan.demandChecksum,
    selectedSources: selections,
    skipped,
    maxSources,
    fetchPerformed: false,
    datastoreWritesPerformed: false,
    canonicalAuthority: false,
  };
  return {
    ...crawlerManifest,
    sources: selectedSources,
    atlasDocumentationDemand: { ...metadata, checksum: sha256Json(metadata) },
  };
}
