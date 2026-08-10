export type TopologyCoordinate4 = readonly [
  somX: number,
  somY: number,
  authorityNorm: number,
  entropyUtilityNorm: number
];

export interface QuantizedTopology4 {
  somX: number;
  somY: number;
  authorityBin: number;
  entropyBin: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function validateTopologyCoordinate4(z: TopologyCoordinate4): void {
  if (z.length !== 4 || z.some((x) => !Number.isFinite(x))) throw new Error('invalid topology4');
  if (!Number.isInteger(z[0]) || !Number.isInteger(z[1])) throw new Error('SOM coordinates must be integer cells');
}

export function quantizeTopology4(
  z: TopologyCoordinate4,
  bins = 8
): QuantizedTopology4 {
  validateTopologyCoordinate4(z);
  if (!Number.isInteger(bins) || bins < 2) throw new Error('bins must be >= 2');
  const q = (x: number) => Math.min(bins - 1, Math.floor(clamp01(x) * bins));
  return { somX: z[0], somY: z[1], authorityBin: q(z[2]), entropyBin: q(z[3]) };
}
