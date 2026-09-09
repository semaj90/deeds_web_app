import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const ROOT = new URL('../../', import.meta.url);
const REPORT_PATH = new URL('docs/reports/external-search-result-parity-v1.json', ROOT);

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

const query = arg('query', 'ast-grep tree-sitter');
const limit = Math.min(Math.max(Number.parseInt(arg('limit', '5'), 10) || 5, 1), 20);
const searxngBase = arg('searxng-url', 'http://127.0.0.1:8889');
const goBase = arg('go-url', 'http://127.0.0.1:8100');

function sha256(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const body = await response.text();
  let json = null;
  try {
    json = JSON.parse(body);
  } catch {
    // The report preserves the failed body shape without treating it as a contract.
  }
  return { status: response.status, json };
}

const queryChecksum = sha256(query.trim());
const searxngUrl = new URL('/search', searxngBase);
searxngUrl.searchParams.set('q', query);
searxngUrl.searchParams.set('format', 'json');
searxngUrl.searchParams.set('categories', 'general');

const goUrl = new URL('/search/bm25', goBase);
const [searxng, go] = await Promise.all([
  getJson(searxngUrl),
  fetch(goUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, limit }),
    signal: AbortSignal.timeout(10_000),
  }).then(async (response) => {
    const body = await response.text();
    let json = null;
    try {
      json = JSON.parse(body);
    } catch {
      // The report preserves the failed body shape without treating it as a contract.
    }
    return { status: response.status, json };
  }),
]);

const searxngResults = Array.isArray(searxng.json?.results) ? searxng.json.results.slice(0, limit) : [];
const goResults = Array.isArray(go.json?.results) ? go.json.results.slice(0, limit) : [];
const searxngRefs = searxngResults.map((row) => text(row?.url));
const goRefs = goResults.map((row) => text(row?.source_ref));
const commonSearxng = searxngResults.map((row, index) => ({
  source: 'searxng',
  sourceRef: text(row?.url),
  title: text(row?.title),
  snippet: text(row?.content),
  rank: index + 1,
}));
const commonGo = goResults.map((row, index) => ({
  source: 'postgres_fts',
  sourceRef: text(row?.source_ref),
  title: text(row?.summary),
  snippet: text(row?.snippet),
  rank: Number(row?.rank) || index + 1,
}));

const checks = {
  searxngHttpOk: searxng.status === 200,
  searxngResultsArray: Array.isArray(searxng.json?.results),
  searxngResultsHaveHttpRefs: searxngResults.length > 0 && searxngRefs.every(validUrl),
  searxngRefsUnique: new Set(searxngRefs).size === searxngRefs.length,
  goHttpOk: go.status === 200,
  goResultsArray: Array.isArray(go.json?.results),
  goResultsHaveSourceRefs: goResults.length === 0 || goRefs.every((ref) => ref.length > 0),
  goReadOnly: go.json?.read_only === true,
  goCanonicalAuthorityFalse: go.json?.capability?.canonicalAuthority === false,
};

const report = {
  schema: 'atlas.external-search-result-parity.v1',
  status: Object.values(checks).every(Boolean)
    ? 'SEARCH_RESULT_NORMALIZATION_PROVEN_NON_CANONICAL'
    : 'SEARCH_RESULT_NORMALIZATION_NOT_PROVEN',
  query,
  queryChecksum,
  limits: { requested: limit, searxng: searxngResults.length, go: goResults.length },
  providers: {
    searxng: {
      endpoint: searxngUrl.toString(),
      httpStatus: searxng.status,
      rawResultFields: searxngResults[0] ? Object.keys(searxngResults[0]).sort() : [],
      normalizedResults: commonSearxng,
      role: 'discovery_only',
    },
    goRetrieval: {
      endpoint: goUrl.toString(),
      httpStatus: go.status,
      lane: go.json?.lane ?? null,
      scoreType: go.json?.score_type ?? null,
      normalizedResults: commonGo,
      role: 'read_only_postgres_fts_executor',
      readOnly: go.json?.read_only ?? null,
      canonicalAuthority: go.json?.capability?.canonicalAuthority ?? null,
    },
  },
  checks,
  interpretation: {
    commonEphemeralEnvelope: 'source + sourceRef + title + snippet + rank',
    identityPolicy: 'SearXNG URL refs and Go source refs remain provider-specific; no cross-provider identity is inferred',
    fusionOwner: 'SearchRuntime',
    canonicalAdmission: false,
  },
  writes: {
    postgres: false,
    qdrant: false,
    neo4j: false,
    valkey: false,
    couchdb: false,
    models: false,
  },
  gaps: [
    'SearXNG discovery results are not source-revision-bound documents',
    'Go Retrieval and SearXNG do not share candidate identity or ranking semantics',
    'No external-document Postgres admission or projection readback was attempted',
  ],
  generatedAt: new Date().toISOString(),
};

await mkdir(new URL('../reports/', REPORT_PATH), { recursive: true });
await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  report: REPORT_PATH.pathname,
  status: report.status,
  checks,
  writesPerformed: false,
}, null, 2));
