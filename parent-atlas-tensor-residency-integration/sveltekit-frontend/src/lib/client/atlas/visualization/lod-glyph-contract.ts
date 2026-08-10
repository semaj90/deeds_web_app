export type AtlasLod = 0 | 1 | 2 | 3 | 4 | 5;

export interface TopologySpriteInstance {
  packetKey: string;
  somX: number;
  somY: number;
  authority: number;
  entropyUtility: number;
  lod: AtlasLod;
  glyphIndex: number;
  residency: 'COLD' | 'WARM' | 'HOT' | 'GPU';
}

export function glyphForLod(lod: AtlasLod): number {
  return [0, 1, 2, 4, 8, 16][lod];
}
