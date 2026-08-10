export interface TokenFeatureMap {
  tokenizerRevision: string;
  nativeTokenId: number;
  byteStart: number;
  byteEnd: number;
  engramKey?: number;
  astKind?: number;
  ontologyId?: number;
  domainId?: number;
  featureId?: string;
  packetKey?: string;
  entropy: number;
  surprisal: number;
}

export function assertTokenFeatureMap(row: TokenFeatureMap): void {
  if (!row.tokenizerRevision) throw new Error('tokenizerRevision required');
  if (!Number.isInteger(row.nativeTokenId) || row.nativeTokenId < 0) throw new Error('nativeTokenId must be uint-like');
  if (!Number.isInteger(row.byteStart) || !Number.isInteger(row.byteEnd) || row.byteStart < 0 || row.byteEnd < row.byteStart) {
    throw new Error('invalid byte span');
  }
  if (!Number.isFinite(row.entropy) || row.entropy < 0) throw new Error('entropy must be finite/non-negative');
  if (!Number.isFinite(row.surprisal) || row.surprisal < 0) throw new Error('surprisal must be finite/non-negative');
}

/** Atlas remapping is parallel metadata. It never rewrites model-facing token ids. */
export function remapKey(row: TokenFeatureMap): string {
  return [row.tokenizerRevision, row.nativeTokenId, row.byteStart, row.byteEnd, row.engramKey ?? '-'].join(':');
}
