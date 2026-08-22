import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const legacy=new URL('./materialize-graphify-source-inventory.mts',import.meta.url);
const v3=new URL('./materialize-graphify-source-inventory-v3.mts',import.meta.url);
describe('Graphify source inventory v3 authority boundary',()=>{
  it('routes the legacy command to v3 and removes Git revision authority',async()=>{const s=await readFile(legacy,'utf8');expect(s).toContain("import './materialize-graphify-source-inventory-v3.mts'");expect(s).not.toContain('git rev-parse HEAD');});
  it('computes WorkspaceRevisionRecordV1 before any bounded dry-run selection',async()=>{const s=await readFile(v3,'utf8');expect(s.indexOf('materializeWorkspaceRevisionOriginV1({')).toBeLessThan(s.indexOf('selected=selected.slice'));expect(s).not.toContain('git rev-parse HEAD');});
  it('refuses single-source durable apply and requires full-manifest readback',async()=>{const s=await readFile(v3,'utf8');expect(s).toContain('GRAPHIFY_DURABLE_APPLY_REQUIRES_FULL_MANIFEST_NOT_SINGLE_SOURCE');expect(s).toContain('GRAPHIFY_DURABLE_APPLY_REQUIRES_COMPLETE_MANIFEST');expect(s).toContain('evaluateGraphifyWorkspaceManifestCompletenessV1');expect(s).toContain('GRAPHIFY_FULL_MANIFEST_READBACK_REJECTED');});
  it('keeps Git provenance separate from exact source identity',async()=>{const s=await readFile(v3,'utf8');expect(s).toContain('repositoryRevision:origin.record.baseCommitOid');expect(s).toContain("workspaceRevisionOwner:'WorkspaceRevisionRecordV1'");expect(s).toContain("sourceRevisionOwner:'CodeSourceRevisionV1'");expect(s).toContain('[workspaceId,b.sourceRef,b.gitBlobOid,b.sourceRevision,b.contentDigest,b.byteLength,runId]');});
});
