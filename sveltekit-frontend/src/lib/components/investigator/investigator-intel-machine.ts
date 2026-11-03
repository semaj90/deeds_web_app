import { assign, fromPromise, setup } from 'xstate';
import type { InvestigatorIntelResponseV1 } from './investigator-intel-contract.js';

type Context = {
  caseId: string | null;
  query: string;
  result: InvestigatorIntelResponseV1 | null;
  error: string | null;
};
type Event = { type: 'REFRESH'; query?: string } | { type: 'RESET' };

const loadIntel = fromPromise(async ({ input, signal }: {
  input: { caseId: string | null; query: string };
  signal: AbortSignal;
}): Promise<InvestigatorIntelResponseV1> => {
  const response = await fetch('/api/graph/recommendations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(input),
    signal
  });
  const data = await response.json();
  if (!response.ok || data?.success !== true) {
    throw new Error(data?.error ?? 'Investigation intelligence unavailable');
  }
  if (!Array.isArray(data.predictiveSignals) || !Array.isArray(data.recommendations)) {
    throw new Error('Invalid investigator intelligence response');
  }
  return data as InvestigatorIntelResponseV1;
});

/** Create one actor per mounted surface, never a server-global actor. */
export const investigatorIntelMachine = setup({
  types: {
    input: {} as { caseId: string | null; query: string },
    context: {} as Context,
    events: {} as Event
  },
  actors: { loadIntel }
}).createMachine({
  id: 'investigatorIntel',
  initial: 'idle',
  context: ({ input }) => ({
    caseId: input.caseId, query: input.query, result: null, error: null
  }),
  states: {
    idle: {
      on: {
        REFRESH: {
          target: 'loading',
          actions: assign(({ context, event }) => ({
            query: event.query?.trim() || context.query, error: null
          }))
        }
      }
    },
    loading: {
      invoke: {
        src: 'loadIntel',
        input: ({ context }) => ({ caseId: context.caseId, query: context.query }),
        onDone: {
          target: 'ready',
          actions: assign({
            result: ({ event }) => event.output,
            error: () => null
          })
        },
        onError: {
          target: 'error',
          actions: assign({ error: ({ event }) => String(event.error) })
        }
      },
      on: {
        REFRESH: {
          target: 'loading', reenter: true,
          actions: assign(({ context, event }) => ({
            query: event.query?.trim() || context.query, error: null
          }))
        },
        RESET: 'idle'
      }
    },
    ready: {
      on: {
        REFRESH: {
          target: 'loading',
          actions: assign(({ context, event }) => ({
            query: event.query?.trim() || context.query, error: null
          }))
        },
        RESET: 'idle'
      }
    },
    error: {
      on: {
        REFRESH: {
          target: 'loading',
          actions: assign(({ context, event }) => ({
            query: event.query?.trim() || context.query, error: null
          }))
        },
        RESET: 'idle'
      }
    }
  }
});
