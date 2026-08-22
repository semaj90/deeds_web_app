import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const v3 = new URL('./materialize-full-corpus-graph-snapshot-v3.mts', import.meta.url);
describe('full corpus graph snapshot v3 authority boundary',()=>{
  it('has no Git or env workspace-revision fallback',async()=>{const s=await readFile(v3,'utf8');expect(s).not.toContain('git rev-parse HEAD');expect(s).not.toContain('process.env.WORKSPACE_REVISION');expect(s).not.toContain('process.env.REPOSITORY_REVISION');expect(s).toContain("workspaceAuthority:'PERSISTED_COMPLETE_GRAPHIFY_MANIFEST'");});
  it('proves manifest completeness before graph corpus reads',async()=>{const s=await readFile(v3,'utf8');const gate=s.indexOf('loadCompleteWorkspaceManifest(client)');const tree=s.indexOf("client.query('SELECT * FROM atlas_tree_nodes ORDER BY node_id')");const materialize=s.indexOf('materializeGraphSnapshot(input)');expect(gate).toBeGreaterThan(-1);expect(tree).toBeGreaterThan(gate);expect(materialize).toBeGreaterThan(tree);expect(s).toContain('graphMayConsumeWorkspaceRevision');});
  it('binds source revisions before persistence',async()=>{const s=await readFile(v3,'utf8');expect(s.indexOf('bindGraphSnapshotNodeSourceRevisionsV1({')).toBeLessThan(s.indexOf('persistSnapshot(client'));expect(s).toContain('source_ref,source_revision,content_hash');expect(s).toContain('GRAPH_SOURCE_REVISION_COVERAGE_INCOMPLETE');});
  it('guards durable APPLY with explicit non-production opt-ins',async()=>{const s=await readFile(v3,'utf8');expect(s).toContain("process.env.ATLAS_GRAPH_SNAPSHOT_APPLY !== '1'");expect(s).toContain("process.env.ATLAS_NON_PRODUCTION_DATABASE !== '1'");});
const legacyUrl = new URL('./materialize-full-corpus-graph-snapshot.mts', import.meta.url);
const v3Url = new URL('./materialize-full-corpus-graph-snapshot-v3.mts', import.meta.url);

describe('full corpus graph snapshot workspace authority', () => {
  it('keeps the legacy command as a thin v3 compatibility entrypoint', async () => {
    const source = await readFile(legacyUrl, 'utf8');
    expect(source).toContain("import './materialize-full-corpus-graph-snapshot-v3.mts'");
    expect(source).not.toContain('git rev-parse HEAD');
    expect(source).not.toContain('WORKSPACE_REVISION');
    expect(source).not.toContain('REPOSITORY_REVISION');
  });

  it('requires a complete persisted Graphify workspace manifest before graph materialization', async () => {
    const source = await readFile(v3Url, 'utf8');
    const manifestGate = source.indexOf('loadCompleteWorkspaceManifest(client)');
    const graphLoad = source.indexOf("client.query('SELECT * FROM atlas_tree_nodes ORDER BY node_id')");
    const materialize = source.indexOf('materializeGraphSnapshot(input)');

    expect(manifestGate).toBeGreaterThan(-1);
    expect(graphLoad).toBeGreaterThan(manifestGate);
    expect(materialize).toBeGreaterThan(graphLoad);
    expect(source).toContain('graphMayConsumeWorkspaceRevision');
    expect(source).toContain('GRAPH_WORKSPACE_MANIFEST_NOT_COMPLETE');
    expect(source).not.toContain('git rev-parse HEAD');
    expect(source).not.toContain('process.env.WORKSPACE_REVISION');
    expect(source).not.toContain('process.env.REPOSITORY_REVISION');
  });

  it('binds authoritative source revisions before any graph APPLY', async () => {
    const source = await readFile(v3Url, 'utf8');
    const binding = source.indexOf('bindGraphSnapshotNodeSourceRevisionsV1({');
    const persistence = source.indexOf('await persistSnapshot(client');

    expect(binding).toBeGreaterThan(-1);
    expect(persistence).toBeGreaterThan(binding);
    expect(source).toContain('GRAPH_SOURCE_REVISION_COVERAGE_INCOMPLETE');
    expect(source).toContain('(snapshot_id,node_key,node_type,packet_key,tree_node_id,source_ref,source_revision,content_hash,properties)');
  });

  it('keeps durable APPLY behind explicit non-production opt-ins', async () => {
    const source = await readFile(v3Url, 'utf8');
    expect(source).toContain("process.env.ATLAS_GRAPH_SNAPSHOT_APPLY !== '1'");
    expect(source).toContain("process.env.ATLAS_NON_PRODUCTION_DATABASE !== '1'");
    expect(source).toContain('GRAPH_SNAPSHOT_APPLY_CONFIRMATION_REQUIRED');
    expect(source).toContain('GRAPH_SNAPSHOT_NON_PRODUCTION_DATABASE_REQUIRED');
  });
});
