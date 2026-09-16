import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const reportPath = resolve(root, 'docs/reports/unified-residency-stdio-handoff-v1.json');
const pythonRoot = '/mnt/c/Users/james/Videos/deeds-web-app/sveltekit-frontend/python';
const python = '/home/james/.venvs/atlas-cutile-cu132/bin/python';

async function readValuesFromDuckDb() {
  const duckdbModule = await import('duckdb');
  const Database = duckdbModule.default?.Database ?? duckdbModule.Database;
  if (!Database) throw new Error('DUCKDB_DATABASE_CLASS_UNAVAILABLE');
  const database = new Database(':memory:');
  const connection = database.connect();
  try {
    const rows = await new Promise((resolveRows, rejectRows) => {
      connection.all(
        'SELECT * FROM (VALUES (0.25, 0.5, 0.75, 1.0), (1.25, 1.5, 1.75, 2.0)) AS t(f0, f1, f2, f3)',
        (error, result) => error ? rejectRows(error) : resolveRows(result),
      );
    });
    return rows.flatMap((row) => [row.f0, row.f1, row.f2, row.f3]);
  } finally {
    connection.close();
    database.close();
  }
}

function frame(descriptor, values) {
  const control = Buffer.from(JSON.stringify(descriptor), 'utf8');
  const numeric = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => numeric.writeFloatLE(value, index * 4));
  const controlLength = Buffer.alloc(4);
  controlLength.writeUInt32BE(control.length, 0);
  const numericLength = Buffer.alloc(8);
  numericLength.writeBigUInt64BE(BigInt(numeric.length), 0);
  return Buffer.concat([controlLength, control, numericLength, numeric]);
}

function run(input) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn('wsl.exe', [
      '-d', 'Ubuntu', '--', 'bash', '-lc',
      `cd ${pythonRoot} && ATLAS_UNIFIED_RESIDENCY_DEVICE=cuda PYTHONPATH=. ${python} -m parent_atlas_tensor.unified_residency_stdio`,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', rejectRun);
    child.on('close', (code) => resolveRun({ code, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) }));
    child.stdin.end(input);
  });
}

const descriptor = {
  schema: 'atlas.unified-residency.v1',
  residencyKey: 'atlas:residency:stdio:host-fixture',
  kind: 'FEATURE_TILE',
  workspaceRevision: 'workspace:stdio-host-fixture-v1',
  sourceRevision: 'source:stdio-host-fixture-v1',
  representationRevision: 'representation:feature-tile-v1',
  featureRevision: 'feature:stdio-host-fixture-v1',
  modelRevision: 'model:feature-head-v1',
  tokenizerRevision: 'tokenizer:fixture-v1',
  ropeRevision: 'rope:fixture-v1',
  candidateOrdinal: 0,
  artifactChecksum: 'sha256:stdio-host-fixture-v1',
  shape: [2, 4],
  dtype: 'float32',
  byteLength: 32,
  state: 'EMPTY',
};
const values = await readValuesFromDuckDb();
const result = await run(frame(descriptor, values));
let receipt = null;
let error = null;
try { receipt = JSON.parse(result.stdout.toString('utf8').trim()); } catch (cause) { error = String(cause); }

const report = {
  schema: 'atlas.unified-residency-stdio-handoff.v1',
  status: result.code === 0 && receipt?.state === 'RESIDENT' && receipt?.rawPointerExposed === false
    ? 'HOST_TO_WSL_PROVIDER_HANDOFF_PROVEN' : 'HOST_TO_WSL_PROVIDER_HANDOFF_BLOCKED',
  producer: 'Node host frame encoder',
  staging: {
    engine: 'DuckDB',
    mode: 'in-memory read-only SELECT',
    rows: values.length / descriptor.shape[1],
    writesPerformed: false,
  },
  consumer: 'parent_atlas_tensor.unified_residency_stdio',
  transport: {
    control: 'length-prefixed UTF-8 JSON descriptor',
    numeric: 'length-prefixed little-endian Float32 bytes',
    descriptorBytes: Buffer.byteLength(JSON.stringify(descriptor)),
    numericBytes: values.length * 4,
  },
  lineage: {
    workspaceRevision: descriptor.workspaceRevision,
    sourceRevision: descriptor.sourceRevision,
    representationRevision: descriptor.representationRevision,
    featureRevision: descriptor.featureRevision,
  },
  receipt: receipt ? {
    state: receipt.state,
    residencyKey: receipt.residencyKey,
    byteLength: receipt.byteLength,
    device: receipt.device,
    rawPointerExposed: receipt.rawPointerExposed,
    writesPerformed: receipt.writesPerformed,
  } : null,
  frameChecksum: createHash('sha256').update(frame(descriptor, values)).digest('hex'),
  processExitCode: result.code,
  stderr: result.stderr.toString('utf8').trim(),
  parseError: error,
  canonicalAuthority: false,
  writesPerformed: false,
  promotionEligible: false,
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, reportPath }, null, 2));
if (report.status !== 'HOST_TO_WSL_PROVIDER_HANDOFF_PROVEN') process.exitCode = 1;
