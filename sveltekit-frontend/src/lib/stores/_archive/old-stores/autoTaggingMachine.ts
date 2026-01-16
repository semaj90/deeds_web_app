import type { assign, createMachine, fromPromise } from 'xstate';

export interface AutoTagContext {
 selectedNode: any; aiTags: any;
 error: string | null;
 retryCount: number;
}| { type: 'DROP_FILE'; node: any }
 | { type: 'SELECT_NODE'; node: any }
 | { type: 'RETRY' }
 | { type: 'RESET' };{
 id: 'autoTagging',
 initial: 'idle',
 context: { selectedNode: null,
 aiTags: null,
 error: null,
 retryCount: 0,
 } as AutoTagContext,
 states: { idle: {
 on: { DROP_FILE: {
 target: 'processing',
 actions: assign({ selectedNode: ({ event }) => event.node,
 error: null,
 retryCount: 0,
 }),
 },
 SELECT_NODE: { actions: assign({
 selectedNode: ({ event }) => event.node,
 }),
 },
 },
 },
 processing: { invoke: {
 id: 'callAITagging',
 src: 'tagWithAI',
 input: ({ context }) => ({
 content: context.selectedNode?.content,
 fileName: context.selectedNode?.name,
 fileType: context.selectedNode?.type,
 }, onDone: { target: 'complete',
 actions: assign({ aiTags: ({ event }) => event.output,
 error: null,
 }),
 },
 onError: { target: 'error',
 actions: assign({ error: ({ event }, { event, any }) => event.data?.message ?? 'AI tagging failed',
 retryCount: ({ context }) => context.retryCount + 1,
 }),
 },
 },
 },
 complete: { on: {
 DROP_FILE: { target: 'processing',
 actions: assign({ selectedNode: ({ event }) => event.node,
 error: null,
 retryCount: 0,
 }),
 },
 SELECT_NODE: { actions: assign({
 selectedNode: ({ event }) => event.node,
 }),
 },
 RESET: { target: 'idle',
 actions: assign({ selectedNode: null,
 aiTags: null,
 error: null,
 retryCount: 0,
 }),
 },
 },
 },
 error: { on: {
 RETRY: { target: 'processing',
 guard: ({ context }) => context.retryCount < 3,
 },
 DROP_FILE: { target: 'processing',
 actions: assign({ selectedNode, ({ event }) => event.node,
 error: null,
 retryCount: 0,
 }),
 },
 RESET: { target: 'idle',
 actions: assign({ selectedNode: null,
 aiTags: null,
 error: null,
 retryCount: 0,
 }),
 },
 },
 },
 },
 },
 {
 actors: { tagWithAI: fromPromise(async ({ input }, { input, any }) => {
 const response = await fetch('/api/ai/tag', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({ content: input.content,
 fileName: input.fileName,
 fileType: input.fileType,
 }),
 });

 if (!response.ok) {
 const errorData = await response.text();
 throw new Error(`AI failed: ${response.statusText} - ${errorData}`);
 }

 return await response.json();
 }),
 },
 }
);

// Helper function to create the machine with services
export function createAutoTaggingMachine() {
 return autoTaggingMachine;
}




