import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = resolve(repoRoot, 'docs/reports/llama-server-8090-compatibility-v1.json');

async function readEndpoint(base, path) {
  try {
    const response = await fetch(`${base}${path}`);
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
    return { status: response.status, body };
  } catch (error) {
    return { status: null, error: error?.message ?? 'UNAVAILABLE' };
  }
}

async function sha256File(filePath) {
  try {
    await access(filePath);
    return await new Promise((resolveHash, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolveHash(`sha256:${hash.digest('hex')}`));
    });
  } catch {
    return null;
  }
}

const port8090 = 'http://127.0.0.1:8090';
const port8080 = 'http://127.0.0.1:8080';
const health = await readEndpoint(port8090, '/health');
const models = await readEndpoint(port8090, '/v1/models');
const props = await readEndpoint(port8090, '/props');
const legacyHealth = await readEndpoint(port8080, '/health');
const model = models.body?.data?.[0] ?? models.body?.models?.[0] ?? null;
const modelPath = props.body?.model_path ?? null;
const localModelChecksum = typeof modelPath === 'string' ? await sha256File(modelPath) : null;

const report = {
  schema: 'atlas.llama-server-8090-compatibility.v1',
  endpoint: port8090,
  health,
  model: model ? {
    id: model.id ?? model.name ?? null,
    digest: model.digest ?? localModelChecksum,
    format: model.meta?.format ?? model.details?.format ?? null,
    contextTrain: model.meta?.n_ctx_train ?? null,
  } : null,
  props: props.status === 200 && props.body ? {
    modelAlias: props.body.model_alias ?? null,
    modelPath,
    contextLength: props.body.default_generation_settings?.n_ctx ?? props.body.n_ctx ?? null,
    totalSlots: props.body.total_slots ?? null,
    buildInfo: props.body.build_info ?? null,
  } : null,
  legacyHealth8080: { status: legacyHealth.status, error: legacyHealth.error ?? null },
  modelChecksumStatus: model?.digest ? 'PRESENT_FROM_ENDPOINT' : localModelChecksum ? 'PRESENT_LOCAL_MODEL_HASH' : 'MISSING_FROM_ENDPOINT_AND_LOCAL_PATH',
  writesPerformed: false,
  canonicalAuthority: false,
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, health: health.status, modelId: report.model?.id ?? null, modelChecksumStatus: report.modelChecksumStatus, legacyHealth8080: legacyHealth.status }));
