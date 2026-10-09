const SUPPORTED_FETCHERS = new Set([
  'BEAUTIFULSOUP_HTTP',
  'FIRECRAWL',
  'HTTP_FALLBACK',
]);

function requireString(value, field, sourceId) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`SOURCE_MANIFEST_INVALID:${sourceId}:${field}`);
  }
  return value;
}

function validatePageUrl(rawUrl, sourceId, allowedDomains) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`SOURCE_MANIFEST_INVALID_URL:${sourceId}`);
  }
  const hostname = url.hostname.toLowerCase();
  const allowed = allowedDomains.some((domain) => {
    const normalized = domain.toLowerCase();
    return hostname === normalized || hostname.endsWith(`.${normalized}`);
  });
  if (url.protocol !== 'https:' || url.username || url.password || !allowed) {
    throw new Error(`SOURCE_MANIFEST_URL_OUTSIDE_POLICY:${sourceId}:${url.href}`);
  }
  return url.href;
}

function normalizeVersionedSource(source, manifestRevision) {
  const sourceId = requireString(source.source_id, 'source_id', 'unknown');
  const sourceRevision = requireString(source.source_revision, 'source_revision', sourceId);
  const authorityClass = requireString(source.authority_class, 'authority_class', sourceId);
  const fetcher = requireString(source.default_fetcher, 'default_fetcher', sourceId);
  const title = requireString(source.title, 'title', sourceId);
  const outputNamespace = requireString(source.output_namespace, 'output_namespace', sourceId);
  const allowedDomains = source.allowed_domains;
  const pages = source.pages;
  if (!Array.isArray(allowedDomains) || allowedDomains.length === 0 ||
      !allowedDomains.every((value) => typeof value === 'string' && value.length > 0)) {
    throw new Error(`SOURCE_MANIFEST_INVALID:${sourceId}:allowed_domains`);
  }
  if (!Array.isArray(pages) || pages.length === 0 || !pages.every((value) => typeof value === 'string')) {
    throw new Error(`SOURCE_MANIFEST_INVALID:${sourceId}:pages`);
  }
  if (!Number.isSafeInteger(source.maximum_pages) || source.maximum_pages < 1 || pages.length > source.maximum_pages) {
    throw new Error(`SOURCE_MANIFEST_PAGE_LIMIT_EXCEEDED:${sourceId}`);
  }
  if (!Number.isSafeInteger(source.maximum_depth) || source.maximum_depth < 0) {
    throw new Error(`SOURCE_MANIFEST_INVALID:${sourceId}:maximum_depth`);
  }
  if (!SUPPORTED_FETCHERS.has(fetcher)) {
    throw new Error(`SOURCE_MANIFEST_UNSUPPORTED_FETCHER:${sourceId}:${fetcher}`);
  }
  const safePages = pages.map((url) => validatePageUrl(url, sourceId, allowedDomains));
  if (new Set(safePages).size !== safePages.length) {
    throw new Error(`SOURCE_MANIFEST_DUPLICATE_PAGE:${sourceId}`);
  }
  return {
    source_id: sourceId,
    source_revision: sourceRevision,
    title,
    kind: authorityClass === 'OFFICIAL_PRIMARY' ? 'official_docs' : 'reference_docs',
    domain_class: 'documentation',
    focus_tags: [],
    pages: safePages,
    preferred_fetcher: fetcher,
    source_metadata: {
      manifest_revision: manifestRevision,
      authority_class: authorityClass,
      output_namespace: outputNamespace,
      maximum_pages: source.maximum_pages,
      maximum_depth: source.maximum_depth,
      allowed_domains: [...allowedDomains],
      provider: source.provider ?? null,
      product: source.product ?? null,
      version_qualification: source.version_qualification ?? null,
      language: source.language ?? null,
      publisher: source.publisher ?? null,
    },
  };
}

export function normalizeOkfDevSourceManifestV1(manifest) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.sources)) {
    throw new Error('SOURCE_MANIFEST_INVALID:sources');
  }
  const versioned = typeof manifest.manifest_revision === 'string';
  if (!versioned) return manifest.sources;
  if (!manifest.manifest_revision.trim()) throw new Error('SOURCE_MANIFEST_INVALID:manifest_revision');
  const normalized = manifest.sources.map((source) => normalizeVersionedSource(source, manifest.manifest_revision));
  if (new Set(normalized.map((source) => source.source_id)).size !== normalized.length) {
    throw new Error('SOURCE_MANIFEST_DUPLICATE_SOURCE_ID');
  }
  return normalized;
}

export function orderOkfDevFetchersV1(preferredFetcher) {
  const fallbackOrder = ['FIRECRAWL', 'BEAUTIFULSOUP_HTTP', 'HTTP_FALLBACK'];
  if (!preferredFetcher) return fallbackOrder;
  if (!SUPPORTED_FETCHERS.has(preferredFetcher)) throw new Error(`SOURCE_MANIFEST_UNSUPPORTED_FETCHER:${preferredFetcher}`);
  return [preferredFetcher, ...fallbackOrder.filter((fetcher) => fetcher !== preferredFetcher)];
}
