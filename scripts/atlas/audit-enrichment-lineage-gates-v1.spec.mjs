import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./audit-enrichment-lineage-gates-v1.mjs', import.meta.url), 'utf8');

test('packet workspace qualification is owned by the exact workspace-source binding', () => {
  assert.match(source, /--binding-repo-id/);
  assert.match(source, /JOIN public\.atlas_workspace_source_bindings b\s+ON b\.repo_id = \$3\s+AND b\.canonical_source_ref = c\.source_ref\s+AND b\.workspace_revision = c\.workspace_revision\s+AND lower\(b\.source_revision\) = c\.source_revision\s+AND lower\(b\.content_digest\) = c\.content_hash/);
  assert.match(source, /p\.workspace_revision_key AS packet_workspace_revision_key/);
  assert.doesNotMatch(source, /p\.workspace_revision_key\s*(?:=|IS\s+NOT\s+DISTINCT\s+FROM)/i);
});
