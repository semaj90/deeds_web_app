function normalizeSourceRef(value) {
  return String(value ?? '').trim().replace(/^sveltekit-frontend\//, '');
}

export function classifyExactQdrantPacketLinksV1(missingPackets, pointsByPacket) {
  const packetsByKey = new Map();
  for (const packet of missingPackets) {
    const rows = packetsByKey.get(packet.packet_key) ?? [];
    rows.push(packet);
    packetsByKey.set(packet.packet_key, rows);
  }

  const eligible = [];
  let ambiguousSkipped = 0;
  let sourceRefMismatchSkipped = 0;

  for (const [packetKey, points] of pointsByPacket) {
    const packets = packetsByKey.get(packetKey) ?? [];
    if (packets.length !== 1 || points.length !== 1) {
      ambiguousSkipped += 1;
      continue;
    }

    const packetSourceRef = normalizeSourceRef(packets[0].source_ref);
    const pointSourceRef = normalizeSourceRef(points[0].sourceRef);
    if (!packetSourceRef || !pointSourceRef || packetSourceRef !== pointSourceRef) {
      sourceRefMismatchSkipped += 1;
      continue;
    }

    eligible.push({
      packetKey,
      pointId: points[0].pointId,
      sourceRef: packets[0].source_ref,
      packetRow: packets[0],
    });
  }

  return { eligible, ambiguousSkipped, sourceRefMismatchSkipped };
}
