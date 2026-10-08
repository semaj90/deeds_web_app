#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const relativeSources = [
  'python/oak_agent/structured_contracts_v1.py',
  'python/tests/test_oak_agent_structured_contracts_v1.py',
  'python/requirements-oak-agent.txt',
  'scripts/atlas/prove-oak-agent-structured-contracts-v1.mjs',
];
const pythonCandidates = [
  process.env.ATLAS_OAK_AGENT_PYTHON,
  path.join(root, '.venv', 'Scripts', 'python.exe'),
  path.join(root, '.venv', 'bin', 'python'),
  'python',
].filter(Boolean);
const pythonExecutable = pythonCandidates.find((candidate) => (
  candidate === 'python' || fs.existsSync(candidate)
));
if (!pythonExecutable) throw new Error('OAK_AGENT_PYTHON_NOT_FOUND; set ATLAS_OAK_AGENT_PYTHON or reuse an existing environment');

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function checksum(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex')}`;
}

const result = spawnSync(
  pythonExecutable,
  ['-m', 'unittest', 'python.tests.test_oak_agent_structured_contracts_v1', '-v'],
  { cwd: root, encoding: 'utf8', timeout: 120000, windowsHide: true },
);
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
const testsRun = Number(/Ran (\d+) tests?/.exec(output)?.[1] ?? 0);
const sourceDigests = Object.fromEntries(relativeSources.map((relativePath) => {
  const bytes = fs.readFileSync(path.join(root, relativePath));
  return [relativePath, `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`];
}));
const canonicalPayload = {
  schema: 'atlas.oak-agent-contract-proof.v1',
  mode: 'ISOLATED_PYTHON_FIXTURE_ONLY',
  status: result.status === 0 && testsRun > 0 ? 'CONTRACT_TESTS_PASSED' : 'CONTRACT_TESTS_FAILED',
  producerRevision: sourceDigests['scripts/atlas/prove-oak-agent-structured-contracts-v1.mjs'] ?? null,
  pythonExecutable,
  command: ['-m', 'unittest', 'python.tests.test_oak_agent_structured_contracts_v1', '-v'],
  exitCode: result.status,
  testsRun,
  sourceDigests,
  inputChecksum: checksum({ testId: 'OaKStructuredContractsV1Tests', sourceDigests }),
  outputChecksum: `sha256:${crypto.createHash('sha256').update(output, 'utf8').digest('hex')}`,
  evidenceRefs: relativeSources,
  workspaceRevision: null,
  workspaceUnavailableReason: 'FIXTURE_ONLY_NO_ADMITTED_WORKSPACE',
  graphRevision: null,
  graphUnavailableReason: 'NO_ADMITTED_STRUCTURAL_GRAPH',
  aceProjection: {
    status: 'NOT_CONNECTED',
    packetPayloadRef: null,
    reason: 'CONTRACT_FIXTURE_ONLY_NO_ADMITTED_CONTEXT_MANIFEST',
  },
  atlasPayloadProjection: {
    status: 'NOT_ATTEMPTED',
    packetKey: null,
    canonicalId: null,
    contextManifestChecksum: null,
    acePacketId: null,
    unavailableReason: 'CONTRACT_FIXTURE_HAS_NO_ADMITTED_ATLAS_FACTS',
  },
  workflowTopology: {
    coordinateSystem: 'stage_ordinal',
    nodes: [
      { nodeId: 'bounded_input_contract', stageOrdinal: 0 },
      { nodeId: 'allowlisted_oak_function_boundary', stageOrdinal: 1 },
      { nodeId: 'strict_result_contract', stageOrdinal: 2 },
      { nodeId: 'fixture_checksum_readback', stageOrdinal: 3 },
    ],
    edges: [
      ['bounded_input_contract', 'allowlisted_oak_function_boundary'],
      ['allowlisted_oak_function_boundary', 'strict_result_contract'],
      ['strict_result_contract', 'fixture_checksum_readback'],
    ],
  },
  canonicalAuthority: false,
  writesPerformed: false,
};
const receipt = {
  ...canonicalPayload,
  receiptChecksum: checksum(canonicalPayload),
};
const reportPath = path.join(root, '.tmp', 'atlas', 'oak-agent-structured-contracts-proof-v1.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
const readback = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const { receiptChecksum, ...readbackPayload } = readback;
const readbackMatches = receiptChecksum === checksum(readbackPayload);
process.stdout.write(output);
console.log(JSON.stringify({ status: receipt.status, testsRun, independentReadback: readbackMatches ? 'MATCH' : 'MISMATCH', receipt: path.relative(root, reportPath), writesPerformed: false }, null, 2));
if (result.status !== 0 || testsRun === 0 || !readbackMatches) process.exitCode = 1;
