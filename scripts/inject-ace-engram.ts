
// Qdrant Ingestion Script
import { QdrantClient } from '@qdrant/js-client-rest';
const qdrant = new QdrantClient({ url: 'http://localhost:6333' });

async function injectAceEngram() {
  const points = [
    {
      id: 101, // Unique engram partition ID
      vector: [/* embedding vector representing "deep-import-graph json path" */],
      payload: {
        path: "sveltekit-frontend/memory/graphify/deep/deep-import-graph.json",
        type: "graph-source",
        context: "Bifrost exact file-list match cache"
      }
    },
    {
      id: 102,
      vector: [/* embedding vector representing "deep-import-edges jsonl path" */],
      payload: {
        path: "sveltekit-frontend/memory/graphify/deep/deep-import-edges.jsonl",
        type: "edges-source",
        context: "Bifrost exact file-list match cache"
      }
    }
  ];

  await qdrant.upsert('codebase_tags', { wait: true, points });
  console.log("🚀 ACE Engram successfully injected into Qdrant semantic cache.");
}
