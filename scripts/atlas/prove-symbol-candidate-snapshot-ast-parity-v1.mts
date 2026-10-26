import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoEnv = loadRepoEnv(process.env);
process.env.DATABASE_URL = resolveDatabaseUrl(repoEnv);
const modelPath = String(repoEnv.ROTORQUANT_MODEL_PATH ?? repoEnv.TURBO_MODEL_PATH ?? '').trim();
if (!modelPath) throw new Error('ROTORQUANT_MODEL_PATH_REQUIRED_FOR_AST_PARITY_PROOF');
process.env.ROTORQUANT_MODEL_PATH = modelPath;
const { executeACPTool } = await import('../../sveltekit-frontend/src/lib/server/services/knowledge-search/ACPToolRegistry.ts');
const crosswalkPath = process.argv[2];
if (!crosswalkPath) throw new Error('CROSSWALK_RECEIPT_PATH_REQUIRED');
const crosswalk = JSON.parse(readFileSync(resolve(root, crosswalkPath), 'utf8'));
const snapshotEvidence = crosswalk.admittedSnapshotCrosswalk;
const integrity = snapshotEvidence?.snapshotIntegrity;
if (crosswalk.schema !== 'atlas.symbol-ast-identity-crosswalk.v1' ||
    snapshotEvidence?.status !== 'ADMITTED_SNAPSHOT_CHECKED' ||
    !integrity || Object.values(integrity).some((value) => value !== true) ||
    snapshotEvidence.materializedBytes?.failures !== 0) {
  throw new Error('CROSSWALK_SNAPSHOT_PROOF_REQUIRED');
}

const admission = JSON.parse(readFileSync(resolve(root, 'docs/reports/workspace-revision-tournament-admission-v1.json'), 'utf8'));
if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true ||
    admission.workspaceRevision !== snapshotEvidence.admittedWorkspaceRevision ||
    admission.snapshotRevision !== snapshotEvidence.snapshotRevision) {
  throw new Error('ADMISSION_RECEIPT_MISMATCH');
}
const snapshotPath = resolve(root, 'docs/reports/workspace-source-snapshots', `${admission.snapshotRevision.slice(7)}.json`);
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
if (snapshot.snapshotRevision !== admission.snapshotRevision || !Array.isArray(snapshot.sources)) {
  throw new Error('SNAPSHOT_MANIFEST_MISMATCH');
}
const snapshotRoot = resolve(root, '.tmp/workspace-source-snapshots', admission.snapshotRevision.slice(7));
const snapshotRootReal = realpathSync(snapshotRoot);
const materializedEntries = snapshot.sources.filter((source: any) => source.repositoryId === 'repo:root');
const candidates = crosswalk.reconciliationCandidates as Array<Record<string, any>>;
if (!Array.isArray(candidates) || candidates.length !== 64) throw new Error('EXPECTED_64_FROZEN_CANDIDATES');

const bySource = new Map<string, Record<string, any>[]>();
for (const candidate of candidates) {
  const sourceRef = String(candidate.source_ref ?? '');
  if (!sourceRef || isAbsolute(sourceRef) || /^[A-Za-z]:/.test(sourceRef)) throw new Error(`INVALID_SOURCE_REF:${sourceRef}`);
  const rows = bySource.get(sourceRef) ?? [];
  rows.push(candidate);
  bySource.set(sourceRef, rows);
}

const files = [];
for (const [sourceRef, rows] of [...bySource.entries()].sort(([left], [right]) => left.localeCompare(right))) {
  const manifestRows = materializedEntries.filter((source: any) => source.sourceRef === sourceRef);
  if (manifestRows.length !== 1) throw new Error(`SNAPSHOT_SOURCE_CARDINALITY:${sourceRef}:${manifestRows.length}`);
  const manifestSource = manifestRows[0];
  const filePath = resolve(snapshotRoot, ...sourceRef.split(/[\\/]+/));
  const lexicalRelative = relative(snapshotRoot, filePath);
  if (!lexicalRelative || lexicalRelative === '..' || lexicalRelative.startsWith(`..${sep}`) || isAbsolute(lexicalRelative)) {
    throw new Error(`SNAPSHOT_PATH_ESCAPE:${sourceRef}`);
  }
  const realPath = realpathSync(filePath);
  const realRelative = relative(snapshotRootReal, realPath);
  if (!realRelative || realRelative === '..' || realRelative.startsWith(`..${sep}`) || isAbsolute(realRelative)) {
    throw new Error(`SNAPSHOT_REALPATH_ESCAPE:${sourceRef}`);
  }
  const bytes = readFileSync(realPath);
  const revision = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const expectedRevision = String(manifestSource.sourceRevision ?? '').toLowerCase();
  if (revision !== expectedRevision || revision !== String(rows[0].binding_source_revision).toLowerCase() ||
      bytes.length !== Number(manifestSource.byteLength) || bytes.length !== Number(rows[0].binding_byte_length)) {
    throw new Error(`SNAPSHOT_BYTES_NOT_QUALIFIED:${sourceRef}`);
  }
  for (const row of rows) {
    if (String(row.binding_source_revision).toLowerCase() !== revision ||
        String(row.binding_workspace_revision) !== admission.workspaceRevision ||
        String(row.binding_content_digest).replace(/^sha256:/i, '').toLowerCase() !== revision.slice(7)) {
      throw new Error(`CANDIDATE_BINDING_MISMATCH:${row.symbol_version_id}`);
    }
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const extension = sourceRef.slice(sourceRef.lastIndexOf('.')).toLowerCase();
  const language = ['.ts', '.tsx', '.mts', '.cts'].includes(extension)
    ? 'typescript'
    : ['.js', '.jsx', '.mjs', '.cjs'].includes(extension) ? 'javascript' : null;
  if (!language) throw new Error(`UNSUPPORTED_CANDIDATE_LANGUAGE:${sourceRef}`);
  if (text.length > 200_000) throw new Error(`AST_TOOL_INPUT_TOO_LARGE:${sourceRef}`);
  const result = await executeACPTool('nlp:ast-chunk', { source: text, language, filePath: sourceRef, sourceRevision: revision });
  const data = result.data as Record<string, any> | undefined;
  const returnedChunks = Array.isArray(data?.chunks) ? data.chunks : [];
  const candidateMatches = rows.map((row) => {
    const start = Number(row.byte_start);
    const end = Number(row.byte_end);
    const spanMatches = returnedChunks.filter((chunk: any) => Number(chunk.start_byte) === start && Number(chunk.end_byte) === end);
    const expectedName = String(row.qualified_name ?? '').split(/[.:#]/).filter(Boolean).at(-1) ?? null;
    const nameMatches = spanMatches.filter((chunk: any) => String(chunk.name ?? '') === expectedName);
    const overlappingChunks = returnedChunks.filter((chunk: any) => Number(chunk.start_byte) < end && Number(chunk.end_byte) > start);
    const sameNameChunks = returnedChunks.filter((chunk: any) => String(chunk.name ?? '') === expectedName);
    return {
      symbolVersionId: row.symbol_version_id,
      byteSpan: [start, end],
      qualifiedNameLeafMatch: nameMatches.length === 1,
      exactSpanMatchCount: spanMatches.length,
      sameNameChunkCount: sameNameChunks.length,
      overlappingChunks: overlappingChunks.slice(0, 5).map((chunk: any) => ({
        byteSpan: [chunk.start_byte, chunk.end_byte],
        name: chunk.name ?? null,
        nodeType: chunk.node_type,
        kind: chunk.kind,
      })),
    };
  });
  files.push({
    sourceRef,
    candidateCount: rows.length,
    sourceRevision: revision,
    parserSuccess: result.success,
    schema: data?.schema ?? null,
    engine: data?.engine ?? null,
    engineVersion: data?.engine_version ?? null,
    returnedSourceRevision: data?.source_revision ?? null,
    returnedFilePath: data?.file_path ?? null,
    syntaxStatus: data?.syntax_status ?? null,
    parserChunkCount: returnedChunks.length,
    exactSpanMatches: candidateMatches.filter((match) => match.exactSpanMatchCount === 1).length,
    qualifiedNameLeafMatches: candidateMatches.filter((match) => match.qualifiedNameLeafMatch).length,
    candidateMatches,
    diagnostics: Array.isArray(data?.diagnostics) ? data.diagnostics : [],
  });
}

const exactSpanMatches = files.reduce((sum: number, file: any) => sum + file.exactSpanMatches, 0);
const qualifiedNameLeafMatches = files.reduce((sum: number, file: any) => sum + file.qualifiedNameLeafMatches, 0);
const parserResponsesValid = files.every((file: any) => file.parserSuccess && file.schema === 'atlas.ast.evidence.v1' &&
  file.returnedSourceRevision === file.sourceRevision && file.returnedFilePath === file.sourceRef);
const report: Record<string, any> = {
  schema: 'atlas.symbol-candidate-snapshot-ast-parity.v1',
  crosswalkReceipt: crosswalkPath.replace(/\\/g, '/'),
  workspaceRevision: admission.workspaceRevision,
  snapshotRevision: admission.snapshotRevision,
  candidateRows: candidates.length,
  uniqueSourceFiles: files.length,
  exactSpanMatches,
  qualifiedNameLeafMatches,
  parserResponsesValid,
  files,
  writes: { postgres: false, qdrant: false, neo4j: false, valkey: false, sourceFiles: false },
  canonicalAuthority: false,
};
report.status = parserResponsesValid && exactSpanMatches === candidates.length
  ? 'PARSER_AND_ALL_CANDIDATE_SPANS_PROVEN'
  : parserResponsesValid ? 'PARSER_OUTPUT_OBSERVED_SPAN_PARITY_PARTIAL' : 'PARSER_OBSERVATION_PARTIAL';
report.likely_cause = 'Candidate symbol spans require comparison with parser output from their exact admitted source snapshot.';
report.evidence = [crosswalkPath, snapshotEvidence.snapshotPath, snapshotEvidence.materializedRoot];
report.patch_targets = ['scripts/atlas/prove-symbol-candidate-snapshot-ast-parity-v1.mts'];
report.safe_next_command = `npx tsx scripts/atlas/prove-symbol-candidate-snapshot-ast-parity-v1.mts ${crosswalkPath}`;
report.smoke_command = 'npx openspec validate parent-atlas-retrieval-lineage-dag-convergence --strict';
report.reportPath = `docs/reports/symbol-candidate-snapshot-ast-parity-v1-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
const reportFile = resolve(root, report.reportPath);
if (existsSync(reportFile)) throw new Error('REPORT_PATH_COLLISION');
writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, candidateRows: report.candidateRows,
  uniqueSourceFiles: report.uniqueSourceFiles, reportPath: report.reportPath }, null, 2));
