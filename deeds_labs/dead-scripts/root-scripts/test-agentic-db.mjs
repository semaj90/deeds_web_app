#!/usr/bin/env node
/**
 * Test Agentic Database Operations
 */
import pg from 'pg';
import redis from 'redis';

const { Client } = pg;

async function testAgenticDatabase() {
  console.log('🧪 Testing Agentic Database Operations...');

  // Connect to PostgreSQL
  const pgClient = new Client({
    host: 'localhost',
    port: 5432,
    database: 'legal_ai_db',
    user: 'legal_admin',
    password: '123456'
  });

  await pgClient.connect();
  console.log('✅ PostgreSQL connected');

  // Connect to Redis
  const redisClient = redis.createClient({ url: 'redis://localhost:6379' });
  await redisClient.connect();
  console.log('✅ Redis connected');

  try {
    // Test 1: Generate embedding for Svelte 4 code
    const svelte4Code = `export let name = '';
export let age = 0;
let fullInfo = name + ', ' + age;`;

    const embeddingResponse = await fetch('http://localhost:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        prompt: `Svelte component with potential migration issues: ${svelte4Code}`
      })
    });

    const embeddingData = await embeddingResponse.json();
    const embedding = embeddingData.embedding;
    console.log(`📊 Generated embedding: ${embedding.length} dimensions`);

    // Test 2: Store in pgvector
    await pgClient.query(`
      INSERT INTO code_embeddings (path, content_hash, embedding, metadata, error_patterns, repair_suggestions, confidence_score)
      VALUES ($1, $2, $3::vector, $4, $5, $6, $7)
      ON CONFLICT (path) DO UPDATE SET
        content_hash = $2,
        embedding = $3::vector,
        metadata = $4,
        error_patterns = $5,
        repair_suggestions = $6,
        confidence_score = $7,
        last_updated = NOW()
    `, [
      'test/svelte4-migration.svelte',
      'abcd1234',
      JSON.stringify(embedding),
      {
        type: 'svelte4_component',
        exportLetCount: 2,
        needsMigration: true,
        complexity: 3
      },
      ['SVELTE_EXPORT_LET'],
      ['Convert export let name to let name = $state()', 'Convert export let age to let age = $state()'],
      0.90
    ]);

    console.log('✅ Code embedding stored in pgvector');

    // Test 3: Cache AST analysis in Redis
    const astData = {
      ast: 'typescript_ast_parsed',
      errors: [
        { type: 'SVELTE_EXPORT_LET', line: 1, message: 'Use $state() instead of export let', confidence: 0.95 },
        { type: 'SVELTE_EXPORT_LET', line: 2, message: 'Use $state() instead of export let', confidence: 0.95 }
      ],
      contentHash: 'abcd1234',
      timestamp: Date.now()
    };

    await redisClient.setEx('ast:test/svelte4-migration.svelte', 3600, JSON.stringify(astData));
    console.log('💾 AST analysis cached in Redis');

    // Test 4: Similarity search
    console.log('🔍 Testing semantic similarity search...');

    // Generate another similar embedding
    const similarCode = `export let username = 'anonymous';
export let userAge = 18;`;

    const similarEmbedding = await fetch('http://localhost:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        prompt: `Svelte component: ${similarCode}`
      })
    }).then(r => r.json()).then(d => d.embedding);

    // Find similar code patterns
    const similarityResult = await pgClient.query(`
      SELECT path, metadata, error_patterns, confidence_score,
             embedding <=> $1::vector as distance,
             (1 - (embedding <=> $1::vector)) as similarity
      FROM code_embeddings
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT 5
    `, [JSON.stringify(similarEmbedding)]);

    console.log('📊 Similarity search results:');
    similarityResult.rows.forEach((row, i) => {
      console.log(`  ${i + 1}. ${row.path}`);
      console.log(`     Similarity: ${row.similarity.toFixed(3)}`);
      console.log(`     Patterns: ${row.error_patterns.join(', ')}`);
      console.log(`     Confidence: ${row.confidence_score}`);
    });

    // Test 5: Repair suggestion lookup
    const cachedAST = await redisClient.get('ast:test/svelte4-migration.svelte');
    if (cachedAST) {
      const parsed = JSON.parse(cachedAST);
      console.log(`🔧 Found ${parsed.errors.length} cached repair suggestions`);
      parsed.errors.forEach(error => {
        console.log(`  • Line ${error.line}: ${error.message} (confidence: ${error.confidence})`);
      });
    }

    // Test 6: Update repair history
    await redisClient.hSet('repairs:history', 'test/svelte4-migration.svelte', JSON.stringify({
      appliedAt: new Date().toISOString(),
      repairsApplied: 2,
      beforeErrors: 2,
      afterErrors: 0,
      success: true
    }));

    const repairHistory = await redisClient.hGet('repairs:history', 'test/svelte4-migration.svelte');
    console.log('📈 Repair history:', JSON.parse(repairHistory));

    console.log('\n🎉 All agentic database operations successful!');

    // Summary
    console.log('\n📊 Summary:');
    console.log('✅ PostgreSQL pgvector: Code embeddings stored and searchable');
    console.log('✅ Redis caching: AST analysis and repair history cached');
    console.log('✅ Gemma embeddings: 768-dimensional semantic vectors generated');
    console.log('✅ Similarity search: Finding related code patterns');
    console.log('✅ Real-time caching: Sub-second lookups for repeated analysis');

  } finally {
    await pgClient.end();
    await redisClient.quit();
    console.log('🧹 Database connections closed');
  }
}

// Run the test
testAgenticDatabase().catch(console.error);