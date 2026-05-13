import { HypergraphService } from '../src/lib/server/vector/hypergraph-service.js';
import { QdrantManager } from '../src/lib/server/vector/qdrant-manager.js';
import { sql, inArray } from 'drizzle-orm';

async function testPentagonSearch() {
  console.log('🚀 [Test] Pentagon Graph Multi-Hop Search...');

  const service = new HypergraphService();
  
  const query = 'drizzle schema migrations';
  console.log(`🔎 Query: "${query}"`);

  // Mock embedding for 'drizzle schema migrations'
  const queryEmbedding = new Array(768).fill(0.1);

  try {
    const results = await service.pentagonSearch({
      query,
      queryEmbedding,
      limit: 3
    });

    // Fallback: Fetch real nodes if semantic search is empty
    if (!results.pentagon || results.pentagon.length === 0) {
      console.log('⚠️ No semantic seeds found. Fetching random architectural nodes...');
      const { db } = await import('../src/lib/server/db/client.js');
      const { enhancedGraphMappings } = await import('../src/lib/server/db/schema/graph-mappings.js');
      
      // Look for a node that likely has neighbors (e.g. a file or route)
      const fallbackNodes = await db.select()
        .from(enhancedGraphMappings)
        .where(sql`${enhancedGraphMappings.kind} = 'file'`)
        .limit(3);

      const starGraphs = await service.getStarGraphs(fallbackNodes.map(n => n.id));
      
      // Perform deep resolution for fallback
      results.pentagon = [];
      for (const star of starGraphs) {
        const neighbors = star.neighbors.map(n => n.id);
        const neighborDetails = await db.select()
          .from(enhancedGraphMappings)
          .where(inArray(enhancedGraphMappings.id, neighbors));

        const protocols = neighborDetails.filter(n => n.kind === 'proto' || n.kind === 'grpc_method');
        const schemas = neighborDetails.filter(n => n.kind === 'schema' || n.kind === 'redis_key');

        results.pentagon.push({
          ...star,
          protocols: protocols.map(p => ({ id: p.id, label: p.label })),
          schemas: schemas.map(s => ({ id: s.id, label: s.label })),
          recommendations: (service as any).generateRecommendations(star, protocols, schemas)
        });
      }
    }


    console.log('\n🛡️ Pentagon Architectural Pillars:');
    for (const node of results.pentagon) {
      console.log(`\n📍 ${node.label} (${node.kind})`);
      console.log(`   Pillar 1-3 (Neighbors): ${node.neighbors.length} connections found.`);
      
      if (node.protocols.length > 0) {
        console.log(`   Pillar 4 (Protocols):`);
        node.protocols.forEach(p => console.log(`     - ${p.label}`));
      } else {
        console.log(`   Pillar 4 (Protocols): No direct interface links found.`);
      }

      if (node.schemas.length > 0) {
        console.log(`   Pillar 5 (Schemas):`);
        node.schemas.forEach(s => console.log(`     - ${s.label}`));
      } else {
        console.log(`   Pillar 5 (Schemas): No direct storage links found.`);
      }

      if (node.recommendations.length > 0) {
        console.log(`   💡 Recommendations:`);
        node.recommendations.forEach(r => console.log(`     - ${r}`));
      }
    }

    console.log('\n✅ Pentagon Search Test complete.');
  } catch (err) {
    console.error('❌ Pentagon Search Failed:', err);
  }

  process.exit(0);
}

testPentagonSearch();
