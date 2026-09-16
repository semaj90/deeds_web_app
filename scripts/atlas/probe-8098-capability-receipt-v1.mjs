/** Read-only capability receipt for the Parent Atlas 8098 executor. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const baseUrl = process.env.ATLAS_GPU_8098_URL ?? 'http://127.0.0.1:8098';
const reportPath = resolve(root, 'docs/reports/candidate-feature-gpu-capability-live-20260912.json');
const report = {
  schema: 'atlas.8098-capability-receipt.v1',
  readOnly: true,
  baseUrl,
  status: 'BLOCKED',
  checks: {},
  errors: [],
};

const getJson = async (path) => {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) throw new Error(`${path}_HTTP_${response.status}`);
  return response.json();
};

try {
  const [health, capabilities] = await Promise.all([
    getJson('/health'),
    getJson('/v1/graph/capabilities'),
  ]);
  report.health = health;
  report.capabilities = capabilities;
  report.checks = {
    healthOk: health.ok === true,
    executionOnly: health.executionOnly === true,
    cudaAvailable: health.cudaAvailable === true,
    graphAvailable: capabilities.available === true,
    backendPresent: typeof capabilities.backend === 'string' && capabilities.backend.length > 0,
    backendVersionPresent: typeof capabilities.backendVersion === 'string' && capabilities.backendVersion.length > 0,
    algorithmRevisionPresent: typeof capabilities.algorithmRevision === 'string' && capabilities.algorithmRevision.length > 0,
    writesFalse: Object.values(health.writes ?? {}).every((value) => value === false),
  };
  if (!Object.values(report.checks).every(Boolean)) throw new Error('CAPABILITY_RECEIPT_CHECK_FAILED');
  report.status = '8098_CAPABILITY_RECEIPT_PROVEN';
} catch (error) {
  report.errors.push(String(error?.message ?? error));
}

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, checks: report.checks, errors: report.errors, reportPath }, null, 2));
if (report.status === 'BLOCKED') process.exitCode = 1;
