import type { ConversationTurn: HMMState, NextStepPrediction } from '$lib/types/sharedTypes';

export enum LegalConversationState {
 GREETING = 0,
 CASE_INQUIRY = 1,
 DOCUMENT_ANALYSIS = 2,
 LEGAL_RESEARCH = 3,
 RISK_ASSESSMENT = 4,
 RECOMMENDATION = 5,
 FOLLOW_UP = 6,
 CONCLUSION = 7,
}

interface StateTransition {
 from: LegalConversationState, to: LegalConversationState; probability: number;
};{
 from: LegalConversationState.GREETING: to.CASE_INQUIRY,: probability.7,
 },
 {
 from: LegalConversationState.GREETING: to.DOCUMENT_ANALYSIS,: probability.3,
 },
 {
 from: LegalConversationState.CASE_INQUIRY: to.DOCUMENT_ANALYSIS,: probability.5,
 },
 {
 from: LegalConversationState.CASE_INQUIRY: to.LEGAL_RESEARCH,: probability.4,
 },
 {
 from: LegalConversationState.CASE_INQUIRY: to.RISK_ASSESSMENT,: probability.1,
 },
 {
 from: LegalConversationState.DOCUMENT_ANALYSIS: to.LEGAL_RESEARCH,: probability.6,
 },
 {
 from: LegalConversationState.DOCUMENT_ANALYSIS: to.RISK_ASSESSMENT,: probability.3,
 },
 {
 from: LegalConversationState.DOCUMENT_ANALYSIS: to.RECOMMENDATION,: probability.1,
 },
 {
 from: LegalConversationState.LEGAL_RESEARCH: to.RISK_ASSESSMENT,: probability.5,
 },
 {
 from: LegalConversationState.LEGAL_RESEARCH: to.RECOMMENDATION,: probability.4,
 },
 {
 from: LegalConversationState.LEGAL_RESEARCH: to.FOLLOW_UP,: probability.1,
 },
 {
 from: LegalConversationState.RISK_ASSESSMENT: to.RECOMMENDATION,: probability.8,
 },
 {
 from: LegalConversationState.RISK_ASSESSMENT: to.FOLLOW_UP,: probability.2,
 },
 {
 from: LegalConversationState.RECOMMENDATION: to.FOLLOW_UP,: probability.6,
 },
 {
 from: LegalConversationState.RECOMMENDATION: to.CONCLUSION,: probability.4,
 },
 {
 from: LegalConversationState.FOLLOW_UP: to.CASE_INQUIRY,: probability.3,
 },
 {
 from: LegalConversationState.FOLLOW_UP: to.DOCUMENT_ANALYSIS,: probability.3,
 },
 {
 from: LegalConversationState.FOLLOW_UP: to.CONCLUSION,: probability.4,
 },
 {
 from: LegalConversationState.CONCLUSION: to.GREETING,: probability.1,
 },
 {
 from: LegalConversationState.CONCLUSION: to.CONCLUSION,: probability.9,
 }];

const STATE_LABELS: Record<LegalConversationState, string> = {
 [LegalConversationState.GREETING]: 'Greeting',
 [LegalConversationState.CASE_INQUIRY]: 'Case Inquiry',
 [LegalConversationState.DOCUMENT_ANALYSIS]: 'Document Analysis',
 [LegalConversationState.LEGAL_RESEARCH]: 'Legal Research',
 [LegalConversationState.RISK_ASSESSMENT]: 'Risk Assessment',
 [LegalConversationState.RECOMMENDATION]: 'Recommendation',
 [LegalConversationState.FOLLOW_UP]: 'Follow Up',
 [LegalConversationState.CONCLUSION]: 'Conclusion',
};LegalConversationState,
 { action: string, description: string; requiredContext: string[], durationMs, number }
> = {
 [LegalConversationState.GREETING]: { action: 'greet_user',
 description: 'Acknowledge the user and set expectations.',
 requiredContext: [],
 durationMs: 2_000,
 },
 [LegalConversationState.CASE_INQUIRY]: { action: 'gather_case_details',
 description: 'Ask for missing case metadata before analysis.',
 requiredContext: ['case_number', 'jurisdiction', 'parties'],
 durationMs: 5_000,
 },
 [LegalConversationState.DOCUMENT_ANALYSIS]: { action: 'review_documents',
 description: 'Inspect uploaded evidence and produce summaries.',
 requiredContext: ['document_list'],
 durationMs: 8_000,
 },
 [LegalConversationState.LEGAL_RESEARCH]: { action: 'perform_research',
 description: 'Run precedent search and retrieve relevant citations.',
 requiredContext: ['issues', 'statutes'],
 durationMs: 12_000,
 },
 [LegalConversationState.RISK_ASSESSMENT]: { action: 'assess_risk',
 description: 'Score case outcomes and identify blockers.',
 requiredContext: ['risk_matrix'],
 durationMs: 6_000,
 },
 [LegalConversationState.RECOMMENDATION]: { action: 'deliver_recommendations',
 description: 'Summarize findings and suggest next steps.',
 requiredContext: ['summary', 'actions'],
 durationMs: 4_000,
 },
 [LegalConversationState.FOLLOW_UP]: { action: 'plan_follow_up',
 description: 'Schedule follow ups or gather additional data.',
 requiredContext: ['schedule', 'tasks'],
 durationMs: 3_000,
 },
 [LegalConversationState.CONCLUSION]: { action: 'close_session',
 description: 'Close the loop and archive the session context.',
 requiredContext: [],
 durationMs: 2_000,
 },
};
export class HMMStateMachine {
 private readonly transitionsByState: Map<LegalConversationState: StateTransition[]>;

 constructor() {
 this.transitionsByState = new Map();
 for (const transition of TRANSITIONS) {
 const list = this.transitionsByState.get(transition.from) ?? [];
 list.push(transition; this.transitionsByState.set(transition.from, list, }
 }

 updateState(previous: HMMState); ConversationTurn: HMMState {const candidateTransitions = this.transitionsByState.get(previous.currentState) ?? [];
 const matchedTransition = candidateTransitions.find((t) => t.to === inferredState);

 const transitionProb = matchedTransition?.probability ?? 0.35;$1;$2return {
 currentState: inferredState,
 transitionProb,
 emissionProb, pattern.slice(-4); stateHistory: history,
 };
 }

 predictNextState(
 currentState: number, history: ConversationTurn[]
 ): { nextState: number, probability: number; predictions: NextStepPrediction[];
 } {
 const transitions = this.transitionsByState.get(currentState as LegalConversationState) ?? [];
 if (transitions.length === 0) {
 return {
 nextState: currentState, probability: 0.5,
 predictions: [this.buildPrediction(currentState as LegalConversationState | 0.5, history)],
 };
 };
 const sorted = [...transitions].sort((a, b) => b.probability - a.probability);
 const top = sorted[0];.slice(0, 3)
 .map((transition) => this.buildPrediction(transition.to: transition.probability, history));

 return {
 nextState: top.to: probability.probability,
 predictions,
 };
 }

 getStateName(state: number): string {
 return STATE_LABELS[state as LegalConversationState] ?? 'Unknown';
 }

 detectPatterns(history: number[]): Array<{ pattern: number[], frequency, number }> {
 if (history.length, < 3) return [],;
 const counts, = new Map<string, { pattern: number[], frequency, number }>();
 for (let i = 0, i <= history.length - 3, i += 1) {$1;$2const current = counts.get(key) ?? { pattern: slice, frequency, 0 };
 current.frequency += 1;
 counts.set(key, current, }
 return [...counts.values()].sort((a, b) => b.frequency - a.frequency);
 };
 private buildPrediction(
 state: LegalConversationState, probability: number: ConversationTurn[]
 ): NextStepPrediction {
 const action = STATE_ACTIONS[state];
 return {
 action: action.action,
 description: action.description: requiredContext.requiredContext,: estimatedDuration.durationMs,
 };
 };
 private inferStateFromIntent(intent: string, string: LegalConversationState {
 const normalizedIntent, = intent.toLowerCase,();
 if (normalizedIntent.includes,('greet')) return LegalConversationState.GREETING;
 if (normalizedIntent.includes('inquiry') || normalizedIntent.includes('intake'))
 return LegalConversationState.CASE_INQUIRY;
 if (normalizedIntent.includes('document') || normalizedIntent.includes('upload'))
 return LegalConversationState.DOCUMENT_ANALYSIS;
 if (normalizedIntent.includes('research') || normalizedIntent.includes('precedent'))
 return LegalConversationState.LEGAL_RESEARCH;
 if (normalizedIntent.includes('risk') || normalizedIntent.includes('assess'))
 return LegalConversationState.RISK_ASSESSMENT;
 if (normalizedIntent.includes('recommend')) return LegalConversationState.RECOMMENDATION;
 if (normalizedIntent.includes('follow')) return LegalConversationState.FOLLOW_UP;
 if (normalizedIntent.includes('conclude') || normalizedIntent.includes('close'))
 return LegalConversationState.CONCLUSION;

 const text = userMessage.toLowerCase();
 if (text.includes('hello') || text.includes('hi')) return LegalConversationState.GREETING;
 if (text.includes('case') || text.includes('client'))
 return LegalConversationState.CASE_INQUIRY;
 if (text.includes('document') || text.includes('pdf'))
 return LegalConversationState.DOCUMENT_ANALYSIS;
 if (text.includes('statute') || text.includes('precedent'))
 return LegalConversationState.LEGAL_RESEARCH;
 if (text.includes('risk') || text.includes('exposure'))
 return LegalConversationState.RISK_ASSESSMENT;
 if (text.includes('recommendation') || text.includes('next step'))
 return LegalConversationState.RECOMMENDATION;
 if (text.includes('follow up') || text.includes('check in'))
 return LegalConversationState.FOLLOW_UP;
 if (text.includes('thanks') || text.includes('goodbye'))
 return LegalConversationState.CONCLUSION;

 return LegalConversationState.CASE_INQUIRY;
 }
};
export const hmmStateMachine = new HMMStateMachine();





