export interface PacketIdentityJoinCandidate {
  packetKey?: string | null;
  packet_key?: string | null;
  sourceRef?: string | null;
  source_ref?: string | null;
  filePath?: string | null;
  stableKey?: string | null;
}

export interface PacketIdentityJoinMeta {
  packetKeys: string[];
  sourceRefs: string[];
  packetKeyMissing: number;
  pathOnlyCandidates: number;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)),
  ];
}

export function readPacketKey(candidate: PacketIdentityJoinCandidate): string | null {
  const value = candidate.packetKey ?? candidate.packet_key ?? null;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function readSourceRef(candidate: PacketIdentityJoinCandidate): string | null {
  const value =
    candidate.sourceRef ?? candidate.source_ref ?? candidate.filePath ?? candidate.stableKey ?? null;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function collectPacketIdentityJoinMeta(
  candidates: Array<PacketIdentityJoinCandidate | Record<string, unknown>>
): PacketIdentityJoinMeta {
  const packetKeys: string[] = [];
  const sourceRefs: string[] = [];
  let packetKeyMissing = 0;
  let pathOnlyCandidates = 0;

  for (const candidate of candidates) {
    const packetKey = readPacketKey(candidate as PacketIdentityJoinCandidate);
    const sourceRef = readSourceRef(candidate as PacketIdentityJoinCandidate);
    if (packetKey) packetKeys.push(packetKey);
    if (sourceRef) sourceRefs.push(sourceRef);
    if (!packetKey) packetKeyMissing += 1;
    if (!packetKey && sourceRef) pathOnlyCandidates += 1;
  }

  return {
    packetKeys: uniqueStrings(packetKeys),
    sourceRefs: uniqueStrings(sourceRefs),
    packetKeyMissing,
    pathOnlyCandidates,
  };
}
