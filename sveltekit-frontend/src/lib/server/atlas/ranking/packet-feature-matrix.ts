export const PACKET_FEATURE_NAMES = [
  'semanticScore',
  'centroidAffinity',
  'quaternionAffinity',
  'graphAuthority',
  'demandUtility',
  'executionUtility',
  'recency',
  'cacheHotness',
  'normalizedCost',
] as const;

export type PacketFeatureName =
  (typeof PACKET_FEATURE_NAMES)[number];

export const PACKET_FEATURE_COUNT =
  PACKET_FEATURE_NAMES.length;

export type PacketFeatureRow = {
  packetKey: string;
  semanticScore: number;
  centroidAffinity: number;
  quaternionAffinity: number;
  graphAuthority: number;
  demandUtility: number;
  executionUtility: number;
  recency: number;
  cacheHotness: number;
  normalizedCost: number;
};

export type PacketFeatureMatrix = {
  packetKeys: string[];
  rows: number;
  cols: number;
  values: Float32Array;
};

export type PacketFeatureSource = {
  packetKey: string;
  vector: readonly number[];
  tokenCount: number;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function normalizeDemandUtility(input: {
  hits24h: number;
  avgRerank: number;
  maxObservedHotScore?: number;
}): number {
  const hits24h = Math.max(0, Number(input.hits24h) || 0);
  const avgRerank = clamp01(Number(input.avgRerank) || 0);
  const hotScore = hits24h * avgRerank;
  const maxObservedHotScore = Math.max(
    Number.EPSILON,
    Number(input.maxObservedHotScore) || 1,
  );

  return clamp01(hotScore / maxObservedHotScore);
}

export function sanitizePacketFeatureRow(
  row: PacketFeatureRow,
): PacketFeatureRow {
  if (!row.packetKey || row.packetKey.trim().length === 0) {
    throw new Error('packetKey is required');
  }

  return {
    packetKey: row.packetKey,
    semanticScore: clamp01(row.semanticScore),
    centroidAffinity: clamp01(row.centroidAffinity),
    quaternionAffinity: clamp01(row.quaternionAffinity),
    graphAuthority: clamp01(row.graphAuthority),
    demandUtility: clamp01(row.demandUtility),
    executionUtility: clamp01(row.executionUtility),
    recency: clamp01(row.recency),
    cacheHotness: clamp01(row.cacheHotness),
    normalizedCost: clamp01(row.normalizedCost),
  };
}

export function buildPacketFeatureMatrix(
  rows: readonly PacketFeatureRow[],
): PacketFeatureMatrix {
  const sanitized = rows.map(sanitizePacketFeatureRow);
  const values = new Float32Array(
    sanitized.length * PACKET_FEATURE_COUNT,
  );
  const packetKeys: string[] = [];

  for (let rowIndex = 0; rowIndex < sanitized.length; rowIndex += 1) {
    const row = sanitized[rowIndex];
    packetKeys.push(row.packetKey);

    const base = rowIndex * PACKET_FEATURE_COUNT;
    values[base + 0] = row.semanticScore;
    values[base + 1] = row.centroidAffinity;
    values[base + 2] = row.quaternionAffinity;
    values[base + 3] = row.graphAuthority;
    values[base + 4] = row.demandUtility;
    values[base + 5] = row.executionUtility;
    values[base + 6] = row.recency;
    values[base + 7] = row.cacheHotness;
    values[base + 8] = row.normalizedCost;
  }

  return {
    packetKeys,
    rows: sanitized.length,
    cols: PACKET_FEATURE_COUNT,
    values,
  };
}

function deriveDemandUtilityFromPacket(source: PacketFeatureSource): number {
  const lexicalSignal = clamp01(Number(source.vector[0]) || 0);
  const denseSignal = clamp01(Number(source.vector[1]) || 0);

  return normalizeDemandUtility({
    hits24h: Math.max(0, Math.round(lexicalSignal * 100)),
    avgRerank: denseSignal,
    maxObservedHotScore: 100,
  });
}

export function buildPacketFeatureRowsFromPackets(
  packets: readonly PacketFeatureSource[],
): PacketFeatureRow[] {
  return packets.map((packet) => ({
    packetKey: packet.packetKey,
    semanticScore: clamp01(Number(packet.vector[1]) || 0),
    centroidAffinity: clamp01(Number(packet.vector[4]) || 0),
    quaternionAffinity: clamp01(Number(packet.vector[2]) || 0),
    graphAuthority: clamp01(Number(packet.vector[3]) || 0),
    demandUtility: deriveDemandUtilityFromPacket(packet),
    executionUtility: clamp01(Number(packet.vector[6]) || 0),
    recency: clamp01(Number(packet.vector[5]) || 0),
    cacheHotness: clamp01(Number(packet.vector[7]) || 0),
    normalizedCost: clamp01(Number(packet.vector[8]) || 0),
  }));
}

export function buildPacketFeatureMatrixFromPackets(
  packets: readonly PacketFeatureSource[],
): PacketFeatureMatrix {
  return buildPacketFeatureMatrix(buildPacketFeatureRowsFromPackets(packets));
}

export function getPacketFeatureRow(
  matrix: PacketFeatureMatrix,
  rowIndex: number,
): Float32Array {
  if (
    !Number.isInteger(rowIndex) ||
    rowIndex < 0 ||
    rowIndex >= matrix.rows
  ) {
    throw new RangeError(`Invalid matrix row index: ${rowIndex}`);
  }

  const start = rowIndex * matrix.cols;
  return matrix.values.slice(start, start + matrix.cols);
}
