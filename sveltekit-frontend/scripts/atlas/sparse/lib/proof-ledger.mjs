import { promises as fs } from 'node:fs';
import path from 'node:path';

export function buildProofLedgerEnvelope(input) {
  return {
    schema_version: 1,
    run_id: input.runId,
    artifact_id: input.artifactId,
    status: input.status ?? 'RUNTIME_PROVEN',
    corpus_revision: input.corpusRevision,
    representation_revision: input.representationRevision,
    source_count: input.sourceCount ?? 0,
    success_count: input.successCount ?? 0,
    failure_count: input.failureCount ?? 0,
    started_at: input.startedAt ?? new Date().toISOString(),
    completed_at: input.completedAt ?? new Date().toISOString(),
    checks: input.checks ?? {},
  };
}

export async function writeProofLedger(filePath, envelope) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
  return filePath;
}
