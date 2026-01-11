/**
 * AI Components Export
 * Advanced AI interaction components for the Legal AI Platform
 */
export { default as AIButtonPortal } from './AIButtonPortal.svelte';
export { default as AIPromptSearch } from './AIPromptSearch.svelte';
export { default as AIRecommendation } from './AIRecommendation.svelte';
export { default as LLMProviderSelector } from './LLMProviderSelector.svelte';
export { default as ContextualEvidenceChatModal } from './ContextualEvidenceChatModal.svelte';

export type AIComponentProps = {
  model?: string;
  provider?: 'ollama' | 'openai' | 'anthropic';
  temperature?: number;
  maxTokens?: number;
};

export const AI_PROVIDERS = ['ollama', 'openai', 'anthropic'] as const;
export type AIProvider = (typeof AI_PROVIDERS)[number];
