import neo4j from 'neo4j-driver';

const driver = neo4j.driver('bolt://127.0.0.1:7687', neo4j.auth.basic('neo4j', 'neo4j123'));
const session = driver.session();

try {
  const query = `
    MATCH (c:Concept)
    WHERE c.id IN $conceptIds
    CALL {
      WITH c
      OPTIONAL MATCH (c)<-[:SUPPORTS]-(p:Packet)
      RETURN p, 1.0 as directScore, 'direct' as pathType
      UNION
      WITH c
      OPTIONAL MATCH (c)<-[:SUPPORTS]-(p1:Packet)
      WITH c, p1 WHERE p1 IS NOT NULL
      OPTIONAL MATCH (p1)-[r:SIMILAR_TOPOLOGY*1..2]-(p2)
      WHERE p2 <> p1
      RETURN p2 as p, 0.6 as directScore, 'topology' as pathType
    }
    WITH p, collect(DISTINCT c.id) AS matched_concepts, MAX(directScore) as score
    WHERE p IS NOT NULL
    RETURN
      p.key AS id,
      score,
      coalesce(p.summary, '') AS text,
      size(matched_concepts) AS pathCount
    ORDER BY score DESC
    LIMIT toInteger($topK)
  `;
  const result = await session.run(query, {
    conceptIds: ['database_orm', 'infrastructure_config'],
    topK: 5
  });
  console.log('Query Results:', JSON.stringify(result.records.map(r => ({
    id: r.get('id'),
    score: r.get('score'),
    text: r.get('text'),
    pathCount: r.get('pathCount').toNumber()
  })), null, 2));
} catch (err) {
  console.error('Error running query:', err);
} finally {
  await session.close();
  await driver.close();
}
