export type ShaderToVertexMapEntry = { shaderId: string; vertexKey: string; addedAt: number };

const shaderToVertex = new Map<string, Set<string>>();

/**
 * Link a shader id to a vertex cache key.
 */
export function linkShaderToVertexCache(shaderId: string, vertexKey: string) {
  if (!shaderToVertex.has(shaderId)) shaderToVertex.set(shaderId, new Set());
  shaderToVertex.get(shaderId)!.add(vertexKey);
}

/**
 * Get vertex cache keys associated with a shader id.
 */
export function getVertexKeysForShader(shaderId: string): string[] {
  const set = shaderToVertex.get(shaderId);
  return set ? Array.from(set) : [];
}

/**
 * Remove a mapping or a vertex key from a shader entry.
 */
export function unlinkShaderVertex(shaderId: string, vertexKey?: string) {
  const set = shaderToVertex.get(shaderId);
  if (!set) return;
  if (vertexKey) {
    set.delete(vertexKey);
    if (set.size === 0) shaderToVertex.delete(shaderId);
  } else {
    shaderToVertex.delete(shaderId);
  }
}

/**
 * Lightweight inspector for debugging.
 */
export function listShaderVertexMappings(): ShaderToVertexMapEntry[] {
  const out: ShaderToVertexMapEntry[] = [];
  for (const [shaderId, keys] of shaderToVertex.entries()) {
    for (const k of keys) out.push(<any>(<any>{ shaderId, vertexKey: k, addedAt: Date.now() }));
  }
  return out;
}
