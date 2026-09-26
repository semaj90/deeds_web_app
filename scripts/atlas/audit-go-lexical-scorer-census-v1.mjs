#!/usr/bin/env node
/**
 * Read-only source census for the Go Retrieval lexical scorer.
 *
 * This intentionally does not call the service or database. It prevents the
 * historical /search/bm25 route name from being mistaken for an Okapi BM25
 * implementation until corpus statistics and frozen-corpus evidence exist.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'services', 'go-retrieval-service', 'main.go');
const reportPath = path.join(root, 'docs', 'reports', 'go-lexical-scorer-census-v1.json');
const source = fs.readFileSync(sourcePath, 'utf8');

const lineOf = (needle) => {
  const index = source.indexOf(needle);
  return index < 0 ? null : source.slice(0, index).split(/\r?\n/).length;
};
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const has = (pattern) => pattern.test(source);

const checks = {
  historicalBm25Route: { present: has(/httpSearchBM25/), line: lineOf('func (s *retrievalServer) httpSearchBM25') },
  postgresCoverDensityRank: { present: has(/ts_rank_cd\s*\(/), line: lineOf('ts_rank_cd(') },
  websearchEnglishConfig: { present: has(/websearch_to_tsquery\('english'/), line: lineOf("websearch_to_tsquery('english'") },
  explicitScoreType: { present: has(/PG_TS_RANK_CD/), line: lineOf('PG_TS_RANK_CD') },
  explicitTrueBm25False: { present: has(/trueBm25['\"]?\s*:\s*false/), line: lineOf('trueBm25') },
  termStatisticsInGoOwner: { present: has(/\b(ts_stat|document_frequency|term_frequency|idf|inverse_document_frequency)\b/i), line: null },
  documentLengthNormalizationInGoOwner: { present: has(/document[-_ ]length|length normalization|avgdl|average document length/i), line: null },
  frozenCorpusStatisticsInGoOwner: { present: has(/frozen corpus|corpus statistics|corpus_stat|corpus revision/i), line: null },
};

const body = {
  schema: 'atlas.go-lexical-scorer-census.v1',
  status: 'GO_POSTGRES_FTS_SCORER_CENSUS_PROVEN_NOT_BM25',
  generatedAt: new Date().toISOString(),
  source: 'services/go-retrieval-service/main.go',
  sourceChecksum: sha256(source),
  scorer: {
    owner: 'GO_RETRIEVAL',
    route: '/search/bm25',
    logicalLane: 'lexical',
    implementation: 'PostgreSQL ts_rank_cd(search_vector, websearch_to_tsquery(english))',
    scoreType: 'PG_TS_RANK_CD',
    scorerRevision: 'postgres-18-ts-rank-cd-v1',
    trueBm25: false,
  },
  checks,
  bm25Admission: {
    eligible: false,
    missing: [
      'term statistics',
      'document frequency / IDF contract',
      'document-length normalization',
      'frozen corpus statistics',
      'deployed binary readback with scorer metadata',
    ],
  },
  evidence: {
    postgresStatsProbe: 'scripts/atlas/prove-query-lexical-stats-v1.mjs',
    postgresStatsReport: 'docs/reports/query-lexical-stats-v1.json',
    serviceUnitTests: 'services/go-retrieval-service/lexical_response_test.go',
  },
  readOnly: true,
  canonicalAuthority: false,
  writesPerformed: false,
  nextGate: 'GO-LEXICAL-SCORER-CENSUS-01',
};
body.reportChecksum = sha256(JSON.stringify(body));
fs.writeFileSync(reportPath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: body.status,
  scoreType: body.scorer.scoreType,
  trueBm25: body.scorer.trueBm25,
  bm25Eligible: body.bm25Admission.eligible,
  writesPerformed: body.writesPerformed,
  reportPath,
}, null, 2));
