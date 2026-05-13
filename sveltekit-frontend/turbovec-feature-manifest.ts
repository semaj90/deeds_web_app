export interface TurboVecFeature {
  id: string;
  title: string;
  description: string;
  status: 'planning' | 'implemented' | 'deprecated';
  category: string;
  tags: string[];
  paths: {
    source: string[];
    extraction: string[];
    persistence: string[];
  };
  metadata: {
    version: string;
    wheel: string;
  };
}

export interface TurboVecManifest {
  features: TurboVecFeature[];
}

import manifestData from './turbovec-feature-manifest.json';
export const manifest: TurboVecManifest = manifestData as TurboVecManifest;
