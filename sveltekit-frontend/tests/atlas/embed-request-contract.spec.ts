import { describe, expect, it } from 'vitest';
import { buildEmbedBodies, extractEmbeddings } from '../../scripts/atlas/lib/embed-request-contract.mjs';

const ONES = new Array(768).fill(0.1);
const ZEROS = new Array(768).fill(0);

describe('embed request contract (kanban-turbovec-consolidation caller)', () => {
  it('sends the Ollama batch body to Ollama', () => {
    expect(buildEmbedBodies('ollama', ['a', 'b'], 'embeddinggemma:latest')).toEqual([
      { model: 'embeddinggemma:latest', input: ['a', 'b'] }
    ]);
  });

  it('splits large Ollama inputs into bounded batches and reassembles them in order', () => {
    const texts = Array.from({ length: 600 }, (_, i) => `t${i}`);
    const bodies = buildEmbedBodies('ollama', texts, 'embeddinggemma:latest');
    expect(bodies.map((b: { input: string[] }) => b.input.length)).toEqual([256, 256, 88]);
    expect(bodies.flatMap((b: { input: string[] }) => b.input)).toEqual(texts);
    const responses = bodies.map((b: { input: string[] }) => ({ embeddings: b.input.map(() => ONES) }));
    expect(extractEmbeddings('ollama', responses, 600)).toHaveLength(600);
  });

  it('sends one {text, model} body per text to the SvelteKit route (not the Ollama shape)', () => {
    const bodies = buildEmbedBodies('sveltekit', ['a', 'b'], 'embeddinggemma:latest');
    expect(bodies).toEqual([
      { text: 'a', model: 'embeddinggemma' },
      { text: 'b', model: 'embeddinggemma' }
    ]);
    for (const body of bodies) {
      expect(body).not.toHaveProperty('input');
      expect(body.model).not.toContain(':');
    }
  });

  it('extracts vectors from both response shapes', () => {
    expect(extractEmbeddings('ollama', [{ embeddings: [ONES, ONES] }], 2)).toHaveLength(2);
    expect(extractEmbeddings('sveltekit', [{ embedding: ONES }, { embedding: ONES }], 2)).toHaveLength(2);
  });

  it('rejects zero vectors and count mismatches so callers fall back explicitly', () => {
    expect(extractEmbeddings('sveltekit', [{ embedding: ZEROS }], 1)).toBeNull();
    expect(extractEmbeddings('ollama', [{ embeddings: [ONES] }], 2)).toBeNull();
    expect(extractEmbeddings('sveltekit', [{}], 1)).toBeNull();
  });
});
