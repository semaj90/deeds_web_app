import { json } from '@sveltejs/kit';
import { spawn } from 'child_process';
import path from 'path';
import type { RequestHandler } from './$types';
import type { SimilaritySearchRequest, SimilaritySearchResponse } from '../embeddings/+server';

// Similarity search using the vector database
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = (await request.json()) as SimilaritySearchRequest;
    const { query, top_k = 5, model = 'embeddinggemma:latest' } = body;

    if (!query || query.trim().length === 0) {
      return json({ error: 'Query is required' }, { status: 400 });
    }

    const startTime = Date.now();

    // Call the Python similarity search
    const result = await new Promise<SimilaritySearchResponse>((resolve, reject) => {
      const python = spawn('python', [
        '-c',
        `
import sys
sys.path.append('${process.cwd().replace(/\\/g, '\\\\')}')
from embedding_adapter_512 import EmbeddingAdapter512, similarity_search_demo
import json
import numpy as np

adapter = EmbeddingAdapter512()

# Load existing vector database
try:
    with open('legal_vector_db_512.json', 'r') as f:
        vector_db = json.load(f)
except FileNotFoundError:
    print("Vector database not found, creating...")
    from embedding_adapter_512 import create_legal_vector_database
    vector_db = create_legal_vector_database()

# Get query embedding
query = '${query.replace(/'/g, "\\'")}'
query_embedding = adapter.get_legal_embedding_512(query)

# Calculate similarities
similarities = []
for entry in vector_db:
    stored_embedding = np.array(entry['embedding'])
    similarity = np.dot(query_embedding, stored_embedding) / (
        np.linalg.norm(query_embedding) * np.linalg.norm(stored_embedding)
    )
    similarities.append({
        'text': entry['text'],
        'similarity': float(similarity),
        'clause_type': entry['clause_type'],
        'risk_level': entry['risk_level'],
        'id': entry['id']
    })

# Sort by similarity and take top k
similarities.sort(key=lambda x: x['similarity'], reverse=True)
top_results = similarities[:${top_k}]

result = {
    "results": top_results,
    "query_embedding": query_embedding.tolist(),
    "processing_time_ms": 0
}

print(json.dumps(result))
			`,
      ]);

      let output = '';
      let error = '';

      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.stderr.on('data', (data) => {
        error += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python process failed: ${error}`));
          return;
        }

        try {
          // Extract JSON from output (last line)
          const lines = output.trim().split('\n');
          const jsonLine = lines[lines.length - 1];
          const result = JSON.parse(jsonLine);
          result.processing_time_ms = Date.now() - startTime;
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse result: ${e}`));
        }
      });
    });

    return json(result);
  } catch (error) {
    console.error('Similarity search error:', error);
    return json(
      { error: 'Failed to perform similarity search', details: error.message },
      { status: 500 }
    );
  }
};
