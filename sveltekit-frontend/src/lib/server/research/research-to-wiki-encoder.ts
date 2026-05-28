import { couchPut, type ResearchNote } from '../indexer/karpathy-wiki.js';
import { generateSingleEmbedding } from '../grpc/embedding-client.js';
import { qdrant } from '../vector/qdrant-manager.js';
import { getNeo4jDriver } from '../neo4j-driver.js';

/**
 * Research-to-Wiki Encoder: Bridges external research findings into the
 * durable internal memory layer (CouchDB karpathy_wiki + Qdrant + Neo4j).
 */
export async function encodeResearchToWiki(params: {
  query: string;
  outsideSources: Array<{ title: string; url: string; snippet: string }>;
  internalAreas: string[];
  confidence: number;
  pipeline: string;
  unresolvedQuestions?: string[];
}) {
  const note: ResearchNote = {
    type: 'research',
    query: params.query,
    outsideSources: params.outsideSources.slice(0, 10),
    internalAreas: params.internalAreas.slice(0, 15),
    deltasFromPrior: [],
    confidence: params.confidence,
    pipeline: params.pipeline,
    unresolvedQuestions: params.unresolvedQuestions ?? [],
    generatedAt: new Date().toISOString(),
  };

  // 1. Persist to CouchDB (rev-safe via couchPut)
  await couchPut(note);

  // 2. Embed summary and store in Qdrant
  const summary = `${params.query} ${params.internalAreas.join(' ')}`;
  const embedding = await generateSingleEmbedding(summary);
  if (embedding.length > 0) {
    await qdrant.upsert({
      collection: 'synthesis_memory_768',
      wait: true,
      points: [
        {
          id: crypto.randomUUID(),
          vector: { content: embedding },
          payload: { ...note, vector_type: 'research_note' },
        },
      ],
    } as any);
  }

  // 3. Link in Neo4j Hypergraph
  try {
    const neo4j = getNeo4jDriver();
    const session = neo4j.session({ database: 'neo4j' });
    try {
      const noteId = `research:${params.query.slice(0, 60).replace(/\W+/g, '_')}`;
      await session.run(
        `
				MERGE (rn:ResearchNote {id: $noteId})
				SET rn.query = $query, rn.confidence = $confidence, rn.pipeline = $pipeline
				WITH rn
				UNWIND $areas AS area
				MERGE (f:Directory {path: area})
				MERGE (rn)-[:REFERENCES]->(f)
			`,
        {
          noteId,
          query: params.query,
          confidence: params.confidence,
          pipeline: params.pipeline,
          areas: params.internalAreas,
        }
      );
    } finally {
      await session.close();
    }
  } catch {
    // Neo4j unavailable — non-fatal
  }

  return { success: true, noteId: `research:${params.query.slice(0, 60).replace(/\W+/g, '_')}` };
}
