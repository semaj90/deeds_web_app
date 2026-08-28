import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveProjectGraphRevision } from '../dist/core/project-graph-revision-v1.js';

const hash = (letter) => `sha256:${letter.repeat(64)}`;
const base = {
  workspace_revision: 'sha256:workspace', project_ref: 'sveltekit-frontend',
  project_config_checksum: hash('a'), compiler_options_checksum: hash('b'), dependency_lock_checksum: hash('c'),
  package_manifest_checksums: [hash('d'), hash('e')], project_reference_checksums: [hash('f')],
  declaration_file_checksums: [hash('1')], source_revision_checksums: [hash('2'), hash('3')],
  semantic_engine_revision: 'typescript:5.9', virtual_document_checksums: [], source_map_checksums: [],
};

test('project graph revision is invariant to input ordering', () => {
  const first = deriveProjectGraphRevision(base);
  const second = deriveProjectGraphRevision({ ...base, package_manifest_checksums: [hash('e'), hash('d')], source_revision_checksums: [hash('3'), hash('2')] });
  assert.equal(first.project_graph_revision, second.project_graph_revision);
});

test('project graph revision changes when compiler environment changes', () => {
  assert.notEqual(deriveProjectGraphRevision(base).project_graph_revision, deriveProjectGraphRevision({ ...base, compiler_options_checksum: hash('9') }).project_graph_revision);
});
