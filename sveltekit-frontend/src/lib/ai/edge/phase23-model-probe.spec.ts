import { describe, expect, it, vi } from 'vitest';
import { probeAsset, probeManifest } from './phase23-model-probe.js';
import { toRepairTask } from './phase23-agent-repair.js';
import { EDGE_EXPERIMENTAL_MANIFESTS } from './phase23-model-manifest.js';

const asset = EDGE_EXPERIMENTAL_MANIFESTS[0].assets[0];
const response = (status: number, mime = 'application/octet-stream') =>
  ({ ok: status >= 200 && status < 300, status, headers: new Headers({ 'content-type': mime }) } as Response);
describe('Phase 23 model asset probes', () => {
  it('HEAD only; never downloads weights', async () => {
    const fetcher = vi.fn(async () => response(200));
    const result = await probeAsset(asset, { fetcher });
    expect(result.status).toBe('UNVERIFIED');
    expect(fetcher).toHaveBeenCalledWith(asset.localUrl, { method: 'HEAD', cache: 'no-store', redirect: 'error' });
  });
  it('prints a reviewable source URL when missing', async () => {
    const result = await probeAsset(asset, { fetcher: async () => response(404) });
    const task = toRepairTask(result);
    expect(result.status).toBe('MISSING');
    expect(task?.action).toBe('REVIEW_MISSING_MODEL');
    expect(task?.evidence.sourceUrl).toBe(asset.sourceUrl);
    expect(task?.status).toBe('NEEDS_HUMAN_APPROVAL');
  });
  it('rejects SPA HTML fallback as model evidence', async () => {
    expect((await probeAsset(asset, { fetcher: async () => response(200, 'text/html') })).status).toBe('ERROR');
  });
  it('rejects external URLs masquerading as local model paths', async () => {
    const fetcher = vi.fn(async () => response(200));
    const result = await probeAsset({ ...asset, localUrl: 'https://evil.example/file' }, { fetcher });
    expect(result.status).toBe('ERROR');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('captures transport errors without propagating false readiness', async () => {
    expect((await probeAsset(asset, { fetcher: async () => { throw new Error('offline'); } })).status).toBe('ERROR');
  });
  it('checks every listed asset', async () => {
    const results = await probeManifest(EDGE_EXPERIMENTAL_MANIFESTS[0], { fetcher: async () => response(404) });
    expect(results).toHaveLength(2);
    expect(results.every(r => r.status === 'MISSING')).toBe(true);
  });
});
