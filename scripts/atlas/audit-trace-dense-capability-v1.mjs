import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=') || true];
}));
const qdrantUrl = String(args.get('qdrant-url') || process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/+$/, '');
const outputPath = resolve(root, String(args.get('out') || 'docs/reports/trace-dense-capability-v1.json'));
const collections = String(args.get('collections') || 'codebase_chunks_768,summary_lenses_768,synthesis_memory_768')
  .split(',').map((value) => value.trim()).filter(Boolean);
const logicalRepresentationByCollection = {
  codebase_chunks_768: 'semantic_768',
  summary_lenses_768: 'summary_768',
  synthesis_memory_768: 'synthesis_768',
};

const stable = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
};
const checksum = (value) => createHash('sha256').update(stable(value), 'utf8').digest('hex');
const resultOf = (body) => body?.result ?? body;
const vectorConfig = (info) => resultOf(info)?.config?.params?.vectors ?? resultOf(info)?.config?.vectors ?? null;

const report = {
  schema: 'atlas.trace-dense-capability-receipt.v1',
  generatedAt: new Date().toISOString(),
  endpoint: qdrantUrl,
  collections,
  capabilities: [],
  writesPerformed: false,
  safeToApply: false,
  status: 'BLOCKED',
  errors: [],
};

for (const collection of collections) {
  const body = {
    schema: 'atlas.dense-representation-capability.v1',
    logicalRepresentation: logicalRepresentationByCollection[collection] || 'qdrant_768',
    dimensions: 768,
    metric: 'cosine',
    qdrant: { collection, vectorName: null },
    available: false,
    representationRevision: `qdrant-schema:${collection}`,
    writesPerformed: false,
  };
  try {
    const response = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}`);
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const info = await response.json();
    const vectors = vectorConfig(info);
    if (!vectors) {
      body.reason = 'VECTOR_SCHEMA_ABSENT';
    } else if (typeof vectors.size === 'number') {
      body.dimensions = vectors.size;
      body.metric = String(vectors.distance || 'Cosine').toLowerCase();
      body.available = body.dimensions === 768 && body.metric === 'cosine';
      body.reason = body.available ? undefined : 'UNNAMED_VECTOR_DIMENSION_OR_METRIC_MISMATCH';
    } else if (typeof vectors === 'object') {
      const names = Object.keys(vectors);
      const name = names[0] ?? null;
      const config = name ? vectors[name] : null;
      body.qdrant.vectorName = name;
      body.dimensions = Number(config?.size || 0);
      body.metric = String(config?.distance || 'Cosine').toLowerCase();
      body.available = body.dimensions === 768 && body.metric === 'cosine';
      body.reason = body.available ? undefined : 'NAMED_VECTOR_DIMENSION_OR_METRIC_MISMATCH';
    } else {
      body.reason = 'VECTOR_SCHEMA_UNREADABLE';
    }
  } catch (error) {
    body.reason = `COLLECTION_READ_FAILED:${error?.message ?? String(error)}`;
  }
  const { capabilityChecksum: _, ...checksumBody } = body;
  body.capabilityChecksum = checksum(checksumBody);
  report.capabilities.push(body);
}

const successful = report.capabilities.filter((item) => item.available);
report.status = report.capabilities.length > 0 && successful.length > 0
  ? 'CAPABILITY_DISCOVERY_COMPLETE'
  : 'CAPABILITY_DISCOVERY_BLOCKED';
report.summary = {
  requested: report.capabilities.length,
  readable: report.capabilities.filter((item) => !String(item.reason || '').startsWith('COLLECTION_READ_FAILED')).length,
  available768Cosine: successful.length,
  namedVectors: report.capabilities.filter((item) => item.qdrant.vectorName !== null).length,
};

await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await rename(temporaryPath, outputPath);
console.log(JSON.stringify({ status: report.status, summary: report.summary, writesPerformed: false, reportPath: outputPath }, null, 2));
if (report.status === 'CAPABILITY_DISCOVERY_BLOCKED') process.exitCode = 1;
