#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inputPaths = {
  xbergParser: '.tmp/atlas/svelte-language-pack-120-sidecar-parity-20261027-v2.json',
  xbergCohort: '.tmp/atlas/treesitter-chunker-v6-svelte5-parity-20261027-v1.json',
  officialSvelteParser: '.tmp/atlas/sveltejs-official-tree-sitter-cohort-parity-20261027-v1.json',
};

function readReceipt(relativePath) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  return {
    value: JSON.parse(bytes.toString('utf8')),
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeSha256(value) {
  return String(value ?? '').replace(/^sha256:/i, '').toLowerCase();
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const xbergParserReceipt = readReceipt(inputPaths.xbergParser);
const xbergCohortReceipt = readReceipt(inputPaths.xbergCohort);
const officialReceipt = readReceipt(inputPaths.officialSvelteParser);
const xbergRows = new Map(xbergParserReceipt.value.results.map((row) => [row.id, row]));
const xbergSources = new Map(xbergCohortReceipt.value.files.map((row) => [row.sourceRef, row]));
const officialRows = officialReceipt.value.cohort.results;

if (officialRows.length !== 10 || xbergRows.size < 10) throw new Error('EXPECTED_FROZEN_TEN_FILE_COHORT');

const files = officialRows.map((official) => {
  const xberg = xbergRows.get(official.path);
  const xbergSource = xbergSources.get(official.path);
  if (!xberg || !xbergSource) throw new Error(`COHORT_MEMBER_MISSING:${official.path}`);
  const sameFrozenSource = normalizeSha256(official.sourceSha256) === normalizeSha256(xbergSource.sourceSha256)
    && xberg.sha256Matches === true
    && xberg.byteLengthMatches === true;
  if (!sameFrozenSource) throw new Error(`FROZEN_SOURCE_DIGEST_MISMATCH:${official.path}`);
  let currentDigestMatches = false;
  try {
    currentDigestMatches = digest(fs.readFileSync(path.join(repoRoot, official.path))) === normalizeSha256(official.sourceSha256);
  } catch {}
  return {
    sourceRef: official.path,
    frozenSourceSha256: official.sourceSha256,
    frozenSourceBytes: xbergSource.sourceBytes,
    sameFrozenSourceAcrossReceipts: sameFrozenSource,
    currentWorktreeStillMatchesFrozenSource: currentDigestMatches,
    xbergLanguagePack120: {
      compilerTargets: xberg.compilerTargets,
      exactSpanMatches: xberg.exactSpanMatches,
      parserHasError: xberg.parserHasError,
      errorCount: xberg.errorCount,
      utf8SpanFailures: xberg.utf8SpanFailures,
      compilerOnly: xberg.compilerOnly,
    },
    sveltejsOfficialGrammar: {
      compilerTargets: official.compilerSpanCount,
      exactSpanMatches: official.exactSpanCount,
      parserErrorFile: officialReceipt.value.cohort.parserErrorFiles.includes(official.path),
      compilerOnly: official.compilerOnly,
      cstOnly: official.cstOnly,
    },
  };
});

const sum = (list, select) => list.reduce((total, item) => total + select(item), 0);
const xbergExact = sum(files, (row) => row.xbergLanguagePack120.exactSpanMatches);
const xbergTargets = sum(files, (row) => row.xbergLanguagePack120.compilerTargets);
const xbergErrors = sum(files, (row) => row.xbergLanguagePack120.errorCount);
const xbergUtf8Failures = sum(files, (row) => row.xbergLanguagePack120.utf8SpanFailures);
const officialExact = sum(files, (row) => row.sveltejsOfficialGrammar.exactSpanMatches);
const officialTargets = sum(files, (row) => row.sveltejsOfficialGrammar.compilerTargets);
const currentSourceMatches = files.filter((row) => row.currentWorktreeStillMatchesFrozenSource).length;
const officialRender = officialReceipt.value.specificFinding;
const cohortDigest = digest(canonicalJson(files.map(({ sourceRef, frozenSourceSha256, frozenSourceBytes }) => ({ sourceRef, frozenSourceSha256, frozenSourceBytes }))));

const body = {
  schema: 'atlas.svelte-maintained-vs-xberg-grammar-comparison.v1',
  generatedAtUtc: new Date().toISOString(),
  comparisonMode: 'READ_ONLY_COMPARISON_OF_EXISTING_CHECKSUMMED_RECEIPTS',
  supersedesReceipt: {
    path: '.tmp/atlas/svelte-maintained-vs-xberg-grammar-comparison-20261028T032406690Z-v1.json',
    sha256: 'sha256:3795b9e8bc44f443de535f14d7f8ecd2e8b8d4b3b681cced3fc91ba118e4175c',
    reason: 'comparison wrapper referenced the render compilerSpanMatches field at the wrong nesting level',
  },
  frozenCohort: {
    fileCount: files.length,
    sourceDigestCohortSha256: `sha256:${cohortDigest}`,
    sameFrozenSourceAcrossReceipts: files.every((row) => row.sameFrozenSourceAcrossReceipts),
    currentWorktreeMatchesFrozenSourceCount: currentSourceMatches,
    files,
  },
  parserRunsPerformed: false,
  parserResults: {
    xbergLanguagePack120: {
      versions: xbergParserReceipt.value.stack,
      grammarIdentityRecorded: xbergParserReceipt.value.stack.grammar,
      exactSpanMatches: xbergExact,
      compilerTargets: xbergTargets,
      parserErrorFiles: xbergParserReceipt.value.failedParserFiles,
      parserErrorCount: xbergErrors,
      utf8SpanFailures: xbergUtf8Failures,
      newlineFixtures: xbergParserReceipt.value.fixtureResults.map((row) => ({ id: row.id, exact: row.exact, targets: row.compilerTargets, errors: row.errors, byteEquality: row.bytesEqual })),
      renderTagForCommandCenter: 'NOT_RECOVERED_IN_PRIOR_RECEIPT; one compiler-only target and a parser error are recorded',
    },
    sveltejsOfficial: {
      repository: officialReceipt.value.grammar.repository,
      commit: officialReceipt.value.grammar.commit,
      metadataVersion: officialReceipt.value.grammar.metadataVersion,
      state: officialReceipt.value.grammar.status,
      ownCorpusTests: officialReceipt.value.officialGrammarTests,
      exactSpanMatches: officialExact,
      compilerTargets: officialTargets,
      parserErrorFiles: officialReceipt.value.cohort.parserErrorFiles,
      deterministicReplay: officialReceipt.value.cohort.deterministicReplay,
      replayDigests: officialReceipt.value.cohort.replayDigests,
      commandCenterRenderTag: officialRender,
      perSpanOriginalByteSliceValidation: 'NOT_RECORDED_AS_A_COHORT_TOTAL_IN_INPUT_RECEIPT',
      newlineFixtures: 'NOT_PRESENT_IN_INPUT_RECEIPT',
    },
  },
  acceptance: {
    exactSpanFloor: { required: 202, officialActual: officialExact, passed: officialExact >= 202 },
    zeroParserErrors: { officialActual: officialReceipt.value.cohort.parserErrorFiles.length, passed: officialReceipt.value.cohort.parserErrorFiles.length === 0 },
    commandCenterRenderRecovered: { passed: officialRender?.compilerSpanMatches === true, evidence: officialRender ?? null },
    unicodeAndNewlineByteFixtureProof: { passed: false, reason: 'official grammar cohort receipt lacks dedicated newline-fixture and complete raw-byte-slice tallies' },
    integrationReady: false,
    verdict: 'NOT_READY_OFFICIAL_GRAMMAR_BELOW_EXACT_SPAN_FLOOR_AND_FIXTURE_BYTE_PROOF_INCOMPLETE',
  },
  limitations: [
    'The Xberg stack receipt does not record the Svelte grammar identity (grammar is null); its 202/203 score is a numeric historical baseline, not a provenance-qualified competing grammar claim.',
    'The official grammar result has 12 else-if extent disagreements; the compiler AST remains the template extent authority.',
    'All ten current worktree files differ from the frozen source hashes if the current source-match count is zero; this receipt compares the identical historical frozen cohort only.',
    'No parser was rerun to create this aggregate receipt; the input receipts contain the parser-run evidence.',
  ],
  inputs: Object.fromEntries(Object.entries({ xbergParser: xbergParserReceipt, xbergCohort: xbergCohortReceipt, officialSvelteParser: officialReceipt }).map(([name, receipt]) => [name, { path: inputPaths[name], sha256: `sha256:${receipt.sha256}` }])),
  productionServicesChanged: false,
  dependenciesChanged: false,
  graphifyRun: false,
  canonicalDatastoreWrites: false,
  canonicalAuthority: false,
  writesPerformed: false,
};

if (currentSourceMatches !== 0) body.limitations[2] = `Current worktree matches ${currentSourceMatches}/${files.length} frozen source hashes; the receipt still compares source-identical historical inputs.`;
body.contentSha256 = `sha256:${digest(canonicalJson(body))}`;
const stamp = new Date().toISOString().replace(/[-:.]/g, '');
const outputPath = `.tmp/atlas/svelte-maintained-vs-xberg-grammar-comparison-${stamp}-v2.json`;
const outputFile = path.join(repoRoot, outputPath);
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(body, null, 2)}\n`, { flag: 'wx' });
const outputSha256 = digest(fs.readFileSync(outputFile));
process.stdout.write(`${JSON.stringify({ receiptPath: outputPath, receiptSha256: `sha256:${outputSha256}`, xbergExact: `${xbergExact}/${xbergTargets}`, officialExact: `${officialExact}/${officialTargets}`, officialErrors: officialReceipt.value.cohort.parserErrorFiles.length, currentSourceMatches: `${currentSourceMatches}/${files.length}`, verdict: body.acceptance.verdict }, null, 2)}\n`);
