import { createYoga } from 'graphql-yoga';
import type { RequestHandler } from './$types';
import { schema } from '$lib/graphql/schema';
import { localLLM } from '$lib/ai/local-llm-service';
import { db } from '$lib/db';
import { getUserFromRequest } from '$lib/auth/utils';

// Initialize the LLM service
await localLLM.initialize().catch(console.error);

// Create Yoga GraphQL server
const yoga = createYoga({
  schema,
  context: async ({ request }) => {
    const user = await getUserFromRequest(request);
    return {
      user,
      db,
      llm: localLLM,
    };
  },
  graphqlEndpoint: '/api/graphql',
  cors: {
    origin: process.env.NODE_ENV === 'production' ? 'https://yourdomain.com' : '*',
    credentials: true,
  },
});

// Handle all HTTP methods
export const GET: RequestHandler = async ({ request }) => {
  const response = await yoga.handle(request);
  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
};

export const POST: RequestHandler = async ({ request }) => {
  const response = await yoga.handle(request);
  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
};

export const OPTIONS: RequestHandler = async ({ request }) => {
  const response = await yoga.handle(request);
  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
};
