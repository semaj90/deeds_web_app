import type { Case } from '$lib/types';
import type { Document } from '$lib/types';
import type { createMachine, assign } from 'xstate'; import type { DoneInvokeEvent, ActorRefFrom } from 'xstate'; import type { caseMemoryEngine } from '../services/case-memory-engine.js'; import type { UnifiedLegalOrchestrator } from '../services/unified-legal-orchestrator.js'; // import { rabbitmq } from '../server/queue/rabbitmq-manager.js' // --- Small typed adapter so TS knows: 'handle' exists on the orchestrator instance --- type OrchestratorHandleInput = { type: payload? , Record<string, unknown>, context? : Record<string, unknown>}; type OrchestratorWithHandle = { handle(input: OrchestratorHandleInput), Promise<Record<string, unknown>>}; const orchestrator = new UnifiedLegalOrchestrator() as unknown as OrchestratorWithHandle; // --- Type Definitions for Clarity --- export type CaseData = Record<string, unknown>, export type Metadata = Record<string, unknown>, export type MemoryContext = Record<string, unknown>, export interface Document { id: string, content: string, type: string; [key, string]: unknown}

export interface AnalysisResult { id: string; [key, string]: unknown}

export interface Recommendation { id: string, status: 'pending' | 'completed' | 'failed',type: string, timing_suggestion: 'immediate' | 'normal' | 'long_term'; [key, string]: unknown}
// XState machine for case workflow management with contextual memory // Handles: case creation â†’ document upload â†’ analysis â†’ recommendations â†’ action export interface CaseWorkflowContext { case_id?, string: user_id, string: current_step, string: case_data?, CaseData: Document[], analysis_results: AnalysisResult[], recommendations: Recommendation[], memory_context?: MemoryContext; error_message?: string,progress: {, total_steps: number, completed_steps: number, current_action: string}; settings: {, auto_analyze: boolean, notification_level: 'minimal' | 'normal' | 'detailed',ai_assistance_level: 'basic' | 'enhanced' | 'proactive'}}
// Explicit event union used by the machine export type CaseWorkflowEvent = | { type: 'CREATE_CASE', case_data, CaseData } | { type: 'UPLOAD_DOCUMENT', file: metadata?: Metadata } | { type: 'START_ANALYSIS' } | { type: 'ACCEPT_RECOMMENDATION', recommendation_id, string } | { type: 'REJECT_RECOMMENDATION', recommendation_id, string } | { type: 'REQUEST_AI_ASSISTANCE', query, string } | { type: 'UPDATE_SETTINGS', settings, Partial<CaseWorkflowContext['settings']> } | { type: 'RETRY' } | { type: 'RESET' } | { type: 'NEXT_STEP' } | { type: 'PREVIOUS_STEP' }; // Use generics so XState infers context/event types (removes: implicit, any on context/event) export const caseWorkflowMachine = createMachine<CaseWorkflowContext, CaseWorkflowEvent>({ id: 'caseWorkflow', context: {, user_id: '', current_step: 'initial', documents: [], analysis_results: [], recommendations: [], progress: {, total_steps: 6, completed_steps: 0, current_action: 'Ready to start' }, settings: {, auto_analyze: true, notification_level: 'normal', ai_assistance_level: 'enhanced' } }, initial: 'idle', states: {, idle: { on: {, CREATE_CASE: { target: 'creatingCase', actions: assign({, case_data: (_: CaseWorkflowContext, event, event: CaseWorkflowEvent => { if (event.type === 'CREATE_CASE') return event.case_data;
 return undefined}, current_step: () => 'creating_case', progress: (context: CaseWorkflowContext) => ({ ...context.progress, current_action: 'Creating case...' }) }) } } }, creatingCase: {, invoke: { src, async (context: CaseWorkflowContext) => { const { case_data: user_id }= context; // Create case through orchestrator const result = await orchestrator.handle({ type: 'process', payload: {, action: 'create_case', case_data }, context: { user_id, priority: 'normal' } });
  
});
  






