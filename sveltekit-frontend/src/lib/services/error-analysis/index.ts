/**
 * Error Analysis barrel export
 * Re-exports singleton factories used by ACPToolRegistry and llm-improvement routes.
 */

export { getDecisionEngine } from './DecisionEngine.js';
export type { DecisionEngine, DecisionEngineConfig, DecisionResult, ProcessResult } from './DecisionEngine.js';

export { getFixSynthesizer } from './FixSynthesizer.js';

export { getMetricsCollector } from './MetricsCollector.js';
export type { MetricsCollector, MetricsConfig, MetricsSnapshot } from './MetricsCollector.js';

export { getExperienceRecorder } from './ExperienceRecorder.js';
export type { ExperienceRecorder } from './ExperienceRecorder.js';

export { getEscalationService } from './EscalationService.js';
export type { EscalationService } from './EscalationService.js';

export { getGRPOPolicy } from './GRPOPolicy.js';

export { getLearningPipeline } from './LearningPipeline.js';
export type { LearningPipeline } from './LearningPipeline.js';

export type * from './types.js';
