#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Bool, Int32, Table, Utf8, tableFromIPC, tableToIPC, vectorFromArray } from 'apache-arrow';
import { REPO_ROOT } from './connection-config.mjs';
import { scoreDirectoryAnalysisPriorityV1 } from './lib/directory-analysis-priority-v1.mjs';

const root = path.resolve(REPO_ROOT);
const arg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const runId = arg('--run-id') ?? '';
if (!/^analysis-priority-[a-z0-9-]{1,48}$/.test(runId)) throw new Error('RUN_ID_INVALID');
const sourceManifestPath = path.resolve(root, arg('--source-manifest') ?? '.tmp/atlas/directory-intelligence/whole-repo-20261022t201500z/manifest.json');
if (!sourceManifestPath.startsWith(`${root}${path.sep}`)) throw new Error('INPUT_OUTSIDE_REPOSITORY');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const readJson = (filePath) => JSON.parse(readFileSync(filePath, 'utf8'));
const inside = (parent, target) => target.startsWith(`${parent}${path.sep}`);
const inputManifest = readJson(sourceManifestPath);
if (inputManifest.schema !== 'atlas.directory-intelligence-path-snapshot.v1'
  || inputManifest.status !== 'DERIVED_ADVISORY_SNAPSHOT' || inputManifest.canonicalAuthority !== false
  || inputManifest.writesPerformed !== false || inputManifest.sourceEnumerationStatus !== 'COMPLETE') {
  throw new Error('SOURCE_MANIFEST_NOT_COMPLETE_READ_ONLY_SNAPSHOT');
}
if (inputManifest.receiptSha256) {
  const body = { ...inputManifest };
  delete body.receiptSha256;
  if (hash(Buffer.from(canonical(body))) !== inputManifest.receiptSha256) throw new Error('SOURCE_MANIFEST_CHECKSUM_INVALID');
}
const inputArtifactPath = path.resolve(root, inputManifest.artifactPath);
if (!inside(root, inputArtifactPath)) throw new Error('INPUT_ARTIFACT_OUTSIDE_REPOSITORY');
const inputBytes = readFileSync(inputArtifactPath);
if (hash(inputBytes) !== inputManifest.artifactSha256) throw new Error('INPUT_ARTIFACT_CHECKSUM_INVALID');
const input = tableFromIPC(inputBytes);
const requiredFields = ['ordinal','relativePath','entryKind','role','extension','dotPath','editPolicy','indexingStatus','mappedLanguageId','parserEligibility','graphifyMembership'];
for (const field of requiredFields) if (!input.schema.fields.some((item) => item.name === field)) throw new Error(`INPUT_FIELD_MISSING:${field}`);

const ordinals = [];
const scores = [];
const lanes = [];
const reasons = [];
const roles = [];
const parserEligibility = [];
const dotPaths = [];
const editPolicies = [];
const sourceAuthority = [];
const fileCountByLane = {};
const scoreHistogram = {};
const examples = [];
const utf8Compare = (left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right));
for (let index = 0; index < input.numRows; index += 1) {
  if (input.getChild('entryKind').get(index) !== 'FILE') continue;
  const row = Object.fromEntries(requiredFields.map((name) => [name, input.getChild(name).get(index)]));
  const scored = scoreDirectoryAnalysisPriorityV1(row);
  ordinals.push(row.ordinal);
  scores.push(scored.analysisPriorityScore);
  lanes.push(scored.analysisLane);
  reasons.push(scored.reasonCode);
  roles.push(row.role);
  parserEligibility.push(row.parserEligibility);
  dotPaths.push(row.dotPath);
  editPolicies.push(row.editPolicy);
  sourceAuthority.push(scored.sourceAuthority);
  fileCountByLane[scored.analysisLane] = (fileCountByLane[scored.analysisLane] ?? 0) + 1;
  scoreHistogram[scored.analysisPriorityScore] = (scoreHistogram[scored.analysisPriorityScore] ?? 0) + 1;
  if (examples.length < 200) examples.push({ relativePath: row.relativePath, ordinal: row.ordinal,
    analysisPriorityScore: scored.analysisPriorityScore, analysisLane: scored.analysisLane,
    reasonCode: scored.reasonCode, dotPath: row.dotPath });
}
if (ordinals.length === 0 || new Set(ordinals).size !== ordinals.length) throw new Error('FILE_ORDINALS_EMPTY_OR_DUPLICATE');
examples.sort((left, right) => utf8Compare(left.relativePath, right.relativePath));
const freeBefore = statfsSync(root).bavail * statfsSync(root).bsize;
if (freeBefore < inputBytes.length * 2) throw new Error('INSUFFICIENT_DISK_HEADROOM_FOR_ARTIFACT');

const outputParent = path.resolve(root, '.tmp/atlas/directory-intelligence/analysis-priority');
mkdirSync(outputParent, { recursive: true });
const outputDirectory = path.join(outputParent, runId);
mkdirSync(outputDirectory);
const outputPath = path.join(outputDirectory, 'file-analysis-priority.arrow');
const outputBytes = tableToIPC(new Table({
  ordinal: vectorFromArray(ordinals, new Int32()),
  analysisPriorityScore: vectorFromArray(scores, new Int32()),
  analysisLane: vectorFromArray(lanes, new Utf8()),
  reasonCode: vectorFromArray(reasons, new Utf8()),
  role: vectorFromArray(roles, new Utf8()),
  parserEligibility: vectorFromArray(parserEligibility, new Utf8()),
  dotPath: vectorFromArray(dotPaths, new Bool()),
  editPolicy: vectorFromArray(editPolicies, new Utf8()),
  sourceAuthority: vectorFromArray(sourceAuthority, new Utf8()),
}), 'file');
writeFileSync(outputPath, outputBytes, { flag: 'wx' });
const examplePath = path.join(outputDirectory, 'analysis-priority-samples.json');
writeFileSync(examplePath, `${JSON.stringify(examples, null, 2)}\n`, { flag: 'wx' });
const manifestBody = {
  schema: 'atlas.directory-analysis-priority-manifest.v1',
  runId,
  status: 'DERIVED_ADVISORY_PATH_METADATA_ONLY',
  canonicalAuthority: false,
  writesPerformed: false,
  sourceManifestPath: path.relative(root, sourceManifestPath).replaceAll('\\', '/'),
  sourceManifestReceiptSha256: inputManifest.receiptSha256,
  sourceArtifactPath: path.relative(root, inputArtifactPath).replaceAll('\\', '/'),
  sourceArtifactSha256: inputManifest.artifactSha256,
  sourceEnumerationStatus: inputManifest.sourceEnumerationStatus,
  sourceWorkspaceRevision: inputManifest.sourceWorkspaceRevision,
  graphifyQualification: inputManifest.graphifyQualification,
  rowCount: ordinals.length,
  rowCoverage: 'ONE_ROW_PER_FILE_ENTRY_IN_SOURCE_PATH_SNAPSHOT; DIRECTORIES_NOT_SCORED',
  scoreSemantics: 'RULE_BASED_ANALYSIS_PRIORITY_NOT_PROBABILITY_OR_RELEVANCE_JUDGMENT',
  sourceAuthority: 'UNQUALIFIED_PATH_METADATA_ONLY',
  sourceQualifiedCount: 0,
  editAllowedCount: 0,
  scoreHistogram,
  fileCountByLane,
  artifacts: {
    fileAnalysisPriority: { path: path.relative(root, outputPath).replaceAll('\\', '/'), bytes: outputBytes.length, sha256: hash(outputBytes) },
    inputOrderSamples: { path: path.relative(root, examplePath).replaceAll('\\', '/'), bytes: Buffer.byteLength(JSON.stringify(examples, null, 2) + '\n'), sha256: hash(Buffer.from(JSON.stringify(examples, null, 2) + '\n')) },
  },
  rules: {
    WORKTREE_PROFILE_CANDIDATE: 82,
    WORKTREE_AUDIT_ONLY: 54,
    WORKTREE_NOT_PARSER_INPUT: 38,
    REPOSITORY_METADATA: 48,
    DEPENDENCY_TREE: 34,
    GENERATED_OR_BUILD_ARTIFACT: 28,
    MODEL_OR_BINARY_ARTIFACT: 20,
    VIRTUAL_ENVIRONMENT: 12,
    CACHE_OR_TEMP: 8,
    OTHER: 18,
  },
  inputOrderSamples: examples.slice(0, 50),
};
const manifest = { ...manifestBody, receiptSha256: hash(Buffer.from(canonical(manifestBody))) };
const manifestPath = path.join(outputDirectory, 'manifest.json');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
const freeAfter = statfsSync(root).bavail * statfsSync(root).bsize;
console.log(JSON.stringify({ runId, fileRows: ordinals.length, bytesWritten: outputBytes.length,
  freeBytesBefore: freeBefore, freeBytesAfter: freeAfter, laneCounts: fileCountByLane,
  receiptChecksum: manifest.receiptSha256, manifestPath: path.relative(root, manifestPath).replaceAll('\\', '/') }));
