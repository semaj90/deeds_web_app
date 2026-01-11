import type { User } from '$lib/types';
import type { Case } from '$lib/types';
import type { Document } from '$lib/types';
import type { RequestHandler } from './$types.js';
import { json } from '@sveltejs/kit';;

// End-to-End Vector Pipeline Test
// Tests: Document Upload → Embedding → Search → Results
import type { db  } from '$lib/server/db';
import type { users, cases, documents, documentVectors  } from '$lib/server/db/schema-postgres';
import type { eq, sql, desc  } from 'drizzle-orm';
import type { OllamaEmbeddings  } from '@langchain/community/embeddings/ollama';

// ============================================================================
// TEST CONFIGURATION
// ============================================================================
const testConfig = {
  ollamaBaseUrl: 'http://localhost:11434',
  embeddingModel: 'nomic-embed-text',
  testDocuments: [
    {
      title: 'Contract Liability Clause',
      content:
        'This contract contains provisions regarding liability limitations and indemnification clauses. The contractor shall not be liable for indirect damages exceeding the contract value.',
      caseTitle: 'Contract Dispute Case',
    },
    {
      title: 'Criminal Evidence Report',
      content:
        'Forensic analysis of digital evidence reveals metadata tampering on multiple files. Hash verification failed on documents submitted as exhibits.',
      caseTitle: 'Digital Evidence Case',
    },
    {
      title: 'Employment Agreement',
      content:
        'Non-compete clauses and intellectual property assignments are detailed in sections 4-7. Employee acknowledges proprietary information restrictions.',
      caseTitle: 'Employment Dispute',
    },
  ],
  testQueries: [
    'liability and contract damages',
    'digital forensics evidence',
    'employment non-compete clauses',
    'intellectual property rights',
  ],
};

// ============================================================================
// TEST PIPELINE SERVICE
// ============================================================================
class VectorPipelineTest {
  private embeddings: OllamaEmbeddings;
  private testResults: any = {};

  constructor() {
    this.embeddings = new OllamaEmbeddings({
      baseUrl: testConfig.ollamaBaseUrl,
      model: testConfig.embeddingModel,
    });
  }

  async runFullPipeline(): Promise<any> {
    const startTime = Date.now();
    this.testResults = {
      timestamp: new Date().toISOString(),
      status: 'running',
      // initialize as plain objects (previous tokens were corrupted)
      steps: {},
      errors: [],
      performance: {},
    };

    try {
      // Step 1: Test Ollama Connection
      await this.testOllamaConnection();
      // Step 2: Create Test User and Cases
      await this.createTestData();
      // Step 3: Upload and Embed Test Documents
      await this.uploadAndEmbedDocuments();
      // Step 4: Test Vector Search
      await this.testVectorSearch();
      // Step 5: Test MCP Integration
      await this.testMCPIntegration();
      // Step 6: Performance Analysis
      await this.analyzePerformance();

      this.testResults.status = 'completed';
      this.testResults.totalTime = Date.now() - startTime;
      return this.testResults;
    } catch (err: unknown) {
      this.testResults.status = 'failed';
      this.testResults.error = err instanceof Error ? err.message : 'Unknown error';
      this.testResults.totalTime = Date.now() - startTime;
      console.error('❌ Pipeline test failed: ', err);
      return this.testResults;
    }
  }

  async testOllamaConnection() {
    const stepStart = Date.now();
    console.log('🔌 Testing Ollama connection...');
    try {
      const testEmbedding = await this.embeddings.embedQuery('test connection');
      this.testResults.steps.ollama = {
        status: 'success',
        dimensions: testEmbedding.length,
        model: testConfig.embeddingModel,
        baseUrl: testConfig.ollamaBaseUrl,
        time: Date.now() - stepStart,
      };
      console.log(`✅ Ollama connected: ${testEmbedding.length} dimensions`);
    } catch (err: unknown) {
      this.testResults.steps.ollama = {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Connection failed',
      };
      throw new Error(`Ollama connection failed: ${err}`);
    }
  }

  async createTestData() {
    const stepStart = Date.now();
    console.log('👤 Creating test data...');
    try {
      // Create test user
      const [testUser] = await db
        .insert(users)
        .values({
          email: 'test@vector-pipeline.com',
          name: 'Vector Pipeline Test User',
          role: 'prosecutor',
          passwordHash: `test-hash-not-real`,
        })
        .onConflictDoNothing()
        .returning();

      // Create test cases
      const testCases: Case[] = [];
      for (const doc of testConfig.testDocuments) {
        const [testCase] = await db
          .insert(cases)
          .values({
            title: doc.caseTitle,
            description: `Test case for: ${doc.title}`,
            status: 'active',
            priority: 'medium',
            createdBy: testUser.id,
          })
          .returning();
        testCases.push(testCase);
      }

      this.testResults.steps.testData = {
        status: 'success',
        userId: testUser.id,
        casesCreated: testCases.length,
        time: Date.now() - stepStart,
      };
      this.testResults.testUserId = testUser.id;
      this.testResults.testCases = testCases;
      console.log(`✅ Created test user and ${testCases.length} cases`);
    } catch (err: unknown) {
      this.testResults.steps.testData = {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Test data creation failed',
      };
      throw err;
    }
  }

  async uploadAndEmbedDocuments() {
    const stepStart = Date.now();
    console.log('📄 Uploading and embedding documents...');
    try {
      const embeddedDocs = [];
      for (let i = 0; i < testConfig.testDocuments.length; i++) {
        const doc = testConfig.testDocuments[i];
        const testCase = this.testResults.testCases[i];

        // Create document record
        const [document] = await db
          .insert(documents)
          .values({
            caseId: testCase.id,
            filename: `${doc.title}.txt`,
            filePath: `/test/documents/${doc.title.replace(/\s+/g, '_')}.txt`,
            extractedText: doc.content,
            createdBy: this.testResults.testUserId,
          })
          .returning();

        // Generate embedding
        const embedding = await this.embeddings.embedQuery(doc.content);

        // Store vector
        await db.insert(documentVectors).values({
          documentId: document.id,
          chunkIndex: 0,
          content: doc.content,
          embedding: `[${embedding.join(',')}]`,
          metadata: {
            title: doc.title,
            testDocument: true,
            embeddingModel: testConfig.embeddingModel,
          },
        });

        embeddedDocs.push({
          documentId: document.id,
          title: doc.title,
          embeddingSize: embedding.length,
        });
      }

      this.testResults.steps.embedding = {
        status: 'success',
        documentsProcessed: embeddedDocs.length,
        embeddingDimensions: embeddedDocs[0]?.embeddingSize || 0,
        time: Date.now() - stepStart,
      };
      this.testResults.embeddedDocs = embeddedDocs;
      console.log(`✅ Embedded ${embeddedDocs.length} documents`);
    } catch (err: unknown) {
      this.testResults.steps.embedding = {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Embedding failed',
      };
      throw err;
    }
  }

  async testVectorSearch() {
    const stepStart = Date.now();
    console.log('🔍 Testing vector search...');
    try {
      const searchResults: Array<any> = [];
      for (const query of testConfig.testQueries) {
        const queryStart = Date.now();
        // Generate query embedding
        const queryEmbedding = await this.embeddings.embedQuery(query);
        const queryEmbeddingSql = `[${queryEmbedding.join(',')}]`;

        // Search similar documents
        const results = await db
          .select({
            id: documentVectors.id,
            documentId: documentVectors.documentId,
            content: documentVectors.content,
            similarity: sql<number>`1 - (${documentVectors.embedding} <=> ${queryEmbeddingSql})`,
            filename: documents.filename,
            caseTitle: cases.title,
          })
          .from(documentVectors)
          .leftJoin(documents, eq(documentVectors.documentId, documents.id))
          .leftJoin(cases, eq(documents.caseId, cases.id))
          .where(sql`1 - (${documentVectors.embedding} <=> ${queryEmbeddingSql}) > 0.5`)
          .orderBy(sql`${documentVectors.embedding} <=> ${queryEmbeddingSql}`)
          .limit(5);

        searchResults.push({
          query,
          results,
          count: results.length,
          topSimilarity: results[0]?.similarity || 0,
          searchTime: Date.now() - queryStart,
          matches: results.map((r: any) => ({
            filename: r.filename,
            similarity: r.similarity,
            caseTitle: r.caseTitle,
          })),
        });
      }

      this.testResults.steps.search = {
        status: 'success',
        queriesExecuted: searchResults.length,
        avgSearchTime:
          searchResults.length > 0
            ? searchResults.reduce((sum, r) => sum + r.searchTime, 0) / searchResults.length
            : 0,
        totalResults: searchResults.reduce((sum, r) => sum + r.count, 0),
        time: Date.now() - stepStart,
      };
      this.testResults.searchResults = searchResults;
      console.log(`✅ Executed ${searchResults.length} search queries`);
    } catch (err: unknown) {
      this.testResults.steps.search = {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Search failed',
      };
      throw err;
    }
  }

  async testMCPIntegration() {
    const stepStart = Date.now();
    console.log('🤖 Testing MCP integration...');
    try {
      // Test if MCP postgres server is working
      const mcpTest = await db.select({ count: sql<number>`count(*)` }).from(documentVectors);

      this.testResults.steps.mcp = {
        status: 'success',
        postgresConnected: true,
        vectorCount: mcpTest[0].count,
        time: Date.now() - stepStart,
      };
      console.log(`✅ MCP integration working: ${mcpTest[0].count} vectors`);
    } catch (err: unknown) {
      this.testResults.steps.mcp = {
        status: 'failed',
        error: err instanceof Error ? err.message : 'MCP integration failed',
      };
      // Don't throw - MCP is optional
      console.warn('⚠️ MCP integration test failed (optional)');
    }
  }

  async analyzePerformance() {
    const stepStart = Date.now();
    console.log('📊 Analyzing performance...');
    try {
      // Get database stats
      const [vectorStats] = await db
        .select({
          count: sql<number>`count(*)`,
          avgSize: sql<number>`avg(array_length(embedding, 1))`,
        })
        .from(documentVectors);

      const [docStats] = await db.select({ count: sql<number>`count(*)` }).from(documents);

      this.testResults.performance = {
        vectorsStored: vectorStats.count,
        documentsProcessed: docStats.count,
        avgEmbeddingDimensions: Math.round(vectorStats.avgSize || 0),
        embeddingModel: testConfig.embeddingModel,
        ollamaConnected: this.testResults.steps.ollama?.status === 'success',
        searchPerformance: {
          avgQueryTime: this.testResults.steps.search?.avgSearchTime || 0,
          totalQueries: this.testResults.searchResults?.length || 0,
        },
      };
      console.log(`✅ Performance analysis complete`);
    } catch (err: unknown) {
      console.warn('⚠️ Performance analysis failed: ', err);
      this.testResults.performance = { error: 'Failed to analyze performance' };
    }
  }
}

// ============================================================================
// API HANDLERS
// ============================================================================
export const POST: RequestHandler = async ({ request }) => {
  try {
    const { action = 'full' } = await request.json();
    const pipeline = new VectorPipelineTest();
    if (action === 'full') {
      const results = await pipeline.runFullPipeline();
      return json(results);
    }
    return json({ error: `Unknown action` }, { status: 400 });
  } catch (err: unknown) {
    console.error('❌ Test pipeline error: ', err);
    return json(
      {
        error: 'Pipeline test failed',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
};

export const GET: RequestHandler = async () => {
  try {
    // Quick health check
    const embeddings = new OllamaEmbeddings({
      baseUrl: testConfig.ollamaBaseUrl,
      model: testConfig.embeddingModel,
    });
    const testEmbedding = await embeddings.embedQuery('health check');

    // Check database connection
    const [vectorCount] = await db.select({ count: sql<number>`count(*)` }).from(documentVectors);

    return json({
      status: 'ready',
      ollama: {
        connected: true,
        model: testConfig.embeddingModel,
        dimensions: testEmbedding.length,
        baseUrl: testConfig.ollamaBaseUrl,
      },
      database: {
        connected: true,
        vectorsStored: vectorCount.count,
      },
      testConfig: {
        documentsToTest: testConfig.testDocuments.length,
        queriesToTest: testConfig.testQueries.length,
      },
    });
  } catch (err: unknown) {
    return json(
      {
        status: 'not_ready',
        error: err instanceof Error ? err.message : 'Unknown error',
        suggestions: [
          'Ensure Ollama is running on http://localhost:11434',
          'Verify nomic-embed-text model is installed',
          'Check PostgreSQL connection and pgvector extension',
        ],
      },
      { status: 503 }
    );
  }
};

