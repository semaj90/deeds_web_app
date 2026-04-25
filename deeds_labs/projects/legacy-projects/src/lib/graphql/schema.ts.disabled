import { GraphQLSchema } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import SchemaBuilder from '@pothos/core';
import DrizzlePlugin from '@pothos/plugin-drizzle';
import { db } from '$lib/server/db';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
type DB = PostgresJsDatabase<typeof import('$lib/server/db/schema-postgres')>;
import { LocalLLMService } from '$lib/ai/local-llm-service';
import { vectorSearch, extractRelationships } from '$lib/services/vectorService';
import { cases, documents as documentsTable } from '$lib/server/db/schema-postgres';

// Initialize builder with plugins
const builder = new SchemaBuilder<{
  DrizzleSchema: typeof import('$lib/server/db/schema-postgres');
  Context: {
    user?: { id: string };
    db: DB;
    llm: LocalLLMService;
  };
}>({
  plugins: [DrizzlePlugin],
  drizzle: {
    client: db,
  },
});

// Define GraphQL types
const CaseResult = builder.objectType('CaseResult', {
  fields: (t) => ({
    id: t.exposeString('id'),
    title: t.exposeString('title'),
    content: t.exposeString('content', { nullable: true }),
    relevanceScore: t.exposeFloat('relevanceScore', { nullable: true }),
    metadata: t.field({
      type: 'JSON',
      nullable: true,
      resolve: (parent) => parent.metadata,
    }),
  }),
});

const AnalysisResult = builder.objectType('AnalysisResult', {
  fields: (t) => ({
    caseId: t.exposeString('caseId'),
    analysisType: t.exposeString('analysisType'),
    result: t.exposeString('result'),
    confidence: t.exposeFloat('confidence'),
    metadata: t.field({
      type: 'JSON',
      nullable: true,
      resolve: (parent) => parent.metadata,
    }),
  }),
});

// Multi-Agent Analysis Types
const PersonOfInterest = builder.objectType('PersonOfInterest', {
  fields: (t) => ({
    name: t.exposeString('name'),
    role: t.exposeString('role'),
    details: t.field({
      type: 'JSON',
      nullable: true,
      resolve: (parent) => parent.details,
    }),
    confidence: t.exposeFloat('confidence'),
    sourceContext: t.exposeString('sourceContext', { nullable: true }),
  }),
});

const PersonRelationship = builder.objectType('PersonRelationship', {
  fields: (t) => ({
    person1: t.exposeString('person1'),
    person2: t.exposeString('person2'),
    relationship: t.exposeString('relationship'),
    context: t.exposeString('context', { nullable: true }),
    confidence: t.exposeFloat('confidence'),
  }),
});

const TimelineEvent = builder.objectType('TimelineEvent', {
  fields: (t) => ({
    date: t.exposeString('date'),
    time: t.exposeString('time', { nullable: true }),
    event: t.exposeString('event'),
    persons: t.exposeStringList('persons', { nullable: true }),
    evidenceSource: t.exposeString('evidenceSource', { nullable: true }),
    confidence: t.exposeFloat('confidence', { nullable: true }),
    category: t.exposeString('category', { nullable: true }),
  }),
});

const MultiAgentAnalysis = builder.objectType('MultiAgentAnalysis', {
  fields: (t) => ({
    id: t.exposeString('id'),
    caseId: t.exposeString('caseId'),
    evidenceAnalysis: t.field({
      type: 'JSON',
      nullable: true,
      resolve: (parent) => parent.evidenceAnalysis,
    }),
    personsData: t.field({
      type: [PersonOfInterest],
      nullable: true,
      resolve: (parent) => parent.personsData?.persons || [],
    }),
    relationships: t.field({
      type: [PersonRelationship],
      nullable: true,
      resolve: (parent) => parent.personsData?.relationships || [],
    }),
    timelineEvents: t.field({
      type: [TimelineEvent],
      nullable: true,
      resolve: (parent) => parent.evidenceAnalysis?.timelineEvents || [],
    }),
    caseSynthesis: t.field({
      type: 'JSON',
      nullable: true,
      resolve: (parent) => parent.caseSynthesis,
    }),
    timestamp: t.exposeString('timestamp'),
    confidence: t.exposeFloat('confidence', { nullable: true }),
  }),
});

// JSON scalar type
builder.scalarType('JSON', {
  serialize: (value) => value,
  parseValue: (value) => value,
});

// Query type
builder.queryType({
  fields: (t) => ({
    // Legal case queries with local embeddings
    searchCases: t.field({
      type: [CaseResult],
      args: {
        query: t.arg.string({ required: true }),
        limit: t.arg.int({ defaultValue: 10 }),
      },
      resolve: async (parent, args, ctx) => {
        // Use local Gemma3 embeddings via Ollama
        const embedding = await ctx.llm.embed(args.query);
        return vectorSearch(embedding, args.limit);
      },
    }),
    
    // AI analysis with Gemma3
    analyzeCaseWithAI: t.field({
      type: AnalysisResult,
      args: {
        caseId: t.arg.string({ required: true }),
        analysisType: t.arg.string({ required: true }),
      },
      resolve: async (parent, args, ctx) => {
        return ctx.llm.analyzeCase(args.caseId, args.analysisType);
      },
    }),
    
    // Get case by ID
    getCase: t.field({
      type: CaseResult,
      nullable: true,
      args: {
        id: t.arg.string({ required: true }),
      },
      resolve: async (parent, args, ctx) => {
        const result = await ctx.db
          .select()
          .from(cases)
          .where(eq(cases.id, args.id))
          .limit(1);
        return result[0] || null;
      },
    }),

    // Get multi-agent analysis results
    getMultiAgentAnalysis: t.field({
      type: [MultiAgentAnalysis],
      args: {
        caseId: t.arg.string({ required: true }),
        limit: t.arg.int({ defaultValue: 10 }),
      },
      resolve: async (parent, args, ctx) => {
        // This would typically fetch from a dedicated analysis table
        // For now, returning mock data structure
        return [];
      },
    }),
  }),
});

// Mutation type
builder.mutationType({
  fields: (t) => ({
    // Upload and process document
    uploadDocument: t.field({
      type: builder.objectType('UploadResult', {
        fields: (t) => ({
          success: t.exposeBoolean('success'),
          documentId: t.exposeString('documentId', { nullable: true }),
          documentCount: t.exposeInt('documentCount'),
          error: t.exposeString('error', { nullable: true }),
        }),
      }),
      args: {
        content: t.arg.string({ required: true }),
        title: t.arg.string({ required: true }),
        metadata: t.arg({ type: 'JSON', required: false }),
      },
      resolve: async (parent, args, ctx) => {
        try {
          // Process document with local LLM
          const chunks = await ctx.llm.splitText(args.content);
          
          // Batch embed with local model
          const embeddings = await ctx.llm.embedBatch(chunks);
          
          // Store in database
          const documents = chunks.map((chunk, i) => ({
            content: chunk,
            embedding: embeddings[i],
            title: args.title,
            metadata: args.metadata || {},
          }));
          
          const inserted = await ctx.db.insert(documentsTable).values(documents).returning();
          
          // Extract relationships for graph processing
          const relationships = await extractRelationships(args.content);
          
          return {
            success: true,
            documentId: inserted[0]?.id,
            documentCount: documents.length,
            error: null,
          };
        } catch (error: any) {
          console.error('Upload error:', error);
          return {
            success: false,
            documentId: null,
            documentCount: 0,
            error: error.message,
          };
        }
      },
    }),
    
    // Create new case
    createCase: t.field({
      type: CaseResult,
      args: {
        title: t.arg.string({ required: true }),
        content: t.arg.string({ required: false }),
        metadata: t.arg({ type: 'JSON', required: false }),
      },
      resolve: async (parent, args, ctx) => {
        const [newCase] = await ctx.db
          .insert(cases)
          .values({
            title: args.title,
            content: args.content || '',
            status: 'active',
            metadata: args.metadata || {},
          })
          .returning();
        return newCase;
      },
    }),

    // Trigger multi-agent evidence analysis
    analyzeEvidenceWithAgents: t.field({
      type: MultiAgentAnalysis,
      args: {
        caseId: t.arg.string({ required: true }),
        evidenceContent: t.arg.string({ required: true }),
        evidenceTitle: t.arg.string({ required: true }),
        evidenceType: t.arg.string({ required: false }),
      },
      resolve: async (parent, args, ctx) => {
        try {
          // In a real implementation, this would:
          // 1. Save evidence to database
          // 2. Trigger the shell script pipeline
          // 3. Wait for completion and parse results
          // 4. Store analysis results in database
          // 5. Return structured analysis data

          const analysisId = `analysis_${args.caseId}_${Date.now()}`;
          const timestamp = new Date().toISOString();

          // Mock analysis result structure
          const mockAnalysis = {
            id: analysisId,
            caseId: args.caseId,
            evidenceAnalysis: {
              documentType: args.evidenceType || 'document',
              keyFacts: [
                'Evidence contains witness testimony',
                'Timeline event identified for investigation'
              ],
              timelineEvents: [
                {
                  date: '2024-07-28',
                  time: '14:30',
                  event: 'Witness statement recorded',
                  persons: ['John Doe'],
                  evidenceSource: args.evidenceTitle,
                  confidence: 0.95,
                  category: 'witness'
                }
              ],
              evidenceItems: ['Written statement', 'Digital recording'],
              concerns: [],
              confidence: 0.90
            },
            personsData: {
              persons: [
                {
                  name: 'John Doe',
                  role: 'witness',
                  details: {
                    age: 35,
                    occupation: 'Accountant'
                  },
                  confidence: 0.85,
                  sourceContext: 'Mentioned in witness statement'
                }
              ],
              relationships: []
            },
            caseSynthesis: {
              caseStrength: 'moderate',
              keyFindings: ['New witness testimony obtained'],
              nextSteps: ['Schedule follow-up interview'],
              confidence: 0.82
            },
            timestamp,
            confidence: 0.88
          };

          // In production: store in database and return actual results
          return mockAnalysis;
        } catch (error: any) {
          throw new Error(`Multi-agent analysis failed: ${error.message}`);
        }
      },
    }),

    // Store multi-agent analysis results
    storeMultiAgentAnalysis: t.field({
      type: builder.objectType('AnalysisStoreResult', {
        fields: (t) => ({
          success: t.exposeBoolean('success'),
          analysisId: t.exposeString('analysisId', { nullable: true }),
          error: t.exposeString('error', { nullable: true }),
        }),
      }),
      args: {
        caseId: t.arg.string({ required: true }),
        analysisData: t.arg({ type: 'JSON', required: true }),
      },
      resolve: async (parent, args, ctx) => {
        try {
          // In production: store in dedicated multi_agent_analyses table
          const analysisId = `stored_${args.caseId}_${Date.now()}`;
          
          return {
            success: true,
            analysisId,
            error: null,
          };
        } catch (error: any) {
          return {
            success: false,
            analysisId: null,
            error: error.message,
          };
        }
      },
    }),
  }),
});

// Subscription type
builder.subscriptionType({
  fields: (t) => ({
    analysisProgress: t.field({
      type: builder.objectType('AnalysisProgress', {
        fields: (t) => ({
          taskId: t.exposeString('taskId'),
          progress: t.exposeFloat('progress'),
          status: t.exposeString('status'),
          message: t.exposeString('message', { nullable: true }),
        }),
      }),
      args: {
        taskId: t.arg.string({ required: true }),
      },
      subscribe: async function* (parent, args, ctx) {
        // Subscribe to Redis channel for progress updates
        const channel = `analysis:${args.taskId}`;
        
        // Mock subscription for now - replace with actual Redis subscription
        for (let i = 0; i <= 100; i += 10) {
          yield {
            taskId: args.taskId,
            progress: i / 100,
            status: i < 100 ? 'processing' : 'complete',
            message: `Processing... ${i}%`,
          };
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      },
      resolve: (payload) => payload,
    }),
  }),
});

// Build and export schema
export const schema = builder.toSchema();
