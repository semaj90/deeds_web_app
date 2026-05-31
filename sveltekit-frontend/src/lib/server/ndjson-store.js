import fs from 'fs/promises';
import path from 'path';

const BASE = path.join(process.cwd(), '.opencode', 'ndjson');

async function ensureDir(p) {
  try {
    await fs.mkdir(p, { recursive: true });
  } catch {
    // ignore
  }
}

function formatDate(d = new Date()) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export async function appendNdjson(pipeline, obj, runId) {
  const date = formatDate();
  const dir = path.join(BASE, pipeline);
  await ensureDir(dir);
  const filename = runId ? `${date}-${runId}.ndjson` : `${date}.ndjson`;
  const full = path.join(dir, filename);
  const line = JSON.stringify({ ts: new Date().toISOString(), payload: obj }) + '\n';
  await fs.appendFile(full, line, 'utf8');
  return full;
}

export async function appendLedger(pipeline, entry) {
  const dir = path.join(BASE, pipeline);
  await ensureDir(dir);
  const full = path.join(dir, 'ledger.ndjson');
  const line = JSON.stringify({ ts: new Date().toISOString(), entry }) + '\n';
  await fs.appendFile(full, line, 'utf8');
  return full;
}

export async function listPipelineFiles(pipeline) {
  const dir = path.join(BASE, pipeline);
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

export default { appendNdjson, appendLedger, listPipelineFiles };
