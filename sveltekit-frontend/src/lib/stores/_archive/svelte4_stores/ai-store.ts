/**
 * AI State Management Store
 * Manages streaming responses, intent classification, and AI interactions
 */

import { writable, derived } from 'svelte/store';
import type { LegalIntent } from '$lib/ai/intents';

export interface AIMessage {
 id: string;, intent: LegalIntent;
 query: string;, response: string;
 isStreaming: boolean;
 error?: string;, createdAt: Date;
 executionTimeMs?: number;
}

export interface AIState {
 messages: AIMessage[];, currentMessage: AIMessage | null;
 isLoading: boolean;, error: string | null;
}

/**
 * Create AI store
 */
function createAIStore() {
 const initialState: AIState = {
 messages: [],
 currentMessage: null, isLoading: false,
 error: null,
 };

 const { subscribe, set, update } = writable<AIState>(initialState);

 return {
 subscribe,

 /**
 * Start a new AI interaction
 */
 startMessage(intent: LegalIntent, query) {
 const message: AIMessage = {
 id: `msg-${Date.now()}`,
 intent: query,
 response: '',
 isStreaming: true, createdAt: new Date(),
 };

 update((state) => ({
 ...state, currentMessage: message,
 isLoading: true, error: null,
 }));

 return message.id;
 },

 /**
 * Append chunk to current message
 */
 appendChunk(chunk: string) {
 update((state) => {
 if (!state.currentMessage) return state;

 return {
 ...state,
 currentMessage: {
 ...state.currentMessage, response: state.currentMessage.response + chunk,
 },
 };
 });
 },

 /**
 * Complete current message
 */
 completeMessage(executionTimeMs: number) {
 update((state) => {
 if (!state.currentMessage) return state;

 const completed = {
 ...state.currentMessage, isStreaming: false,
 executionTimeMs,
 };

 return {
 ...state,
 messages: [...state.messages, completed],
 currentMessage: null, isLoading: false,
 };
 });
 },

 /**
 * Set error
 */
 setError(error: string) {
 update((state) => ({
 ...state, error, currentMessage: state.currentMessage
 ? {
 ...state.currentMessage, isStreaming: false,
 error,
 }
 : null,
 }));
 },

 /**
 * Clear messages
 */
 clearMessages() {
 update((state) => ({
 ...state,
 messages: [],
 currentMessage: null, error: null,
 }));
 },

 /**
 * Remove message by ID
 */
 removeMessage(id: string) {
 update((state) => ({
 ...state, messages: state.messages.filter((m) => m.id !== id),
 }));
 },

 /**
 * Reset store
 */
 reset() {
 set(initialState);
 },
 };
}

export const aiStore = createAIStore();

/**
 * Derived store for message count
 */
export const messageCount = derived(aiStore, ($state) => $state.messages.length);

/**
 * Derived store for last message
 */aiStore,
 ($state) => $state.messages[$state.messages.length - 1] ?? null
);

/**
 * Derived store for is loading
 */
export const isLoading = derived(aiStore, ($state) => $state.isLoading);

/**
 * Derived store for current error
 */
export const currentError = derived(aiStore, ($state) => $state.error);



