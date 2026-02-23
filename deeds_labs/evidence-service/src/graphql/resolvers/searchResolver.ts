import { generateEmbedding } from '../../services/embedding.js';
import { searchVectors } from '../../rag/qdrant.js';
import { db } from '../../db/drizzle.js';
import { evidences } from '../../db/schema.js';
import { inArray, eq } from 'drizzle-orm';

export const searchResolvers = {
  Query: {
    search: async (_: any, { query, caseId, limit = 10 }: any) => {
      // Generate embedding for search query
      const queryVector = await generateEmbedding(query);

      // Build filter
      const filter = caseId ? { caseId } : undefined;

      // Search Qdrant
      const qdrantResults = await searchVectors(queryVector, limit, filter);

      if (qdrantResults.length === 0) {
        return [];
      }

      // Get evidence details from database
      const evidenceIds = qdrantResults.map((r) => r.payload.evidenceId as string);
      const evidenceRecords = await db.select()
        .from(evidences)
        .where(inArray(evidences.id, evidenceIds));

      // Combine results
      const results = qdrantResults.map((r) => {
        const evidence = evidenceRecords.find((e) => e.id === r.payload.evidenceId);
        return {
          evidence,
          score: r.score,
        };
      }).filter((r) => r.evidence);

      return results;
    },
  },
};
