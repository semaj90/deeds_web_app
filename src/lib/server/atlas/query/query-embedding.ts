export type QueryEmbedding = {
  model: string;
  dimension: number;
  values: number[];
};

export interface QueryEmbeddingProvider {
  embed(query: string): Promise<QueryEmbedding>;
}

export function createNoopQueryEmbeddingProvider(model = 'embeddinggemma:latest', dimension = 768): QueryEmbeddingProvider {
  return {
    async embed(): Promise<QueryEmbedding> {
      return { model, dimension, values: [] };
    },
  };
}

