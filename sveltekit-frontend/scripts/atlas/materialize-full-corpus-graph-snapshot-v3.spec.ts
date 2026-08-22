import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const v3 = new URL('./materialize-full-corpus-graph-snapshot-v3.mts', import.meta.url);
describe('full corpus graph snapshot v3 authority boundary',()=>{
  it('has no Git or env workspace-revision fallback',async()=>{const s=await readFile(v3,'utf8');expect(s).not.toContain('git rev-parse HEAD');expect(s).not.toContain('process.env.WORKSPACE_REVISION');expect(s).not.toContain('process.env.REPOSITORY_REVISION');expect(s).toContain("workspaceAuthority:'PERSISTED_COMPLETE_GRAPHIFY_MANIFEST'");});
  it('proves manifest completeness before graph corpus reads',async()=>{const s=await readFile(v3,'utf8');const gate=s.indexOf('loadCompleteWorkspaceManifest(client)');const tree=s.indexOf("client.query('SELECT * FROM atlas_tree_nodes ORDER BY node_id')");const materialize=s.indexOf('materializeGraphSnapshot(input)');expect(gate).toBeGreaterThan(-1);expect(tree).toBeGreaterThan(gate);expect(materialize).toBeGreaterThan(tree);expect(s).toContain('graphMayConsumeWorkspaceRevision');});
  it('binds source revisions before persistence',async()=>{const s=await readFile(v3,'utf8');expect(s.indexOf('bindGraphSnapshotNodeSourceRevisionsV1({')).toBeLessThan(s.indexOf('persistSnapshot(client'));expect(s).toContain('source_ref,source_revision,content_hash');expect(s).toContain('GRAPH_SOURCE_REVISION_COVERAGE_INCOMPLETE');});
  it('guards durable APPLY with explicit non-production opt-ins',async()=>{const s=await readFile(v3,'utf8');expect(s).toContain("process.env.ATLAS_GRAPH_SNAPSHOT_APPLY !== '1'");expect(s).toContain("process.env.ATLAS_NON_PRODUCTION_DATABASE !== '1'");});
});
