import type { User } from '$lib/types';
import { createMachine, assign, fromPromise } from 'xstate';

/**
 * XState Event Machine for User Typing States
 * Tracks user typing behavior for contextual prompting and analytics
 * Integrates with multi-core workers for real-time processing
 */

export type TypingEvent =
  | { type: 'USER_STARTED_TYPING'; text: string; timestamp: number }
  | { type: 'USER_STOPPED_TYPING'; text: string; timestamp: number }
  | { type: 'USER_SUBMITTED'; text: string; timestamp: number }
  | { type: 'USER_CLEARED'; timestamp: number }
  | { type: 'USER_INACTIVE'; timestamp: number }
  | { type: 'USER_RETURNED'; timestamp: number }
  | { type: 'TYPING_TIMEOUT' }
  | { type: 'PROCESS_CONTEXT'; text: string }
  | { type: 'ANALYTICS_UPDATE'; data: any };

export interface TypingContext {
  currentText: string;
  lastActivity: number;
  typingStartTime: number;
  typingEndTime: number;
  typingDuration: number;
  charactersTyped: number;
  wordsTyped: string[];
  deletionsCount: number;
  submissionsCount: number;
  sessionStartTime: number;
  userBehavior: {
    avgTypingSpeed: number; // chars per minute
    avgPauseTime: number; // ms between typing bursts
    patternRecognition: string[];
    contextualHints: string[];
  };
  analytics: {
    sessionDuration: number;
    totalInteractions: number;
    typingPatterns: Array<any>;
    contextSwitches: number;
    userEngagement: 'low' | 'medium' | 'high';
  };
  mcpWorkerStatus: 'idle' | 'processing' | 'ready';
  lastProcessedText: string;
  contextualPrompts: string[];
}

// Multi-core worker for contextual processing
const processContextualContent = fromPromise(
  (async ({ input }: { input: { text: string, context: TypingContext } }) => {
    try {
      // Call MCP multi-core server for real-time processing
      const response = await fetch('http://localhost:3002/mcp/contextual-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: input.text,
          userBehavior: input.context.userBehavior,
          analytics: input.context.analytics,
          timestamp: Date.now(),
        }),
      });

      if (!response.ok) {
        throw new Error(`MCP Server error: ${response.status}`);
      }

      const result = await response.json();
      return {
        contextualHints: (result as any).hints || [],
        suggestions: (result as any).suggestions || [],
        userIntent: (result as any).intent || 'unknown',
        confidence: (result as any).confidence || 0,
      };
    } catch (error) {
      console.error('Contextual processing error: ', error);
      return {
        contextualHints: ['Unable to process context'],
        suggestions: [],
        userIntent: 'unknown',
        confidence: 0,
      };
    }
  }) as any
);

export const userTypingStateMachine = createMachine({
    id: 'userTyping',
    types: {
      context: {} as TypingContext,
      events: {} as TypingEvent,
    },
    context: {
      currentText: '',
      lastActivity: Date.now(),
      typingStartTime: 0,
      typingEndTime: 0,
      typingDuration: 0,
      charactersTyped: 0,
      wordsTyped: [],
      deletionsCount: 0,
      submissionsCount: 0,
      sessionStartTime: Date.now(),
      userBehavior: {
        avgTypingSpeed: 0,
        avgPauseTime: 0,
        patternRecognition: [],
        contextualHints: [],
      },
      analytics: {
        sessionDuration: 0,
        totalInteractions: 0,
        typingPatterns: [],
        contextSwitches: 0,
        userEngagement: 'medium',
      },
      mcpWorkerStatus: 'idle',
      lastProcessedText: '',
      contextualPrompts: [],
    },
    initial: 'idle',
    actors: {
        processContextualContent
    },
    states: {
      idle: {
        entry: assign({
          mcpWorkerStatus: 'idle',
          lastActivity: () => Date.now(),
        }),
        on: {
          USER_STARTED_TYPING: {
            target: 'typing',
            actions: assign({
              typingStartTime: () => Date.now(),
              lastActivity: () => Date.now(),
              currentText: ({ event }) => event.text,
              analytics: ({ context }) => ({
                ...context.analytics,
                totalInteractions: context.analytics.totalInteractions + 1,
              }),
            }),
          },
          USER_RETURNED: {
            target: 'user_present',
            actions: assign({
              lastActivity: () => Date.now(),
              analytics: ({ context }) => ({
                ...context.analytics,
                contextSwitches: context.analytics.contextSwitches + 1,
              }),
            }),
          },
        },
        after: {
          30000: 'user_inactive', // manual timeout
        },
      },
      typing: {
        entry: assign({ mcpWorkerStatus: 'ready' }),
        on: {
          USER_STARTED_TYPING: {
            actions: [
              assign({
                currentText: ({ event }) => event.text,
                lastActivity: () => Date.now(),
                charactersTyped: ({ context, event }) => {
                  const newLength = event.text.length;
                  const oldLength = context.currentText.length;
                  return context.charactersTyped + Math.max(0, newLength - oldLength);
                },
                deletionsCount: ({ context, event }) => {
                  const newLength = event.text.length;
                  const oldLength = context.currentText.length;
                  return newLength < oldLength ? context.deletionsCount + 1 : context.deletionsCount;
                },
              }),
              // Trigger contextual processing for long text - logic can be added here
            ],
          },
          USER_STOPPED_TYPING: {
            target: 'not_typing',
            actions: assign({
              typingEndTime: () => Date.now(),
              typingDuration: ({ context }) => Date.now() - context.typingStartTime,
              wordsTyped: ({ event }) => event.text.split(/\s+/).filter((item) => item.length > 0),
              userBehavior: ({ context }) => {
                const typingSpeed =
                  context.charactersTyped / ((Date.now() - context.typingStartTime) / 60000);
                return {
                  ...context.userBehavior,
                  avgTypingSpeed: (context.userBehavior.avgTypingSpeed + typingSpeed) / 2,
                };
              },
              analytics: ({ context }) => ({
                ...context.analytics,
                typingPatterns: [
                  ...context.analytics.typingPatterns,
                  {
                    start: context.typingStartTime,
                    end: Date.now(),
                    text: context.currentText,
                    speed:
                      context.charactersTyped / ((Date.now() - context.typingStartTime) / 60000),
                  },
                ].slice(-10), // Keep last 10 patterns
              }),
            }),
          },
          USER_SUBMITTED: {
            target: 'processing_submission',
            actions: assign({
              submissionsCount: ({ context }) => context.submissionsCount + 1,
              lastActivity: () => Date.now(),
            }),
          },
          PROCESS_CONTEXT: {
            target: 'contextual_processing',
          },
        },
        after: {
          2000: 'not_typing',
        },
      },
      not_typing: {
        entry: assign({
          typingEndTime: () => Date.now(),
          userBehavior: ({ context }) => ({
            ...context.userBehavior,
            avgPauseTime:
              (context.userBehavior.avgPauseTime + (Date.now() - context.typingEndTime)) / 2,
          }),
        }),
        on: {
          USER_STARTED_TYPING: {
            target: 'typing',
            actions: assign({
              typingStartTime: () => Date.now(),
              lastActivity: () => Date.now(),
            }),
          },
          USER_SUBMITTED: {
            target: 'processing_submission',
          },
          TYPING_TIMEOUT: {
            target: 'waiting_user',
          },
        },
        after: {
          5000: {
            target: 'waiting_user',
            actions: assign({
              contextualPrompts: ({ context }) => {
                // Generate contextual prompts based on current text
                const prompts = [];
                if (context.currentText.includes('legal')) {
                  prompts.push('Need help with legal research?');
                }
                if (context.currentText.includes('contract')) {
                  prompts.push('Looking for contract templates?');
                }
                if (context.currentText.length > 100) {
                  prompts.push('Would you like me to summarize this text?');
                }
                return prompts;
              },
            }),
          },
        },
      },
      waiting_user: {
        entry: assign({
          userBehavior: ({ context }) => ({
            ...context.userBehavior,
            contextualHints: [
              'User paused - consider offering assistance',
              'Long text detected - suggest summarization',
              'Legal context - offer document analysis',
            ],
          }),
        }),
        on: {
          USER_STARTED_TYPING: {
            target: 'typing',
            actions: assign({
              contextualPrompts: [],
              lastActivity: () => Date.now(),
            }),
          },
          USER_SUBMITTED: {
            target: 'processing_submission',
          },
          USER_INACTIVE: {
            target: 'user_inactive',
          },
        },
        after: {
          30000: 'user_inactive',
        },
      },
      user_present: {
        on: {
          USER_STARTED_TYPING: { target: 'typing' },
          USER_INACTIVE: { target: 'user_inactive' },
        },
        after: {
          2000: 'idle',
        },
      },
      user_inactive: {
        entry: assign({
          analytics: ({ context }) => ({
            ...context.analytics,
            sessionDuration: Date.now() - context.sessionStartTime,
            userEngagement:
              context.analytics.totalInteractions > 10
                ? 'high'
                : context.analytics.totalInteractions > 5
                ? 'medium'
                : 'low',
          }),
        }),
        on: {
          USER_RETURNED: {
            target: 'user_present',
            actions: assign({ lastActivity: () => Date.now() }),
          },
          USER_STARTED_TYPING: {
            target: 'typing',
            actions: assign({ lastActivity: () => Date.now() }),
          },
        },
      },
      processing_submission: {
        entry: assign({ mcpWorkerStatus: 'processing' }),
        invoke: {
          src: 'processContextualContent',
          input: ({ context }) => ({
            text: context.currentText,
            context,
          }),
          onDone: {
            target: 'idle',
            actions: assign({
              userBehavior: ({ context, event }) => ({
                ...context.userBehavior,
                contextualHints: (event.output as any).contextualHints,
              }),
              lastProcessedText: ({ context }) => context.currentText,
              mcpWorkerStatus: 'idle',
              currentText: '',
              analytics: ({ context }) => ({
                ...context.analytics,
                totalInteractions: context.analytics.totalInteractions + 1,
              }),
            }),
          },
          onError: {
            target: 'idle',
            actions: assign({
              mcpWorkerStatus: 'idle',
              userBehavior: ({ context }) => ({
                ...context.userBehavior,
                contextualHints: ['Processing error - please try again'],
              }),
            }),
          },
        },
      },
      contextual_processing: {
        entry: assign({ mcpWorkerStatus: 'processing' }),
        invoke: {
          src: 'processContextualContent',
          input: ({ context }) => ({
            text: context.currentText,
            context,
          }),
          onDone: {
            target: 'typing',
            actions: assign({
              userBehavior: ({ context, event }) => ({
                ...context.userBehavior,
                contextualHints: (event.output as any).contextualHints,
                patternRecognition: [
                  ...context.userBehavior.patternRecognition,
                  (event.output as any).userIntent,
                ].slice(-5),
              }),
              lastProcessedText: ({ context }) => context.currentText,
              mcpWorkerStatus: 'ready',
            }),
          },
          onError: {
            target: 'typing',
            actions: assign({
              mcpWorkerStatus: 'ready',
            }),
          },
        },
      },
    },
});

export type TypingState =
  | 'idle'
  | 'typing'
  | 'not_typing'
  | 'waiting_user'
  | 'user_present'
  | 'user_inactive'
  | 'processing_submission'
  | 'contextual_processing';

export default userTypingStateMachine;
