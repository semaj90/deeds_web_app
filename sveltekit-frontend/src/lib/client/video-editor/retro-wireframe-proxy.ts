/**
 * Retro Fixed-Point 16-Bit Wireframe Proxy (Donkey Kong Country Style)
 *
 * Encodes 3D spatial bounding boxes and scene reticles using quantized 16-bit integers
 * (Int16Array fixed-point coordinates) instead of heavy 32-bit floating point arrays.
 *
 * Characteristics:
 * - Halves vertex buffer memory bandwidth (2 bytes vs 4 bytes per coordinate).
 * - Fixed-point scaling factor: 1000 = 1.0 meter (0.001m millimeter precision).
 * - LINE_LIST topology for rendering wireframe cubes, suspect bounding reticles,
 *   and CCTV camera sightlines directly over decoded video frames with zero GC overhead.
 */

export const FIXED_POINT_SCALE = 1000; // 1 unit = 1mm

export interface FixedPointWireframeBox {
  readonly id: string;
  readonly label: string;
  readonly colorIndex: number; // 4-bit palette index (0-15)
  readonly vertices: Int16Array; // 8 vertices x 3 axes = 24 int16 values
  readonly lineIndices: Uint16Array; // 12 edges x 2 vertices = 24 uint16 indices
  readonly confidence: number;
}

/**
 * Creates a fixed-point 16-bit bounding box from center position and dimensions in meters.
 */
export function createFixedPointBox(
  id: string,
  label: string,
  centerX: number,
  centerY: number,
  centerZ: number,
  sizeX: number,
  sizeY: number,
  sizeZ: number,
  confidence = 1.0,
  colorIndex = 1
): FixedPointWireframeBox {
  const hx = sizeX / 2;
  const hy = sizeY / 2;
  const hz = sizeZ / 2;

  // 8 corners of a 3D box
  const corners = [
    [centerX - hx, centerY - hy, centerZ - hz],
    [centerX + hx, centerY - hy, centerZ - hz],
    [centerX + hx, centerY + hy, centerZ - hz],
    [centerX - hx, centerY + hy, centerZ - hz],
    [centerX - hx, centerY - hy, centerZ + hz],
    [centerX + hx, centerY - hy, centerZ + hz],
    [centerX + hx, centerY + hy, centerZ + hz],
    [centerX - hx, centerY + hy, centerZ + hz],
  ];

  const vertices = new Int16Array(24);
  for (let i = 0; i < 8; i++) {
    vertices[i * 3 + 0] = Math.round(corners[i][0] * FIXED_POINT_SCALE);
    vertices[i * 3 + 1] = Math.round(corners[i][1] * FIXED_POINT_SCALE);
    vertices[i * 3 + 2] = Math.round(corners[i][2] * FIXED_POINT_SCALE);
  }

  // 12 edges (pairs of vertex indices) for LINE_LIST rendering
  const lineIndices = new Uint16Array([
    // Bottom face
    0, 1, 1, 2, 2, 3, 3, 0,
    // Top face
    4, 5, 5, 6, 6, 7, 7, 4,
    // Vertical pillars
    0, 4, 1, 5, 2, 6, 3, 7,
  ]);

  return {
    id,
    label,
    colorIndex: colorIndex & 0x0f,
    vertices,
    lineIndices,
    confidence,
  };
}

/**
 * Projects a 16-bit fixed point wireframe box into 2D viewport coordinates.
 */
export function projectFixedPointBox2D(
  box: FixedPointWireframeBox,
  viewportWidth: number,
  viewportHeight: number,
  cameraZ = 2.0
): Array<[number, number, number, number]> {
  const lines: Array<[number, number, number, number]> = [];
  const projected = new Float32Array(8 * 2);

  for (let i = 0; i < 8; i++) {
    const x = box.vertices[i * 3 + 0] / FIXED_POINT_SCALE;
    const y = box.vertices[i * 3 + 1] / FIXED_POINT_SCALE;
    const z = box.vertices[i * 3 + 2] / FIXED_POINT_SCALE + cameraZ;

    const fov = 500;
    const projX = (x / Math.max(0.1, z)) * fov + viewportWidth / 2;
    const projY = (-y / Math.max(0.1, z)) * fov + viewportHeight / 2;

    projected[i * 2 + 0] = projX;
    projected[i * 2 + 1] = projY;
  }

  for (let i = 0; i < box.lineIndices.length; i += 2) {
    const v1 = box.lineIndices[i];
    const v2 = box.lineIndices[i + 1];
    lines.push([
      projected[v1 * 2 + 0],
      projected[v1 * 2 + 1],
      projected[v2 * 2 + 0],
      projected[v2 * 2 + 1],
    ]);
  }

  return lines;
}
