import { createMachine, assign } from 'xstate';

export interface ChatContext {
  chatId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string; contextPack?: any }>;
  error: string | null;
}

export type ChatEvent =
  | { type: 'SEND'; message: string }
  | { type: 'RETRY' }
  | { type: 'CLEAR' };

export const chatMachine = createMachine({
  id: 'adminChat',
  initial: 'idle',
  context: ({ input }: { input: { chatId: string } }) => ({
    chatId: input.chatId,
    messages: [],
    error: null,
  }),
  states: {
    idle: {
      on: {
        SEND: {
          target: 'retrieving_context',
          actions: assign({
            messages: ({ context, event }) => [
              ...context.messages,
              { role: 'user', content: event.message, attachments: event.attachments }
            ]
          })
        }
      }
    },
    composing: {},
    retrieving_context: {
      invoke: {
        src: 'fetchResponse',
        input: ({ context }) => ({
          chatId: context.chatId,
          message: context.messages[context.messages.length - 1].content,
          attachments: context.messages[context.messages.length - 1].attachments
        }),
        onDone: {
          target: 'generating',
          actions: assign({
            currentResponse: ({ event }) => event.output.message,
            contextPack: ({ event }) => event.output.contextPack
          })
        },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => (event.data as Error).message
          })
        }
      }
    },
    generating: {
      after: {
        10: 'done' // Simulate fast transition if response is already here
      }
    },
    streaming: {},
    done: {
      entry: assign({
        messages: ({ context }) => [
          ...context.messages,
          { role: 'assistant', content: context.currentResponse || '', contextPack: context.contextPack }
        ],
        currentResponse: '',
        contextPack: null
      }),
      after: {
        500: 'idle'
      }
    },
    failed: {
      entry: assign({
        messages: ({ context }) => [
          ...context.messages,
          { role: 'system', content: `Error: ${context.error}` }
        ]
      }),
      after: {
        3000: 'idle'
      }
    }
  },
  on: {
    CLEAR: {
      actions: assign({
        messages: [],
        error: null
      })
    }
  }
});
