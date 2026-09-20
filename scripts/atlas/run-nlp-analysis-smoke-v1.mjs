#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const tmpDir = path.join(root, '.tmp');
const outputPath = path.join(tmpDir, 'atlas-nlp-analysis-smoke-v1.json');
fs.mkdirSync(tmpDir, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 120_000 });
  return {
    command: [command, ...args].join(' '),
    exitCode: result.status,
    timedOut: result.error?.code === 'ETIMEDOUT',
    stdout: String(result.stdout ?? '').slice(-12_000),
    stderr: String(result.stderr ?? '').slice(-4_000),
    passed: result.status === 0
  };
}

const pythonTests = run('python', [
  '-m', 'pytest', '-q',
  'python/test_miniforge_nlp_sidecar_v2_multiline_crlf.py',
  'python/test_miniforge_nlp_sidecar_v2_declarator_kind.py',
  'python/test_miniforge_nlp_sidecar_v2_bytes.py',
  'python/test_atlas_doc_domain_classification.py'
]);
const ontology = run('python', ['scripts/atlas/prove-domain-ontology-admission-v1.py']);
const hmm = run('node', ['scripts/atlas/validate-hmm-agentic-error.mjs']);
const hmmTestSignal = run('node', ['scripts/atlas/validate-hmm-agentic-error.mjs', '--test-signal']);
const okfFixture = path.join(tmpDir, 'okf-beautifulsoup-fixture.json');
if (!fs.existsSync(okfFixture)) {
  const markdown = '# bounded smoke fixture\n';
  const crypto = await import('node:crypto');
  const digest = crypto.createHash('sha256').update(markdown, 'utf8').digest('hex');
  fs.writeFileSync(okfFixture, JSON.stringify({
    fetcher: 'fallback',
    url: 'https://example.invalid/smoke',
    resolved_url: 'https://example.invalid/smoke',
    title: 'bounded smoke fixture',
    markdown,
    raw_checksum: digest,
    normalized_checksum: digest,
    outgoing_urls: [],
    metadata: { parser: 'fixture', parserVersion: 'v1' },
    canonical_authority: false
  }, null, 2));
}
const okf = run('python', ['scripts/atlas/validate-okf-beautifulsoup-pydantic-v1.py', '--input', '.tmp/okf-beautifulsoup-fixture.json']);

const output = {
  schema: 'atlas.nlp-analysis-smoke.v1',
  status: pythonTests.passed && ontology.passed ? 'NLP_HELPERS_CONTRACT_PROVEN' : 'NLP_HELPERS_REVIEW_REQUIRED',
  ownership: {
    fastApiSidecar: 'python/miniforge_nlp_sidecar_v2.py',
    domainEnvelope: 'python/atlas_doc_domain_classification.py',
    naiveBayesOrLogistic: 'python/miniforge_nlp_sidecar.py and scripts/atlas/train-naive-bayes-packet-features.mjs',
    structuralEvidence: 'Tree-sitter/AST-grep through /ast/chunk',
    synthesisOwner: 'llama-server :8090 / Ornith; not this smoke'
  },
  checks: {
    pythonSidecarTests: pythonTests,
    ontologyAdmission: ontology,
    hmmAgenticError: {
      ...hmm,
      status: hmm.stdout.includes('HMM_TRANSITION_FIXTURE_PROVEN')
        ? 'TRANSITION_FIXTURE_PROVEN_FEATURE_GATES_PARTIAL'
        : hmm.passed ? 'REVIEW' : 'FAILED',
      transitionFixture: {
        status: hmm.stdout.includes('HMM_TRANSITION_FIXTURE_PROVEN')
          ? 'HMM_TRANSITION_FIXTURE_PROVEN'
          : 'HMM_TRANSITION_FIXTURE_REVIEW_REQUIRED',
        canonicalAuthority: false,
        promotionAuthorized: false,
        writesPerformed: false
      },
      testSignal: {
        ...hmmTestSignal,
        recoveryPacketPass: hmmTestSignal.stdout.includes('Status: ✅ PASS'),
        status: hmmTestSignal.stdout.includes('Status: ✅ PASS') ? 'FIXTURE_RECOVERY_PROVEN' : 'REVIEW_REQUIRED'
      }
    },
    okfPydanticFixture: { ...okf, status: okf.passed ? 'VALIDATED' : 'NOT_RUN_OR_REJECTED' }
  },
  downstream: {
    retrievalContext: 'NOT_WRITTEN',
    acePacket: 'NOT_CREATED_BY_THIS_SMOKE',
    modelState: 'NOT_PERSISTED',
    canonicalAuthority: false,
    promotionAuthorized: false,
    writesPerformed: false
  },
  learningLane: {
    status: 'SHADOW_ONLY_NOT_TRAINED',
    pytorchClassifier: 'DEFERRED_UNTIL_REVISION_QUALIFIED_LABELS',
    unsupervisedLearning: 'TODO_REQUIRES_FROZEN_FEATURE_SNAPSHOT',
    onlineWeightUpdates: false
  },
  nextSteps: [
    'Keep LangExtract/domain feature coverage as a separate evidence gate.',
    'Use the existing sidecar through its bounded API; do not create a duplicate FastAPI owner.',
    'Ground any topic/ontology tuple with source and evidence revisions before retrieval admission.',
    'Run agentic error-fixing only from an approved CompletionEnvelope and read-only smoke profile.'
  ]
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({
  schema: output.schema,
  status: output.status,
  pythonSidecarTests: pythonTests.passed,
  ontologyAdmission: ontology.passed,
  hmm: output.checks.hmmAgenticError.status,
  writesPerformed: false,
  output: path.relative(root, outputPath)
}, null, 2));
