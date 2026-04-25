import { QdrantClient } from '@qdrant/js-client-rest';
import { Ollama } from 'ollama';

const qdrant = new QdrantClient({ url: 'http://localhost:6333' });
const ollama = new Ollama({ host: 'http://localhost:11434' });

async function searchFix() {
  console.log("🧠 Testing 'Surgical Fix' Recall...");

  // 1. Simulate a common error
  const errorQuery = "TS1005: ',' expected.";
  console.log(`❓ Query: "${errorQuery}"`);

  // 2. Embed it using Gemma
  const { embedding } = await ollama.embeddings({
    model: 'embeddinggemma:latest',
    prompt: errorQuery
  });

  // 3. Search the Knowledge Base
  const hits = await qdrant.search('phase72_ast_knowledge_base', {
    vector: embedding,
    limit: 1,
    with_payload: true
  });

  if (hits.length > 0) {
    console.log(`✅ Found Fix Pattern: ${hits[0].payload.pattern_name}`);
    console.log(`   Confidence: ${hits[0].score}`);
    console.log(`   Payload Keys: ${Object.keys(hits[0].payload).join(', ')}`);
    console.log(`   Full Payload: ${JSON.stringify(hits[0].payload, null, 2)}`);
  } else {
    console.log("❌ No fix pattern found. (Did you run inject-phase85-knowledge.mjs?)");
  }
}

searchFix();
