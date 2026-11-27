#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildIndex } from './openspec-task-fts-index-v1.mjs';

const ROOT = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const METHOD = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/i;
const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const key = ({ method, route }) => `${method} ${route}`;

const PROSE_CASES = [
  ['show which language model is loaded', 'GET /api/llm/runtime-status'],
  ['where is context assembly job progress', 'GET /api/ace/status'],
  ['show whether visual inference is healthy', 'GET /api/vlm/status'],
  ['show suggested topics for this user', 'GET /api/recommendations'],
  ['list people being investigated', 'GET /api/persons-of-interest'],
  ['show reports belonging to the caller', 'GET /api/reports'],
  ['where does hybrid search return results', 'GET /api/search'],
  ['count errors grouped by route', 'GET /api/errors/summary'],
];
const QA_COMPARISON_CASES = [
  ['check the active inference model', 'GET /api/llm/runtime-status'],
  ['which runtime probe grouped HTTP_INTERNAL_ERROR when inference went down', 'GET /api/llm/runtime-status'],
  ['can I inspect an ingest job owned by somebody else', 'GET /api/ace/status'],
  ['where does the vision sidecar report its process identifier', 'GET /api/vlm/status'],
  ['show topic preferences from my recommendations cache', 'GET /api/recommendations'],
  ['show investigated people with a total count', 'GET /api/persons-of-interest'],
  ['list only reports authored by this account', 'GET /api/reports'],
  ['does a cached query record analytics for hybrid retrieval', 'GET /api/search'],
  ['sum repeated incident counts by URL', 'GET /api/errors/summary'],
  ['which handler gives the private listing and ownership filter for reports', 'GET /api/reports'],
];
const NEGATIVE_CASES = [
  'GET /api/llm/runtime-status-extra', 'POST /api/reports', 'GET',
  'GET /api/ace/status?jobId=fixture', 'fermentation brewer yeast',
];

export function verifyFrozenSymbolSource(row, bytes) {
  if (!SHA256.test(row.sourceSha256) || digest(bytes) !== row.sourceSha256) {
    throw new Error('FROZEN_SYMBOL_SOURCE_DRIFT');
  }
  if (!Number.isSafeInteger(row.startByte) || !Number.isSafeInteger(row.endByte)
      || row.startByte < 0 || row.endByte <= row.startByte || row.endByte > bytes.length) {
    throw new Error('FROZEN_SYMBOL_SPAN_INVALID');
  }
  const span = bytes.subarray(row.startByte, row.endByte);
  new TextDecoder('utf-8', { fatal: true }).decode(span);
  if (!SHA256.test(row.spanSha256) || digest(span) !== row.spanSha256) throw new Error('FROZEN_SYMBOL_SPAN_DRIFT');
}

function measure(cases, field) {
  const expected = cases.filter(({ expectedId }) => expectedId !== null);
  const rank = (item) => item[field].indexOf(item.expectedId) + 1;
  return {
    positiveQueries: expected.length,
    hitsAt1: expected.filter((item) => rank(item) === 1).length,
    hitsAt3: expected.filter((item) => rank(item) > 0 && rank(item) <= 3).length,
    mrrAt3: Number((expected.reduce((sum, item) => sum + (rank(item) ? 1 / rank(item) : 0), 0) / (expected.length || 1)).toFixed(4)),
    negativeQueriesWithHits: cases.filter((item) => item.expectedId === null && item[field].length > 0).length,
  };
}

export function evaluateLookup(symbols, { qaTerms = null } = {}) {
  const ids = new Set(symbols.map(key));
  if (ids.size !== symbols.length) throw new Error('DUPLICATE_FROZEN_SYMBOL_ID');
  const proseCases = qaTerms ? QA_COMPARISON_CASES : PROSE_CASES;
  for (const [, expectedId] of proseCases) {
    if (!ids.has(expectedId)) throw new Error(`EVAL_TARGET_MISSING:${expectedId}`);
  }
  const documents = symbols.map((row) => ({
    id: key(row),
    text: [row.method, row.route, row.featureLabel, row.file, row.languageId].join(' '),
  }));
  const lexical = buildIndex(documents);
  const enriched = qaTerms ? buildIndex(documents.map(({ id, text }) => ({
    id, text: [text, ...(qaTerms.get(id) ?? [])].join(' '),
  }))) : null;
  const cases = [
    ...symbols.map((row) => ({ query: key(row), expectedId: key(row), kind: 'EXACT' })),
    ...proseCases.map(([query, expectedId]) => ({ query, expectedId, kind: 'PROSE' })),
    ...NEGATIVE_CASES.map((query) => ({ query, expectedId: null, kind: 'NEGATIVE' })),
  ].map(({ query, expectedId, kind }) => {
    const exact = ids.has(query) ? [query] : [];
    const lexicalTop3 = lexical.search(query, 3).map(({ id }) => id);
    const structured = METHOD.test(query) || /^(?:[a-z]+\s+)?\//i.test(query);
    const exactThenLexical = structured ? exact : lexicalTop3;
    const exactThenQaLexical = enriched && (structured ? exact : enriched.search(query, 3).map(({ id }) => id));
    return { query, expectedId, kind, exact, lexicalTop3, exactThenLexical,
      ...(enriched ? { exactThenQaLexical } : {}) };
  });
  const fields = ['exact', 'lexicalTop3', 'exactThenLexical'];
  if (enriched) fields.push('exactThenQaLexical');
  return {
    index: lexical.stats(),
    ...(enriched ? { qaIndex: enriched.stats() } : {}),
    byQueryKind: Object.fromEntries(['EXACT', 'PROSE', 'NEGATIVE'].map((kind) => [kind,
      Object.fromEntries(fields.map((field) => [field, measure(cases.filter((row) => row.kind === kind), field)])),
    ])),
    cases,
  };
}

const FIXTURE_SPEC = 'sveltekit-frontend/tests/lane-contracts/qa-feature-route-cohort.spec.ts';

export function readQaFixtureTerms(symbols, result, specText) {
  if (result.success !== true || result.testResults?.length !== 1) throw new Error('QA_FIXTURE_RUN_NOT_PASSING');
  const [testFile] = result.testResults;
  if (!path.isAbsolute(testFile.name) || realpathSync(testFile.name) !== realpathSync(path.join(ROOT, FIXTURE_SPEC))) {
    throw new Error('QA_FIXTURE_REPORT_FILE_MISMATCH');
  }
  const fixtures = symbols.filter(({ role }) => role === 'FIXTURE_ROUTE');
  const routesByLabel = new Map(fixtures.map((row) => [row.featureLabel, key(row)]));
  if (routesByLabel.size !== fixtures.length) throw new Error('QA_FIXTURE_LABEL_AMBIGUOUS');
  const qaTerms = new Map();
  const accepted = [];
  for (const assertion of testFile.assertionResults ?? []) {
    if (assertion.status !== 'passed') throw new Error('QA_FIXTURE_ASSERTION_NOT_PASSING');
    const title = assertion.title;
    const match = /^@feature:([\w.]+) ([^\n]+)$/.exec(title);
    if (!match || !routesByLabel.has(match[1]) || !specText.includes(`it('${title}',`)) continue;
    const route = routesByLabel.get(match[1]);
    const terms = qaTerms.get(route) ?? [];
    terms.push(match[2]);
    qaTerms.set(route, terms);
    accepted.push({ route, assertion: title });
  }
  if (qaTerms.size !== fixtures.length) throw new Error('QA_FIXTURE_ROUTE_COVERAGE_INCOMPLETE');
  return { qaTerms, accepted };
}

function run(input, qaReport, fixtureSha256) {
  const directory = realpathSync(input);
  const scratch = realpathSync(path.join(ROOT, '.tmp'));
  const relative = path.relative(scratch, directory);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('CORPUS_OUTSIDE_SCRATCH');
  const receipt = JSON.parse(readFileSync(path.join(directory, 'receipt.json'), 'utf8'));
  const bytes = readFileSync(path.join(directory, 'symbols.json'));
  if (digest(bytes) !== receipt.symbolCorpusSha256) throw new Error('FROZEN_SYMBOL_CORPUS_DRIFT');
  const corpus = JSON.parse(bytes);
  if (corpus.schema !== 'atlas.frozen-symbol-corpus.v1' || corpus.canonicalAuthority !== false
      || corpus.trainingEligible !== false || !Array.isArray(corpus.symbols) || corpus.symbols.length > 64) {
    throw new Error('FROZEN_SYMBOL_CORPUS_INVALID');
  }
  for (const row of corpus.symbols) {
    const source = realpathSync(path.resolve(ROOT, row.file));
    const sourceRelative = path.relative(path.join(ROOT, 'sveltekit-frontend', 'src', 'routes'), source);
    if (!sourceRelative || sourceRelative.startsWith('..') || path.isAbsolute(sourceRelative)) throw new Error('SYMBOL_SOURCE_SCOPE_INVALID');
    verifyFrozenSymbolSource(row, readFileSync(source));
  }
  let qa;
  if (qaReport) {
    const spec = readFileSync(path.join(ROOT, FIXTURE_SPEC));
    if (!SHA256.test(fixtureSha256 ?? '') || digest(spec) !== fixtureSha256) throw new Error('QA_FIXTURE_BYTES_DRIFT');
    const reportPath = realpathSync(qaReport);
    const reportRelative = path.relative(scratch, reportPath);
    if (!reportRelative || reportRelative.startsWith('..') || path.isAbsolute(reportRelative)) throw new Error('QA_REPORT_OUTSIDE_SCRATCH');
    const reportBytes = readFileSync(reportPath);
    const { qaTerms, accepted } = readQaFixtureTerms(corpus.symbols, JSON.parse(reportBytes), spec.toString('utf8'));
    qa = { qaTerms, evidence: { fixture: FIXTURE_SPEC, fixtureSha256, reportSha256: digest(reportBytes), assertions: accepted } };
  }
  const evaluation = evaluateLookup(corpus.symbols, { qaTerms: qa?.qaTerms });
  return {
    schema: 'atlas.frozen-qa-symbol-lookup-evaluation.v1',
    status: 'PROPOSAL_ONLY', scope: 'Ten local AST symbols and hand-authored known-item queries',
    gitHeadAtFreeze: receipt.gitHead, corpusSha256: receipt.symbolCorpusSha256, sourceByteChecks: corpus.symbols.length,
    canonicalAuthority: false, trainingEligible: false, writesPerformed: false,
    ...(qa ? { qaFixtureEvidence: qa.evidence } : {}),
    ...evaluation,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { corpus: { type: 'string' }, 'qa-report': { type: 'string' }, 'qa-fixture-sha256': { type: 'string' } } });
  if (!values.corpus) throw new Error('CORPUS_ARGUMENT_REQUIRED');
  if (Boolean(values['qa-report']) !== Boolean(values['qa-fixture-sha256'])) throw new Error('QA_REPORT_AND_FIXTURE_HASH_REQUIRED_TOGETHER');
  process.stdout.write(`${JSON.stringify(run(values.corpus, values['qa-report'], values['qa-fixture-sha256']), null, 2)}\n`);
}
