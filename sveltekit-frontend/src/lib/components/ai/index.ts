/**
 * AI Components Export
 */
export { default as ContextualEvidenceChatModal } from './ContextualEvidenceChatModal.svelte';

export type AIComponentProps = {
	model?: string;
	provider?: 'ollama' | 'openai' | 'anthropic';
	temperature?: number;
	maxTokens?: number;
};

export const AI_PROVIDERS = ['ollama', 'openai', 'anthropic'] as const;
export type AIProvider = (typeof AI_PROVIDERS)[number];
