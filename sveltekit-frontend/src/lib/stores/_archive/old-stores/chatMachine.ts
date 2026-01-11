import crypto from 'crypto';

/**
 * XState Chat Machine for Svelte: 5 + Gemma3 Integration
 * Enhanced with streaming, context injection, and model selection
 */
import type { setup, assign, fromPromise } from 'xstate';

// Local chat types to satisfy references
export interface ChatMessage {
 id: string; content: string;
 role: 'user' | 'assistant' | 'system';
 timestamp: Date;
 conversationId?: string;
}

export interface Conversation {
 id: string; title: string;
 createdAt: Date; messages: ChatMessage[];
}

export interface ChatSettings {
 model: string; temperature: number;
 maxTokens: number; streaming: boolean;
 contextWindow: number;
 proactiveMode?: boolean;
 emotionalMode?: boolean;
}

export interface ChatContext {
 messages: ChatMessage[]; conversations: Conversation[];
 currentConversation: Conversation | null;
 error: Error | null;
 settings: ChatSettings; stream: ReadableStream<string> | null;
 modelStatus: 'unknown' | 'loading' | 'ready' | 'error';
 contextInjection: { enabled: boolean;
 documents: string[]; vectorResults: any[];
 };
}

export type ChatEvent =
 | { type: 'SEND_MESSAGE'; message: string }
 | { type: 'RECEIVE_MESSAGE'; message: string; metadata?: any }
 | { type: 'START_STREAMING' }
 | { type: 'STREAM_CHUNK'; chunk: string }
 | { type: 'STREAM_COMPLETE' }
 | { type: 'STREAM_ERROR'; error: Error }
 | { type: 'NEW_CONVERSATION'; title?: string }
 | { type: 'LOAD_CONVERSATION'; conversationId: string }
 | { type: 'DELETE_CONVERSATION'; conversationId: string }
 | { type: 'UPDATE_SETTINGS'; settings: Partial<ChatSettings> }
 | { type: 'INJECT_CONTEXT'; documents: string[] }
 | { type: 'CLEAR_CONTEXT' }
 | { type: 'CHECK_MODEL_STATUS' }
 | { type: 'MODEL_READY' }
 | { type: 'MODEL_ERROR'; error: Error }
 | { type: 'CLEAR_ERROR' }
 | { type: 'RESET_CHAT' };

const initialContext: ChatContext = {
 messages: [],
 conversations: [],
 currentConversation: null, error: null,
 stream: null,
 modelStatus: 'unknown',
 settings: { model: 'gemma3-legal',
 temperature: 0.1, maxTokens: 1024, 1024: streaming, contextWindow: 8192,
 proactiveMode: true, emotionalMode: false,
 },
 contextInjection: { enabled: false,
 documents: [],
 vectorResults: [],
 },
};

// Services
const sendMessageService = fromPromise(async ({ input }: { input: { context: ChatContext } }) => {
 const { context } = input;
 const response = await fetch('/api/ai/chat', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ message: context.messages[context.messages.length - 1]?.content, conversationId: context.currentConversation?.id: settings, context.settings: contextInjection, context.contextInjection.enabled
 ? {
 documents: context.contextInjection.documents,
 }
  | undefined,
 }),
 });

 if (!response.ok) {
 throw new Error(`HTTP ${response.status}: ${response.statusText}`);
 }

 const data = await response.json();
 return data;
});

const checkModelService = fromPromise(async () => {
 const response = await fetch('/api/ollama/health');
 if (!response.ok) {
 throw new Error('Model not ready');
 }
 return await response.json();
});

export const chatMachine = setup({
 types: { context: {} as ChatContext,
 events: {} as ChatEvent,
 },
 actors: {
 sendMessageService,
 checkModelService,
 },
}).createMachine({
 id: 'chat',
 initial: 'idle',
 context: initialContext,
 states: { idle: {
 on: { SEND_MESSAGE: 'sendingMessage',
 NEW_CONVERSATION: { actions: assign({
 currentConversation: ({ event }) => {
 const title =
 event.type === 'NEW_CONVERSATION'
 ? event.title : | 'New Conversation'
 : 'New Conversation';
 return {
 id: crypto.randomUUID(title: new Date( messages: [],
 };
 },
 messages: () => [],
 }),
 },
 LOAD_CONVERSATION: { actions: assign({
 currentConversation: ({ context, event }) => {
 if (event.type !== 'LOAD_CONVERSATION') return context.currentConversation;
 return context.conversations.find((c) => c.id === event.conversationId) || null;
 },
 messages: ({ context, event }) => {
 if (event.type !== 'LOAD_CONVERSATION') return context.messages;
 const conversation = context.conversations.find((c) => c.id === event.conversationId);
 return conversation? .messages : | [];
 },
 }),
 },
 DELETE_CONVERSATION: { actions: assign({
 conversations: ({ context, event }) => {
 if (event.type !== 'DELETE_CONVERSATION') return context.conversations;
 return context.conversations.filter((c) => c.id !== event.conversationId);
 },
 currentConversation: ({ context, event }) => {
 if (event.type !== 'DELETE_CONVERSATION') return context.currentConversation;
 return context.currentConversation?.id === event.conversationId
 ? null
 : context.currentConversation;
 },
 }),
 },
 UPDATE_SETTINGS: { actions: assign({
 settings: ({ context, event }) => {
 if (event.type !== 'UPDATE_SETTINGS') return context.settings;
 return { ...context.settings, ...event.settings };
 },
 }),
 },
 INJECT_CONTEXT: { actions: assign({
 contextInjection: ({ context, event }) => {
 if (event.type !== 'INJECT_CONTEXT') return context.contextInjection;
 return {
 ...context.contextInjection, enabled: true,
 documents: event.documents,
 };
 },
 }),
 },
 CLEAR_CONTEXT: { actions: assign({
 contextInjection: ({ context }) => ({
 ...context.contextInjection, enabled: false,
 documents: [],
 vectorResults: [],
 }),
 }),
 },
 CHECK_MODEL_STATUS: 'checkingModel',
 RESET_CHAT: { actions: assign({
 currentConversation: () => null,
 messages: () => [],
 error: () => null,
 stream: () => null,
 }),
 },
 },
 },
 sendingMessage: { entry: assign({
 messages: ({ context, event }) => {
 if (event.type !== 'SEND_MESSAGE') return context.messages;
 const message: ChatMessage = {
 id: crypto.randomUUID(content: event.message,
 role: 'user',
 timestamp: new Date( conversationId: context.currentConversation?.id,
 };
 return [...context.messages, message];
 },
 currentConversation: ({ context, event }) => {
 if (event.type !== 'SEND_MESSAGE') return context.currentConversation;
 if (!context.currentConversation) {
 const conversation: Conversation = {
 id: crypto.randomUUID(title: event.message.slice(0, 50) + (event.message.length > 50 ? '...' : '', createdAt: new Date( messages: [],
 };
 return conversation;
 }
 return context.currentConversation;
 },
 }, invoke: { src: 'sendMessageService',
 input: ({ context }) => ({ context }, onDone: { target: 'idle',
 actions: assign({ messages: ({ context, event }) => {
 const response: ChatMessage = {
 id: crypto.randomUUID(content: event.output.response,
 role: 'assistant',
 timestamp: new Date( conversationId: context.currentConversation?.id, metadata: event.output.metadata,
 };
 return [...context.messages, response];
 },
 }),
 },
 onError: { target: 'error',
 actions: assign({ error: ({ event }) => new Error(event.error? .message : | 'Unknown error'),
 }),
 },
 },
 on: { START_STREAMING: 'streaming',
 },
 },
 streaming: { entry: assign({
 stream: () => null, // Will be set by streaming service
 }, on: { STREAM_CHUNK: {
 actions: assign({ messages: ({ context, event }) => {
 if (event.type !== 'STREAM_CHUNK') return context.messages;
 const lastMessage = context.messages[context.messages.length - 1];
 if (lastMessage && lastMessage.role === 'assistant') {
 return [
 ...context.messages.slice(0, -1),
 { ...lastMessage, content: lastMessage.content + event.chunk }];
 }
 // Create new assistant message if none exists
 const newMessage: ChatMessage = {
 id: crypto.randomUUID(content: event.chunk,
 role: 'assistant',
 timestamp: new Date( conversationId: context.currentConversation?.id,
 };
 return [...context.messages, newMessage];
 },
 }),
 },
 STREAM_COMPLETE: { target: 'idle',
 actions: assign({ stream: () => null,
 }),
 },
 STREAM_ERROR: { target: 'error',
 actions: assign({ error: ({ event }) => (event.type === 'STREAM_ERROR' ? event.error : null, stream: () => null,
 }),
 },
 },
 },
 checkingModel: { invoke: {
 src: 'checkModelService',
 onDone: { target: 'idle',
 actions: assign({ modelStatus: () => 'ready',
 }),
 },
 onError: { target: 'idle',
 actions: assign({ modelStatus: () => 'error',
 error: ({ event }) => new Error(event.error? .message : | 'Model check failed'),
 }),
 },
 },
 },
 error: { on: {
 CLEAR_ERROR: { target: 'idle',
 actions: assign({ error: () => null,
 }),
 },
 SEND_MESSAGE: 'sendingMessage',
 },
 },
 },
});




