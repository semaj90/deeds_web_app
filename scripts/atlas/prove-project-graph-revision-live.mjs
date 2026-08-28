import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveProjectGraphRevision } from '../../packages/parent-atlas/dist/core/project-graph-revision-v1.js';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const frontend = resolve(root, 'sveltekit-frontend');
const observationPath = resolve(root, 'docs/reports/workspace-source-binding-observation.json');
const reportPath = resolve(root, 'docs/reports/project-graph-revision-live-proof-v1.json');
const svelteReportPath = resolve(root, 'docs/reports/svelte-virtual-source-binding-proof-v1.json');
const read = (path) => readFile(path);
const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const json = JSON.parse(await read(observationPath, 'utf8'));
const svelteReport = JSON.parse(await read(svelteReportPath, 'utf8'));
const tsconfig = await read(resolve(frontend, 'tsconfig.json'));
const packageJson = await read(resolve(frontend, 'package.json'));
const lockfile = await read(resolve(frontend, 'package-lock.json'));
const typescriptManifest = JSON.parse(await read(resolve(frontend, 'node_modules/typescript/package.json'), 'utf8'));
const sourceRevisionChecksums = (json.bindings ?? []).map((binding) => `sha256:${binding.contentDigest}`).sort();
const input = {
  workspace_revision: json.record?.workspaceRevision,
  project_ref: 'sveltekit-frontend',
  project_config_checksum: digest(tsconfig),
  compiler_options_checksum: digest(tsconfig),
  dependency_lock_checksum: digest(lockfile),
  package_manifest_checksums: [digest(packageJson)],
  project_reference_checksums: [],
  declaration_file_checksums: [],
  source_revision_checksums: sourceRevisionChecksums,
  semantic_engine_revision: `typescript:${typescriptManifest.version}`,
  virtual_document_checksums: svelteReport.virtualDocument?.virtualContentDigest ? [svelteReport.virtualDocument.virtualContentDigest] : [],
  source_map_checksums: svelteReport.virtualDocument?.sourceMapChecksum ? [svelteReport.virtualDocument.sourceMapChecksum] : [],
};
const first = deriveProjectGraphRevision(input);
const second = deriveProjectGraphRevision({ ...input, source_revision_checksums: [...sourceRevisionChecksums].reverse() });
const report = {
  schema: 'atlas.project-graph-revision-live-proof.v1',
  status: first.project_graph_revision === second.project_graph_revision ? 'PROVEN_LIVE_READ_ONLY' : 'FAILED',
  writes: false,
  workspace_revision: input.workspace_revision,
  source_count: sourceRevisionChecksums.length,
  project_graph_revision: first.project_graph_revision,
  input_order_invariant: first.project_graph_revision === second.project_graph_revision,
  semantic_engine_revision: input.semantic_engine_revision,
  project_config_checksum: input.project_config_checksum,
  dependency_lock_checksum: input.dependency_lock_checksum,
  virtual_document_count: input.virtual_document_checksums.length,
  source_map_count: input.source_map_checksums.length,
  svelte_virtual_source_proof: 'docs/reports/svelte-virtual-source-binding-proof-v1.json',
  remaining: ['exact source-map range to Tree-sitter node proof', 'Svelte Language Server semantic request proof'],
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, sourceCount: report.source_count, projectGraphRevision: report.project_graph_revision, report: reportPath }, null, 2));
if (report.status === 'FAILED') process.exitCode = 1;
