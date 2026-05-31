import { promises as fs } from 'fs';
import { dirname, join } from 'path';

const BASE = join(process.cwd(), '.opencode', 'ndjson');

async function ensureDir(path: string) {
  try {
    await fs.mkdir(path, { recursive: true });
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

/**
 * Append an object as NDJSON to a pipeline-specific file.
 * - pipeline: short name (e.g. "parents-atlas")
 * - runId: optional run identifier; if omitted date-based filename used
 */
export async function appendNdjson(pipeline: string, obj: unknown, runId?: string) {
  const date = formatDate();
  const dir = join(BASE, pipeline);
  await ensureDir(dir);
  const filename = runId ? `${date}-${runId}.ndjson` : `${date}.ndjson`;
  const full = join(dir, filename);
  const line = JSON.stringify({ ts: new Date().toISOString(), payload: obj }) + '\n';
  await fs.appendFile(full, line, 'utf8');
  return full;
}

/**
 * Append a small ledger entry for runs. Ledger is a compact index file.
 */
export async function appendLedger(pipeline: string, entry: Record<string, unknown>) {
  const dir = join(BASE, pipeline);
  await ensureDir(dir);
  const full = join(dir, 'ledger.ndjson');
  const line = JSON.stringify({ ts: new Date().toISOString(), entry }) + '\n';
  await fs.appendFile(full, line, 'utf8');
  return full;
}

export async function listPipelineFiles(pipeline: string) {
  const dir = join(BASE, pipeline);
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

export default { appendNdjson, appendLedger, listPipelineFiles };
