#!/usr/bin/env node

// Simple test script to verify Gemma embedding generation works
// Uses built-in fetch (Node.js 18+)

const OLLAMA_URL = 'http://localhost:11434';

async function testGemmaEmbedding() {
  console.log('🧪 Testing Gemma Embedding Generation...\n');
  
  const testQueries = [
    'TypeScript interface definition and type guards',
    'WebGPU compute shader programming with WGSL',
    'PostgreSQL JSONB indexing for performance optimization',
    'Drizzle ORM schema migrations and type safety'
  ];
  
  for (const query of testQueries) {
    console.log(`📝 Query: "${query}"`);
    
    try {
      const startTime = Date.now();
      
      // Test embeddinggemma:latest first
      const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'embeddinggemma:latest',
          prompt: query
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      const duration = Date.now() - startTime;
      
      if (result.embedding && Array.isArray(result.embedding)) {
        console.log(`✅ Generated embedding in ${duration}ms`);
        console.log(`   Dimensions: ${result.embedding.length}`);
        console.log(`   Sample values: [${result.embedding.slice(0, 5).map(x => x.toFixed(2)).join(', ')}...]`);
        
        // Calculate magnitude for verification
        const magnitude = Math.sqrt(result.embedding.reduce((sum, val) => sum + val * val, 0));
        console.log(`   Magnitude: ${magnitude.toFixed(4)}`);
      } else {
        console.log('❌ Invalid embedding response');
      }
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
    
    console.log('');
  }
}

async function testSimilarity() {
  console.log('🔍 Testing Semantic Similarity...\n');
  
  const queries = [
    'TypeScript interfaces',
    'WebGPU shaders',
    'PostgreSQL performance',
    'Drizzle migrations'
  ];
  
  const embeddings = [];
  
  // Generate embeddings
  for (const query of queries) {
    try {
      const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'embeddinggemma:latest',
          prompt: query
        })
      });
      
      const result = await response.json();
      embeddings.push({
        query,
        embedding: result.embedding
      });
    } catch (error) {
      console.log(`Error generating embedding for "${query}": ${error.message}`);
      return;
    }
  }
  
  // Calculate cosine similarities
  function cosineSimilarity(a, b) {
    const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }
  
  console.log('Similarity Matrix:');
  console.log('================');
  
  for (let i = 0; i < embeddings.length; i++) {
    const row = [];
    for (let j = 0; j < embeddings.length; j++) {
      const similarity = cosineSimilarity(embeddings[i].embedding, embeddings[j].embedding);
      row.push(similarity.toFixed(3));
    }
    console.log(`${embeddings[i].query.padEnd(20)} | ${row.join('  ')}`);
  }
}

async function main() {
  console.log('🚀 Gemma Embedding Test Suite');
  console.log('============================\n');
  
  // Check if Ollama is running
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!response.ok) {
      throw new Error('Ollama not accessible');
    }
    
    const data = await response.json();
    const hasGemma = data.models?.some(m => m.name.includes('embeddinggemma'));
    
    console.log('✅ Ollama is running');
    console.log(`✅ Gemma embedding model: ${hasGemma ? 'Available' : 'Not found'}`);
    
    if (!hasGemma) {
      console.log('❌ Please install: ollama pull embeddinggemma:latest');
      return;
    }
    
  } catch (error) {
    console.log(`❌ Ollama connection failed: ${error.message}`);
    console.log('Please ensure Ollama is running on port 11434');
    return;
  }
  
  console.log('');
  
  await testGemmaEmbedding();
  await testSimilarity();
  
  console.log('🎉 All tests completed!');
  console.log('\nNext steps:');
  console.log('1. Start Context7 MCP Server on port 4000');
  console.log('2. Run the full RAG pipeline');
  console.log('3. Test document search and retrieval');
}

main().catch(console.error);