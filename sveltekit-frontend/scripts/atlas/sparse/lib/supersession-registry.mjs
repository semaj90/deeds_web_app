import { promises as fs } from 'node:fs';
import path from 'node:path';

export const DEFAULT_SUPERSESSION_PATH = path.resolve(process.cwd(), '.tmp', 'atlas-sparse-supersession.json');

export async function loadSupersessionRegistry(filePath = DEFAULT_SUPERSESSION_PATH) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch {
    return { schema_version: 1, artifacts: [] };
  }
}

export async function markSupersededArtifact(record, filePath = DEFAULT_SUPERSESSION_PATH) {
  const registry = await loadSupersessionRegistry(filePath);
  registry.artifacts = registry.artifacts.filter((item) => item.artifact_id !== record.artifact_id);
  registry.artifacts.push({
    artifact_id: record.artifact_id,
    artifact_state: record.artifact_state ?? 'SUPERSEDED',
    superseded_by: record.superseded_by ?? null,
    reason: record.reason,
    effective_at: record.effective_at ?? new Date().toISOString(),
  });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  return registry;
}
