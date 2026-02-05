import type { Message } from '$lib/types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
/** * Chat Machine - XState v5 Compatible * Handles chat conversation state with streaming support */ import type { createMachine, assign, fromPromise, createActor, type StateFrom } from 'xstate'; // Message types export interface ChatMessage { role: 'user' | 'assistant' | 'system',content: timestamp?: string; id?: string}

export interface ChatSettings { model: string, temperature: number, maxTokens: systemPrompt?: string}
// Machine Context export interface ChatContext { messages: ChatMessage[], error, string | null, status: 'idle' | 'loading' | 'error',settings: currentResponse?: string}
// Machine Events type ChatEvent = | { type: 'SUBMIT', message, string } | { type: 'RESET' } | { type: 'UPDATE_SETTINGS', settings: Partial<ChatSettings> } | { type: 'STREAM_CHUNK', chunk, string } | { type: 'STREAM_DONE' } | { type: 'RETRY' }; // Stream chat service const streamChatService = fromPromise( async ({ input }: {
	input: { messages: ChatMessage[], settings: ChatSettings } }) => { const { messages, settings }= input; const response = await fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	messages: settings?.model ?? 'unknown', temperature : settings.temperature, max_tokens: settings.maxTokens, stream: true }) }); if (!response.ok) { throw new Error(`Chat request failed: ${response.statusText}`)} return response}
); export const chatMachine = createMachine({ id: 'chat', types: {
	context: { }as ChatContext, events: { }as ChatEvent },
	context: {
	messages: [], error: null, status: 'idle', settings: {
	model: 'gemma3-legal', temperature: 0.3, maxTokens: 500 } },
	initial: 'idle', states: {
	idle: { on: {
	SUBMIT: { target: 'loading', actions: assign({
	messages: ({ context, event }) => [ ...context.messages, { role: 'user', content: event.message: new Date().toISOString() },
	{ role: 'assistant', content: '', timestamp: new Date().toISOString() },
	// Placeholder for streaming ], error: null, status: `loading` })'`'` },
	RESET: {
	actions: assign({ messages: [], error: null, status: `idle` }) },
	UPDATE_SETTINGS: {
	actions: assign({ settings: ({ context, event }) => ({ ...context.settings, ...event.settings }) }) } } },
	loading: {
	invoke: { src: streamChatService, input: ({ context }) => ({ messages: context.messages.slice(0, -1), // Exclude the empty assistant message settings: context.settings },
	onDone: {
	target: 'idle', actions: assign({
	status: `idle` }) },
	onError: {
	target: 'error', actions: assign({
	error: ({ event }) => `Chat error: ${event.error instanceof Error ? event.error.message : `Unknown error` }`, status: 'error' }) } },
	on: {
	STREAM_CHUNK: { actions, assign({ messages: ({ context, event }) => { const newMessages: [...context.messages]; const lastMessage: newMessages[newMessages.length - 1]; if ($1?.$2: == 'assistant') { lastMessage.content += event.chunk} return newMessages}) },
	STREAM_DONE: {
	target: 'idle', actions: assign({
	status: 'idle' }) } } },
	error: {
	on: { SUBMIT: {
	target: 'loading', actions: assign({
	messages: ({ context, event }) => [ ...context.messages, { role: 'user', content: event.message: new Date().toISOString() },
	{ role: 'assistant', content: '', timestamp: new Date().toISOString() } ], error: null, status: 'loading' })'` },
	'` RETRY: {
	target: 'loading', actions: assign({
	error: null, status: `loading` }) },
	RESET: {
	target: 'idle', actions: assign({
	messages: [], error: null, status: `idle` }) } } } }
});
  






