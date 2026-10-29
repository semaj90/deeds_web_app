export const N64_BROWSER_PROFILE_V1 = Object.freeze({
  internalWidth: 320,
  internalHeight: 240,
  geometryBudgetBytes: 8 * 1024 * 1024,
});

export interface GeometryLike {
  getTotalVertices(): number;
  getTotalIndices(): number;
}

export interface MeshGeometryLike {
  geometry?: GeometryLike | null;
}

export function estimateGeometryBytes(meshes: readonly MeshGeometryLike[]): number {
  const geometries = new Set<GeometryLike>();
  for (const mesh of meshes) {
    if (mesh.geometry) geometries.add(mesh.geometry);
  }

  let bytes = 0;
  for (const geometry of geometries) {
    bytes += geometry.getTotalVertices() * 32 + geometry.getTotalIndices() * 4;
  }
  return bytes;
}

export function fitsGeometryBudget(currentBytes: number, addedBytes: number): boolean {
  return (
    Number.isFinite(currentBytes) &&
    Number.isFinite(addedBytes) &&
    currentBytes >= 0 &&
    addedBytes >= 0 &&
    currentBytes + addedBytes <= N64_BROWSER_PROFILE_V1.geometryBudgetBytes
  );
}

export function getN64RenderSize(
  cssWidth: number,
  cssHeight: number
): { width: number; height: number } {
  const width = Math.max(1, Math.floor(cssWidth));
  const height = Math.max(1, Math.floor(cssHeight));
  const scale = Math.min(
    1,
    N64_BROWSER_PROFILE_V1.internalWidth / width,
    N64_BROWSER_PROFILE_V1.internalHeight / height
  );
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}
