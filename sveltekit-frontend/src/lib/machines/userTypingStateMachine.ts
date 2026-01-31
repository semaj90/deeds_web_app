/**
 * User Typing State Machine Types
 * Stub file for type definitions
 */

export type TypingState = 'idle' | 'typing' | 'waiting_user' | 'contextual_processing' | 'paused';

export interface TypingContext {
  text: string;
  lastKeyTime: number;
  wordCount: number;
  analytics?: {
    userEngagement: 'low' | 'medium' | 'high';
    typingSpeed: number;
    pauseCount: number;
  };
}

export interface TypingStateChangeEvent {
  state: TypingState;
  context: TypingContext;
}

export interface ContextualPromptEvent {
  prompts: string[];
  context: TypingContext;
}

export interface AnalyticsUpdateEvent {
  analytics: unknown;
}
