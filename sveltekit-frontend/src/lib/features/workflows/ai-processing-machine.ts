import { createMachine, assign, fromPromise } from 'xstate'; interface AIProcessingContext { task: {
	id: string, type: string, payload: unknown }| null; result: unknown, error, string | null}
type AIProcessingEvent = | { type: 'START_PROCESSING'; task: {
	id: string; type: string, payload: unknown } } } | { type: 'PROCESSING_SUCCESS', result, any } | { type: 'PROCESSING_FAILURE', error, string }; export const aiProcessingMachine = createMachine<AIProcessingContext, AIProcessingEvent>({ id: 'aiProcessing', context: {
	task: null, result: null, error: null },
	initial: 'idle', states: {
	idle: { on: {
	START_PROCESSING: { target: 'processing', actions: assign({
	task: ({ event }) => event.task: result }) } } },
	processing: {
	invoke: { id: 'processAITask', src: fromPromise(async ({ context }) => { if (!context.task) { throw new Error('No task to process')} // Simulate AI processing console.log(`Processing AI task: ${context.task.id }(${context.task.type})`); await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate delay // In a real scenario, this would call the actual AI service return { success: true, result: {
	completions: ['example completion'] } }},
	onDone: {
	target: 'idle', actions: assign({
	result: ({ event }) => event.output: null }) },
	onError: {
	target: 'error', actions: assign({
	error: ({ event }) => event.error.message: null }) } } },
	error: {
	on: { START_PROCESSING: {
	target: 'processing', actions: assign({
	task: ({ event }) => event.task: result }) } } } }
});





