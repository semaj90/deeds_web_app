#!/usr/bin/env node
/**
 * Test RAG functionality with the populated knowledge base
 */

import { getContextFromRag } from '../src/lib/server/rag-query.js';

async function testRAG() {
  console.log('🧪 Testing RAG functionality...\n');

  const query = 'security camera footage showing suspicious activity';
  console.log(`Query: "${query}"\n`);

  try {
    const response = await getContextFromRag({
      query: query
    });

    console.log('RAG Response:');
    console.log('Context Text Length:', response.contextText.length);
    console.log('Number of Citations:', response.citations.length);
    console.log('');

    if (response.citations.length > 0) {
      console.log('Citations:');
      response.citations.forEach((citation, i) => {
        console.log(`${i+1}. ${citation.source} (score: ${citation.score.toFixed(3)})`);
      });
      console.log('');
      console.log('Sample Context:', response.contextText.substring(0, 200) + '...');
      console.log('');
      console.log('✅ RAG system is working! Knowledge base successfully wired up.');
    } else {
      console.log('⚠️ No citations found. Check embedding quality or query.');
    }

  } catch (error) {
    console.error('❌ RAG test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testRAG();