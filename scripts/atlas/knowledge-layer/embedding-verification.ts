// Embedding Verification
// Verifies embeddinggemma:latest returns exactly 768 finite values

import { Symbol } from './types';

export interface EmbeddingCheck {
  model: string;
  input: string;
  dimensions: number;
  truncate: boolean;
  result: {
    count: number;
    dimension: number;
    finite: boolean;
    sample: number[];
  };
}

export async function verifyEmbedding(): Promise<EmbeddingCheck> {
  try {
    // Use the correct API format
    const response = await fetch('http://127.0.0.1:11434/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        input: 'test',
        dimensions: 768,
        truncate: true,
      }),
    });
    
    const data = await response.json();
    
    const embeddings = data.embeddings;
    const count = embeddings.length;
    const dimension = embeddings.length > 0 ? embeddings[0].length : 0;
    const finite = embeddings.length > 0 && embeddings[0].every(v => typeof v === 'number' && isFinite(v));
    
    return {
      model: 'embeddinggemma:latest',
      input: 'test',
      dimensions: 768,
      truncate: true,
      result: {
        count,
        dimension,
        finite,
        sample: finite ? embeddings[0].slice(0, 5) : [],
      },
    };
  } catch (err) {
    throw new Error(`Embedding verification failed: ${err.message}`);
  }
}

export function isFiniteArray(arr: any[]): boolean {
  return arr.every(v => typeof v === 'number' && isFinite(v));
}
