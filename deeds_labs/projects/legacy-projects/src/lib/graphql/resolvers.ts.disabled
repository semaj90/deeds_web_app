import { drizzle } from 'drizzle-orm/node-postgres';
import { LocalLLMService } from '$lib/ai/local-llm-service';
import { cases, documents } from '$lib/server/db/schema-postgres';
import { eq, sql } from 'drizzle-orm';
import type { GraphQLResolveInfo } from 'graphql';

// Simple resolvers without GraphQL complexity
export const resolvers = {
  Query: {
    async searchDocuments(_: any, { query, filters }: any, ctx: any) {
      // Use local Gemma3 for embedding
      const embedding = await ctx.llm.embed(query);
      
      // PGVector search
      const results = await ctx.db
        .select()
        .from(documents)
        .where(
          sql`embedding <-> ${embedding} < 0.5`
        )
        .orderBy(sql`embedding <-> ${embedding}`)
        .limit(20);
      
      // Add relevance scores
      return results.map((doc: any, index: number) => ({
        ...doc,
        relevanceScore: 1 - (index * 0.05) // Simple scoring
      }));
    },
    
    async analyzeCase(_: any, { caseId, options }: any, ctx: any) {
      const caseData = await ctx.db.query.cases.findFirst({
        where: eq(cases.id, caseId),
        with: { documents: true },
      });
      
      if (!caseData) {
        throw new Error('Case not found');
      }
      
      // Use Gemma3 for analysis
      const prompt = `Analyze this legal case:
Title: ${caseData.title}
Content: ${caseData.content}
Documents: ${caseData.documents?.length || 0}

Provide:
1. Key legal issues
2. Risk assessment
3. Recommended strategy`;
      
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma3-legal:latest',
          prompt,
          stream: false,
          options: {
            temperature: 0.1,
            num_predict: 1024,
          }
        })
      });
      
      const data = await response.json();
      
      return {
        caseId,
        analysisType: options?.type || 'comprehensive',
        result: data.response,
        confidence: 0.85,
        metadata: {
          model: 'gemma3-legal',
          duration: data.total_duration,
        }
      };
    },
  },
  
  Mutation: {
    async uploadDocument(_: any, { file, metadata }: any, ctx: any) {
      // Process document with Gemma3
      const text = file.content; // Assuming text content
      const chunks = await ctx.llm.splitText(text);
      
      // Batch embed
      const embeddings = await Promise.all(
        chunks.map(chunk => ctx.llm.embed(chunk))
      );
      
      // Store in database
      const documents = chunks.map((chunk, i) => ({
        content: chunk,
        embedding: embeddings[i],
        metadata,
      }));
      
      await ctx.db.insert(documentsTable).values(documents);
      
      return {
        success: true,
        documentCount: documents.length
      };
    },
  },
  
  Subscription: {
    analysisProgress: {
      subscribe: async function* (_: any, { taskId }: any, ctx: any) {
        // Simple progress simulation
        for (let i = 0; i <= 100; i += 10) {
          yield {
            analysisProgress: {
              taskId,
              progress: i,
              status: i < 100 ? 'processing' : 'complete',
            }
          };
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      },
    },
  },
};

// Export table references
const documentsTable = documents;
