import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { materializeWorkspaceRevisionOriginV1 } from '../../sveltekit-frontend/src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';

const root = process.cwd();
const seedPath = resolve(root, 'sveltekit-frontend/memory/index/symbols.jsonl');
const reportPath = resolve(root, 'docs/reports/file-exploration-identity-join-v1.json');
const origin = materializeWorkspaceRevisionOriginV1({
  workspaceRoot: root,
  repositoryId: process.env.ATLAS_REPOSITORY_ID ?? 'semaj90/deeds_web_app',
  producerRevision: 'atlas.file-exploration-identity-join.v1',
});

const sourceByRef = new Map(origin.bindings.map((binding) => [binding.sourceRef, binding]));
const lines = (await readFile(seedPath, 'utf8')).split(/\r?\n/).filter(Boolean);
const counts = {
  seedRows: lines.length,
  validJsonRows: 0,
  invalidJsonRows: 0,
  sourceRefMatched: 0,
  sourceRefMissing: 0,
  sourceRevisionPresent: 0,
  workspaceRevisionPresent: 0,
  byteSpanPresent: 0,
  identityReadyRows: 0,
};
const sampleReasons: Record<string, number> = {};

for (const line of lines) {
  let row: Record<string, unknown>;
  try {
    row = JSON.parse(line) as Record<string, unknown>;
    counts.validJsonRows += 1;
  } catch {
    counts.invalidJsonRows += 1;
    sampleReasons.INVALID_JSON = (sampleReasons.INVALID_JSON ?? 0) + 1;
    continue;
  }
  const sourceRef = typeof row.file === 'string' ? row.file.replaceAll('\\', '/') : null;
  const binding = sourceRef ? sourceByRef.get(sourceRef) : undefined;
  if (binding) counts.sourceRefMatched += 1;
  else counts.sourceRefMissing += 1;
  const hasSourceRevision = typeof row.sourceRevision === 'string' || typeof row.source_revision === 'string';
  const hasWorkspaceRevision = typeof row.workspaceRevision === 'string' || typeof row.workspace_revision === 'string';
  const hasStart = Number.isInteger(row.startByte) || Number.isInteger(row.byteStart) || Number.isInteger(row.byte_start);
  const hasEnd = Number.isInteger(row.endByte) || Number.isInteger(row.byteEnd) || Number.isInteger(row.byte_end);
  if (hasSourceRevision) counts.sourceRevisionPresent += 1;
  if (hasWorkspaceRevision) counts.workspaceRevisionPresent += 1;
  if (hasStart && hasEnd) counts.byteSpanPresent += 1;
  if (binding && hasSourceRevision && hasWorkspaceRevision && hasStart && hasEnd) counts.identityReadyRows += 1;
  else {
    const reason = !binding ? 'SOURCE_REF_NOT_IN_CURRENT_WORKSPACE' : !hasSourceRevision ? 'SOURCE_REVISION_MISSING' : !hasWorkspaceRevision ? 'WORKSPACE_REVISION_MISSING' : 'BYTE_SPAN_MISSING';
    sampleReasons[reason] = (sampleReasons[reason] ?? 0) + 1;
  }
}

const report = {
  schema: 'atlas.file-exploration-identity-join.v1',
  status: counts.identityReadyRows > 0 ? 'IDENTITY_READY_ROWS_FOUND_REQUIRES_SCHEMA_VALIDATION' : 'SEED_NOT_IDENTITY_READY',
  gate: 'ATLAS-FILE-EXPLORATION-INDEX-03',
  seedPath,
  workspaceRevision: origin.record.workspaceRevision,
  workspaceSourceCount: origin.record.sourceCount,
  counts,
  blockerReasons: sampleReasons,
  sourceAuthority: 'existing WorkspaceSourceBindingV1 producer',
  observationAuthority: 'existing AST-grep seed; discovery only until identity join',
  canonicalAuthority: false,
  readOnly: true,
  writesPerformed: false,
};

await mkdir(resolve(root, 'docs/reports'), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, counts, report: reportPath }, null, 2));
