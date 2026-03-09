// Qdrant integration example for LLM/NLP semantic search
// This example uses the Qdrant REST API from Node.js
import fetch from 'node-fetch';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

// Example: Upsert a vector for a case document
export async function upsertCaseVector(caseId: string, embedding: number[], payload: any) {
  const response = await fetch(`${QDRANT_URL}/collections/cases/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      points: [{
        id: caseId,
        vector: embedding,
        payload
      }]
    })
  });
  return response.json();
}

// Example: Search for similar cases by vector
export async function searchSimilarCases(embedding: number[], topK = 5) {
  const response = await fetch(`${QDRANT_URL}/collections/cases/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector: embedding,
      top: topK
    })
  });
  return response.json();
}

// Usage:
// await upsertCaseVector('case-123', [0.1, 0.2, ...], { title: 'Case Title' });
// const results = await searchSimilarCases([0.1, 0.2, ...]);
