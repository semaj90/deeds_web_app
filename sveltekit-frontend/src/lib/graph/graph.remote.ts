/**
 * getBagOfWordsTexture — typed client helper that calls
 * POST /api/graph/bow-texture and returns a BowTextureTile.
 *
 * Calling convention mirrors a SvelteKit Remote Function:
 *   const tile = await getBagOfWordsTexture({ clusterId: 3 });
 *
 * The server checks Redis first (rpc:remote-function:getBagOfWordsTexture:v1:<hash>)
 * before building the tile from Qdrant payload.
 */

export interface BowTextureTile {
  tileId: string;
  clusterId?: number;
  som?: { x: number; y: number };
  terms: string[];
  weights: number[];
  sourceChunkIds: string[];
  updatedAt: string;
}

export interface BowTextureResult {
  tile: BowTextureTile;
  cache: {
    hit: boolean;
    key: string;
    ttlSeconds: number;
  };
}

export type BowTextureArgs =
  | { chunkId: string; clusterId?: number; som?: { x: number; y: number } }
  | { clusterId: number }
  | { som: { x: number; y: number } };

export async function getBagOfWordsTexture(
  args: BowTextureArgs,
  opts?: { signal?: AbortSignal }
): Promise<BowTextureResult> {
  const res = await fetch('/api/graph/bow-texture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: opts?.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`bow-texture ${res.status}: ${text}`);
  }

  return res.json() as Promise<BowTextureResult>;
}
