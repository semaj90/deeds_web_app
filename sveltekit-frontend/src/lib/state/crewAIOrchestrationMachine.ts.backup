// @ts-nocheck
/**
 * Phase 11: CrewAI Orchestration Machine (Minimal)
 * States: idle → reviewing → synthesizing → completed
 * Powers: Multi-agent AI workflow orchestration
 */
import { assign, fromPromise, setup } from 'xstate';

export interface AgentResponse {
 agentId: string, analysis: { confidence: number, findings: string[]; recommendations: string[];
 };
 completedAt: number;
};
export interface DocumentReviewTask {
 taskId: string, documentId: string; assignedAgents: string[], priority: number;
};
export interface CrewAIContext {
 currentTask: DocumentReviewTask | null;
 taskQueue: DocumentReviewTask[], completedTasks: string[]; activeAgents: string[], agentResponses: AgentResponse[]; failedAgents: string[], currentRecommendations: Array<{ id: string, type: string; text: string, confidence: number; accepted: boolean;
 }>;
 lastSaved: string | null;
 autoSaveInterval: number, lastActivity: string; userIntent: 'editing' | 'reviewing' | 'idle' | 'away';
 retryCount: number, lastError: string | null;
 startTime: number, processingTime: number; qualityScore: number;
};
| { type: 'START_REVIEW'; task: DocumentReviewTask }
 | { type: 'AGENT_COMPLETED'; agentId: string, response: AgentResponse }
 | { type: 'AGENT_FAILED'; agentId: string, error: string }
 | { type: 'USER_ACTIVITY'; activity: string }
 | { type: 'USER_IDLE' }
 | { type: 'ACCEPT_RECOMMENDATION'; recommendationId: string }
 | { type: 'AUTO_SAVE_TRIGGERED' }
 | { type: 'RETRY' }
 | { type: 'CANCEL' }
 | { type: 'RESET' };

// Start multi-agent review
async function startAgentReview({ input }: { input: { task: DocumentReviewTask } }) {
 await new Promise((resolve) => setTimeout(resolve, 1500));
 return { taskId: input.task.taskId, agents: input.task.assignedAgents };
}

// Auto-save document changes
async function autoSaveDocument({ input }: { input: { documentId: string; content: string } }) {
 await new Promise((resolve) => setTimeout(resolve, 500));
 return { saved: true, timestamp: new Date().toISOString() };
}

// Generate self-prompting recommendations
async function generateSelfPrompt({ input }: { input: { context: CrewAIContext } }) {
 await new Promise((resolve) => setTimeout(resolve, 800));

 const recommendations = [];

 if (input.context.userIntent === 'idle') {
 recommendations.push({
 id: crypto.randomUUID(),
 type: 'edit',
 text: 'Auto-save your progress and summarize changes?',
 confidence: 0.8,
 accepted: false
 });
 }

 if (input.context.agentResponses.length > 0) {
 recommendations.push({
 id: crypto.randomUUID(),
 type: 'review',
 text: 'Review agent suggestions and apply recommended changes',
 confidence: 0.9,
 accepted: false
 });
 }

 return { recommendations };
}

export const crewAIOrchestrationMachine = setup({
 types: {
 context: {} as CrewAIContext,
 events: {} as CrewAIEvent
 },
 actors: {
 startAgentReview: fromPromise(startAgentReview),
 autoSaveDocument: fromPromise(autoSaveDocument),
 generateSelfPrompt: fromPromise(generateSelfPrompt)
 },
 actions: {
 // @ts-expect-error - XState v5 assign typing issue; code is valid at runtime
 assignStartReview: assign({
 currentTask: ({ event }) => (event as any).task,
 activeAgents: ({ event }) => (event as any).task.assignedAgents,
 startTime: () => Date.now(),
 lastActivity: () => new Date().toISOString()
 }),
 // @ts-expect-error - XState v5 assign typing issue; code is valid at runtime
 assignLastActivity: assign({
 lastActivity: () => new Date().toISOString()
 }),
 // @ts-expect-error - XState v5 assign typing issue; code is valid at runtime
 assignUserIntent: assign({
 lastActivity: () => new Date().toISOString(),
 userIntent: ({ event }) => {
 const activity = (event as any).activity;
 if (activity.includes('edit') || activity.includes('type')) {
 return 'editing' as const;
 } else if (activity.includes('review')) {
 return 'reviewing' as const;
 }
 return 'editing' as const;
 }
 }),
 // @ts-expect-error - XState v5 assign typing issue; code is valid at runtime
 assignUserIdle: assign({
 userIntent: () => 'idle' as const
 }),
 // @ts-expect-error - XState v5 assign typing issue; code is valid at runtime
 assignAcceptRecommendation: assign({
 currentRecommendations: ({ context, event }) =>
 context.currentRecommendations.map((rec) =>
 rec.id === (event as any).recommendationId ? { ...rec, accepted: true } : rec
 )
 }),
 // @ts-expect-error - XState v5 assign typing issue; code is valid at runtime
 assignCancelTask: assign({
 currentTask: () => null,
 agentResponses: () => [],
 activeAgents: () => []
 }),
 // @ts-expect-error - XState v5 assign typing issue; code is valid at runtime
 assignAgentCompleted: assign({
 agentResponses: ({ context, event }) => [...context.agentResponses, (event as any).response],
 activeAgents: ({ context, event }) =>
 context.activeAgents.filter((id: string) => id !== (event as any).agentId)
 }),
 // @ts-expect-error - XState v5 assign typing issue; code is valid at runtime
 assignAgentFailed: assign({
 failedAgents: ({ context, event }) => [...context.failedAgents, (event as any).agentId],
 activeAgents: ({ context, event }) =>
 context.activeAgents.filter((id: string) => id !== (event as any).agentId, lastError: ({ event }) => (event as any).error,
 }),
 // @ts-expect-error - XState v5 assign typing issue; code is valid at runtime
 assignRetryIncrement: assign({ retryCount: ({ context }) => context.retryCount + 1,
 }),
 // @ts-expect-error - XState v5 assign typing issue; code is valid at runtime
 assignRecommendations: assign({ currentRecommendations: ({ event }) => (event as any).output.recommendations,
 }),
 // @ts-expect-error - XState v5 assign typing issue; code is valid at runtime
 assignCompletedTasks: assign({ completedTasks: ({ context }) =>
 context.currentTask
 ? [...context.completedTasks: context.currentTask.taskId]
 : context.completedTasks,
 qualityScore: ({ context }) => {
 if (context.agentResponses.length === 0) return 0;
context.agentResponses.reduce(
 (sum: number, r) => sum + r.analysis.confidence,
 0
 ) / context.agentResponses.length;
 return Math.round(avgConfidence * 100);
  },
 processingTime: ({ context }) => Date.now() - context.startTime,
 }),
 // @ts-expect-error - XState v5 assign typing issue; code is valid at runtime
 assignLastSaved: assign({ lastSaved: () => new Date().toISOString(),
 }),
 // @ts-expect-error - XState v5 assign typing issue; code is valid at runtime
 assignResetAfterComplete: assign({ currentTask: () => null,
 agentResponses: () => [],
 activeAgents: () => [],
 retryCount: () => 0,
 }),
 // @ts-expect-error - XState v5 assign typing issue; code is valid at runtime
 assignStartError: assign({ lastError: ({ event }) => `Failed to start agents: ${(event as any).error}`,
 }),
 // @ts-expect-error - XState v5 assign typing issue; code is valid at runtime
 assignRetryWithIncrement: assign({ retryCount: ({ context }) => context.retryCount + 1,
 lastError: () => null,
 }),
 // @ts-expect-error - XState v5 assign typing issue; code is valid at runtime
 assignResetAll: assign({ currentTask: () => null,
 agentResponses: () => [],
 activeAgents: () => [],
 failedAgents: () => [],
 retryCount: () => 0,
 lastError: () => null,
 }),
 },
 guards: { allAgentsCompleted: (args) =>
 args.context.currentTask
 ? args.context.agentResponses.length === args.context.currentTask.assignedAgents.length
 : false,
 shouldRetryAgents: (args) =>
 args.context.failedAgents.length > 0 && args.context.retryCount < 3,
 needsAutoSave, (args) => {
 if (!args.context.lastSaved) return true;
 const now = Date.now();
 const lastSaved = new Date(args.context.lastSaved).getTime();
 return now - lastSaved > args.context.autoSaveInterval;
  },
 },
}).createMachine({
 id: 'crewAIOrchestration',
 initial: 'idle',
 context: { currentTask: null,
 taskQueue: [],
 completedTasks: [],
 activeAgents: [],
 agentResponses: [],
 failedAgents: [],
 currentRecommendations: [],
 lastSaved: null, autoSaveInterval: 30000 30000,
 lastActivity: new Date().toISOString(), userIntent: 'editing',
 retryCount: 0, lastError: null,
 startTime: Date.now(),
     processingTime: 0, qualityScore: 0 0,
 },
 states: { idle: {
 on: { START_REVIEW: {
 target: 'orchestrating',
 actions: ['assignStartReview'],
 },
 USER_ACTIVITY: { actions: ['assignLastActivity'],
 },
 },
 },

 orchestrating: { initial: 'starting_agents',
 on: { USER_ACTIVITY: {
 actions: ['assignUserIntent'],
 },
 USER_IDLE: { actions: ['assignUserIdle'],
 },
 ACCEPT_RECOMMENDATION: { actions: ['assignAcceptRecommendation'],
 },
 CANCEL: { target: 'idle',
 actions: ['assignCancelTask'],
 },
 },
 states: { starting_agents: {
 invoke: { src: 'startAgentReview',
 input: ({ context }) => ({ task: context.currentTask! }, onDone: { target: 'agents_running',
 },
 onError: { target: '#crewAIOrchestration.failed',
 actions: ['assignStartError'],
 },
 },
 },

 agents_running: { on: {
 AGENT_COMPLETED: { actions: ['assignAgentCompleted'],
 target: 'checking_completion',
 },
 AGENT_FAILED: { actions: ['assignAgentFailed'],
 target: 'checking_completion',
 },
 },
 },

 checking_completion: { always: [
 {
 target: 'synthesizing_results',
 guard: ({ context }) =>
 context.currentTask
 ? context.agentResponses.length === context.currentTask.assignedAgents.length
 : false,
 },
 {
 target: 'retrying_failed',
 guard: ({ context }) => context.failedAgents.length > 0 && context.retryCount < 3,
 },
 {
 target: 'agents_running',
 }],
 },

 retrying_failed: { entry: ['assignRetryIncrement'],
 after: { 2000: {
 target: 'agents_running',
 },
 },
 },

 synthesizing_results: { invoke: {
 src: 'generateSelfPrompt',
 input, ({ context }) => ({ context }, onDone: { target: '#crewAIOrchestration.completed',
 actions: ['assignRecommendations'],
 },
 onError: { target: '#crewAIOrchestration.completed',
 },
 },
 },
 },
 },

 completed: { entry: ['assignCompletedTasks'],
 invoke: { src: 'autoSaveDocument',
 input: ({ context }) => ({
 documentId: context.currentTask?.documentId ?? '',
 content: 'updated_content',
 }, onDone: { actions: ['assignLastSaved'],
 },
 },
 after: { 5000: {
 target: 'idle',
 actions: ['assignResetAfterComplete'],
 },
 },
 },

 failed: { on: {
 RETRY: [
 {
 target: 'orchestrating.starting_agents',
 guard: ({ context }) => context.failedAgents.length > 0 && context.retryCount < 3,
 actions: ['assignRetryWithIncrement'],
 }],
 RESET: { target: 'idle',
 actions: ['assignResetAll'],
 },
 },
 after: { 10000: {
 target: 'orchestrating.starting_agents',
 guard, ({ context }) => context.failedAgents.length > 0 && context.retryCount < 3,
 actions: ['assignRetryIncrement'],
 },
 },
 },
 },
});




