/**
 * Agent Shell Machine
 * XState machine for the AI Agent Shell
 * Phase 72 - Task 3
 */

import { setup, assign } from 'xstate';

// Types
export interface ShellContext {
  input: string;
  history: string[];
  lastResult: unknown | null;
  error: string | null;
  mode: 'chat' | 'command' | 'analysis';
}

export type ShellEvent =
  | { type: 'INPUT'; value: string }
  | { type: 'SUBMIT' }
  | { type: 'CLEAR' }
  | { type: 'SET_MODE'; mode: ShellContext['mode'] }
  | { type: 'ERROR'; message: string }
  | { type: 'SUCCESS'; result: unknown };

export const agentShellMachine = setup({
  types: {
    context: {} as ShellContext,
    events: {} as ShellEvent,
  },
  actions: {
    updateInput: assign({
      input: ({ event }) => (event.type === 'INPUT' ? event.value : ''),
    }),
    addToHistory: assign({
      history: ({ context, event }) => {
        if (event.type === 'SUCCESS' && typeof event.result === 'string') {
          return [...context.history, event.result];
        }
        return context.history;
      },
    }),
    setResult: assign({
      lastResult: ({ event }) => (event.type === 'SUCCESS' ? event.result : null),
      error: () => null,
    }),
    setError: assign({
      error: ({ event }) => (event.type === 'ERROR' ? event.message : null),
    }),
    setMode: assign({
      mode: ({ event }) => (event.type === 'SET_MODE' ? event.mode : 'chat'),
    }),
    clear: assign({
      input: () => '',
      error: () => null,
      lastResult: () => null,
    }),
  },
}).createMachine({
  id: 'agentShell',
  initial: 'idle',
  context: {
    input: '',
    history: [],
    lastResult: null,
    error: null,
    mode: 'chat',
  },
  states: {
    idle: {
      on: {
        INPUT: {
          actions: 'updateInput',
        },
        SUBMIT: {
          target: 'processing',
        },
        SET_MODE: {
          actions: 'setMode',
        },
        CLEAR: {
          actions: 'clear',
        },
      },
    },
    processing: {
      on: {
        SUCCESS: {
          target: 'idle',
          actions: ['setResult', 'addToHistory'],
        },
        ERROR: {
          target: 'idle',
          actions: 'setError',
        },
      },
    },
  },
});
