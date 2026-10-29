export async function expandPacketKeysByConcept(
  packetKeys: string[],
  conceptIds: string[],
  limit: number,
): Promise<string[]> {
  try {
    const neo4j = await import('neo4j-driver');
    const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
    const driver = getNeo4jDriver();
    const session = driver.session({ defaultAccessMode: neo4j.default.session.READ });

    try {
      const result = await session.run(
        `
        MATCH (p:Packet)-[:USED_CONCEPT]->(c:Concept)
        WHERE c.concept_id IN $conceptIds
          AND NOT p.packet_key IN $existingKeys
        RETURN DISTINCT p.packet_key AS packet_key, count(c) AS shared_concepts
        ORDER BY shared_concepts DESC
        LIMIT $limit
        `,
        { conceptIds, existingKeys: packetKeys, limit },
      );
      return result.records.map((record) => record.get('packet_key') as string).filter(Boolean);
    } finally {
      await session.close();
    }
  } catch {
    return [];
  }
}
