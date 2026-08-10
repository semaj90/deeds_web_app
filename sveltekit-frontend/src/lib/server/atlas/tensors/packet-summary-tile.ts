export interface NumericPacketTileRow {
  packetKey: string;
  centroidId: number;
  somX: number;
  somY: number;
  authority: number;
  entropyUtility: number;
  feature5: readonly [number, number, number, number, number];
}

export interface EvidencePacketTileRow {
  packetKey: string;
  title?: string;
  summary?: string;
  sourceRefs: readonly string[];
  okfConceptIds: readonly string[];
  graphPathRefs: readonly string[];
}

/** Keep evidence text off the GPU until numeric narrowing returns packet keys. */
export function joinEvidence(
  packetKeys: readonly string[],
  evidence: ReadonlyMap<string, EvidencePacketTileRow>
): EvidencePacketTileRow[] {
  return packetKeys.map((key) => evidence.get(key)).filter((x): x is EvidencePacketTileRow => Boolean(x));
}
