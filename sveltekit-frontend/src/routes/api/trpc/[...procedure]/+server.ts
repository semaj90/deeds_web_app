/**
 * SvelteKit tRPC handler — mounts the appRouter at /api/trpc/[...procedure].
 *
 * Client usage (TypeScript):
 *   import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
 *   import type { AppRouter } from '$lib/server/trpc/router';
 *
 *   const trpc = createTRPCProxyClient<AppRouter>({
 *     links: [httpBatchLink({ url: '/api/trpc' })],
 *   });
 *
 *   const run = await trpc.workflow.start.mutate({ query: '...', graphId: 'code-audit' });
 */

import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { RequestHandler } from './$types';
import { appRouter } from '$lib/server/trpc/router.js';
import { createContext } from '$lib/server/trpc/init.js';

const handler: RequestHandler = (event) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req: event.request,
    router: appRouter,
    createContext: () => createContext(event),
    onError({ error, path }) {
      if (error.code === 'INTERNAL_SERVER_ERROR') {
        console.error(`[tRPC] Internal error on ${path ?? '?'}:`, error.message);
      }
    },
  });

export const GET = handler;
export const POST = handler;
