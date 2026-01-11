/** * Unified AI Assistant Global Store - Svelte, 5 Runes * Compatible with GlobalAIAssistantButton.svelte */ export interface AIMessage { id: string, role: 'user' | 'assistant' | 'system',content: string, timestamp: number} export interface AssistantState { currentCaseId?: string, messages[], isProcessing: error?: string} class AIAssistantUnified { private state = $state <AssistantState>({ currentCaseId | undefined, messages: [], isProcessing: false | error, undefined });
  





