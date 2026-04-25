import { OperationStore } from '@urql/svelte';
import { Client, fetchExchange } from '@urql/core';
import { devtoolsExchange } from '@urql/devtools';
import { cacheExchange } from '@urql/exchange-graphcache';
import { relayPagination } from '@urql/exchange-graphcache/extras';

// Create the GraphQL client with caching
export const client = new Client({
  url: '/api/graphql',
  exchanges: [
    devtoolsExchange,
    cacheExchange({
      keys: {
        CaseResult: (data: any) => data.id,
        AnalysisResult: (data: any) => `${data.caseId}:${data.analysisType}`,
      },
      resolvers: {
        Query: {
          searchCases: relayPagination(),
        },
      },
      optimistic: {
        createCase: (args, cache, info) => ({
          __typename: 'CaseResult',
          id: 'temp-' + Date.now(),
          title: args.title,
          content: args.content || '',
          relevanceScore: null,
          metadata: args.metadata || {},
        }),
      },
    }),
    fetchExchange,
  ],
});

// Helper function to create a query store
export function createQueryStore<T>(query: string, variables?: any): OperationStore<T> {
  return new OperationStore(query, variables);
}
