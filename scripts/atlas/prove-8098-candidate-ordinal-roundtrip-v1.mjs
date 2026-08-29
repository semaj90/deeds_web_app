/** Read-only 8098 executor identity/parity proof. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const manifestPath = resolve(root, 'docs/reports/embedding-tile-artifacts/embedding-tiles-v1.manifest.json');
const artifactReceiptPath = resolve(root, 'docs/reports/embedding-tile-artifact-readback-v1.json');
const reportPath = resolve(root, 'docs/reports/8098-candidate-ordinal-roundtrip-v1.json');
const baseUrl = process.env.ATLAS_GPU_8098_URL ?? 'http://127.0.0.1:8098';
const artifactPath = 'docs/reports/embedding-tile-artifacts/embedding-tiles-v1.arrow';
const query = [1, ...Array(767).fill(0)];

const report = { schema: 'atlas.8098-candidate-ordinal-roundtrip.v1', readOnly: true, status: 'BLOCKED', request: { baseUrl, artifactPath, limit: 3 }, checks: {}, errors: [] };
try {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const readback = JSON.parse(readFileSync(artifactReceiptPath, 'utf8'));
  if (readback.status !== 'EMBEDDING_TILE_ARTIFACT_READBACK_PROVEN') throw new Error(`ARTIFACT_READBACK_NOT_PROVEN:${readback.status}`);
  const known = new Set();
  const { tableFromIPC } = await import('apache-arrow');
  const table = tableFromIPC(readFileSync(resolve(root, artifactPath)));
  const ordinals = table.getChild('candidate_ordinal');
  for (let i = 0; i < table.numRows; i += 1) known.add(Number(ordinals.get(i)));
  const request = { artifactPath, query, limit: 3 };
  const call = async (path) => { const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) }); if (!response.ok) throw new Error(`${path}:HTTP_${response.status}:${await response.text()}`); return response.json(); };
  const [pytorch, cuvs] = await Promise.all([call('/v1/tile-artifact/exact-scan'), call('/v1/tile-artifact/cuvs-exact-scan')]);
  const validate = (result, expectedBackend) => { if (result.status !== (expectedBackend === 'CUVS_BRUTE_FORCE' ? 'CUVS_EXACT_TILE_SCAN_PROVEN' : 'CUDA_EXACT_TILE_SCAN_PROVEN')) throw new Error(`EXECUTOR_STATUS:${expectedBackend}:${result.status}`); if (result.artifactChecksum !== manifest.artifactChecksum) throw new Error(`ARTIFACT_CHECKSUM_MISMATCH:${expectedBackend}`); if (result.canonicalAuthority !== false || result.logicalLaneVote !== 'NONE') throw new Error(`EXECUTOR_AUTHORITY_VIOLATION:${expectedBackend}`); const seen = new Set(); for (const row of result.rows) { if (!known.has(row.candidateOrdinal)) throw new Error(`UNKNOWN_CANDIDATE_ORDINAL:${expectedBackend}:${row.candidateOrdinal}`); if (seen.has(row.candidateOrdinal)) throw new Error(`DUPLICATE_CANDIDATE_ORDINAL:${expectedBackend}:${row.candidateOrdinal}`); seen.add(row.candidateOrdinal); } return [...seen]; };
  const pytorchOrdinals = validate(pytorch, 'PYTORCH_CUDA_EXACT_TILE_SCAN'); const cuvsOrdinals = validate(cuvs, 'CUVS_BRUTE_FORCE');
  report.checks = { artifactReadback: true, pytorchRoundTrip: true, cuvsRoundTrip: true, pytorchCuvsOrdinalParity: JSON.stringify(pytorchOrdinals) === JSON.stringify(cuvsOrdinals), noLogicalVote: true, canonicalWrites: false, artifactChecksum: pytorch.artifactChecksum };
  if (!report.checks.pytorchCuvsOrdinalParity) throw new Error('PYTORCH_CUVS_ORDINAL_PARITY_FAILED');
  report.results = { pytorch: pytorch.rows, cuvs: cuvs.rows, candidateOrdinalSet: pytorchOrdinals };
  report.status = '8098_CANDIDATE_ORDINAL_ROUNDTRIP_PROVEN';
} catch (error) { report.errors.push(String(error?.message ?? error)); }
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, checks: report.checks, errors: report.errors, reportPath }, null, 2));
if (report.status === 'BLOCKED') process.exitCode = 1;
