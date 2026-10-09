import type { EdgeAsset, EdgeManifest } from './phase23-model-manifest.js';

export type AssetState = 'PRESENT' | 'MISSING' | 'UNVERIFIED' | 'ERROR';
export interface AssetProbeResult {
  assetId: string;
  status: AssetState;
  localUrl: string;
  sourceUrl: string;
  message: string;
  repairCode: 'ASSET_MISSING' | 'ASSET_UNVERIFIED' | 'PROBE_FAILED' | 'NONE';
}
export interface ProbeDependencies {
  fetcher: (url: string, init?: RequestInit) => Promise<Response>;
}
/** Lightweight availability test. Never downloads weights: GET and body reading prohibited. */
export async function probeAsset(asset: EdgeAsset, dependencies: ProbeDependencies): Promise<AssetProbeResult> {
  const validLocal = asset.localUrl.startsWith('/') && !asset.localUrl.startsWith('//') && !asset.localUrl.includes('..');
  const validSource = /^https:\/\/[^\s]+$/i.test(asset.sourceUrl);
  if (!validLocal || !validSource) {
    return { assetId: asset.id, status: 'ERROR', localUrl: asset.localUrl, sourceUrl: asset.sourceUrl,
      message: 'Invalid local asset or source URL', repairCode: 'PROBE_FAILED' };
  }
  try {
    const response = await dependencies.fetcher(asset.localUrl, { method: 'HEAD', cache: 'no-store', redirect: 'error' });
    const contentType = response.headers.get('content-type') || '';
    if (response.status === 404 || response.status === 410) {
      return { assetId: asset.id, status: 'MISSING', localUrl: asset.localUrl, sourceUrl: asset.sourceUrl,
        message: 'Local model asset missing; review source URL, fetch manually with approved revision and checksum', repairCode: 'ASSET_MISSING' };
    }
    if (!response.ok || contentType.includes('text/html')) {
      return { assetId: asset.id, status: 'ERROR', localUrl: asset.localUrl, sourceUrl: asset.sourceUrl,
        message: 'Unexpected HEAD response (possibly SPA HTML fallback or unsupported HEAD)', repairCode: 'PROBE_FAILED' };
    }
    return { assetId: asset.id, status: 'UNVERIFIED', localUrl: asset.localUrl, sourceUrl: asset.sourceUrl,
      message: 'HEAD indicates asset exists; hash, format, tokenizer and inference are NOT_PROVEN', repairCode: 'ASSET_UNVERIFIED' };
  } catch (error) {
    return { assetId: asset.id, status: 'ERROR', localUrl: asset.localUrl, sourceUrl: asset.sourceUrl,
      message: 'Probe failed: ' + String(error), repairCode: 'PROBE_FAILED' };
  }
}
export async function probeManifest(manifest: EdgeManifest, deps: ProbeDependencies): Promise<AssetProbeResult[]> {
  return Promise.all(manifest.assets.map(asset => probeAsset(asset, deps)));
}
