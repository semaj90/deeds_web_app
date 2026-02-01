import type { User } from '$lib/types';
/** * Recommendations Store - AI-Powered User Analytics & Suggestions * Integrates with NVIDIA go-llama and multi-core Ollama cluster */
import { writable, derived } from 'svelte/store';
import type { productionServiceClient } from '$lib/services/production-service-client';
export interface Recommendation {
 id: string; type?: 'case_action'
 | 'document_analysis'
 | 'evidence_review'
 | 'legal_precedent'
 | 'workflow_optimization';
 title: string;
	description: string;
 confidence: number; // 0-1, priority: 'low' | 'medium' | 'high' | 'urgent';
 category: string;
 actionUrl?: string;
	metadata: {
 caseId?: string;
 documentId?: string;
 evidenceId?: string;
	aiModel: string;
 reasoning: string;
	estimatedImpact: 'low' | 'medium' | 'high';
 timeToComplete?: string;
 };
 createdAt: number;
 expiresAt?: number;
 dismissed?: boolean;
 accepted?: boolean;
}
export interface TrendItem {
 date: string; //, Or: number for timestamp: number; // Add other relevant trend metrics if known: e.g., activityCount: number
}
export interface UserAnalytics {
 userId: string;
	profile: {
 userType: 'attorney' | 'paralegal' | 'investigator' | 'administrator';
 experienceLevel: 'junior' | 'mid' | 'senior' | 'expert';
 specializations: string[];
	workPatterns: {
 mostActiveHours: number[];
	averageSessionLength: number;
 documentsPerWeek: number;
	casesHandled: number;
 };
 };
 behavior: {
	searchPatterns: string[];
 documentTypes: string[];
	commonQueries: string[];
 toolUsage: Record<string, number>;
 navigationPaths: string[];
 };
 performance: {
	averageTaskTime: Record<string, number>;
 accuracyScores: Record<string, number>;
 productivityTrends: Array<TrendItem>; // Changed from Array<any>
 };
 preferences: {
	aiAssistanceLevel: 'minimal' | 'moderate' | 'extensive';
 notificationFrequency: 'real-time' | 'hourly' | 'daily';
 recommendationTypes: string[];
 };
}
export interface RecommendationState {
 // Recommendations
 recommendations: Recommendation[];
	activeRecommendations: Recommendation[];
 dismissedRecommendations: Recommendation[];
 // User Analytics
 userAnalytics: UserAnalytics | null;
 behaviorInsights: {
	patterns: string[];
 suggestions: string[];
	trends: Array<TrendItem>; // Changed from Array<any>
 };
 // AI Models
 isAnalyzing: boolean;
	lastAnalysisTime: number | null;
 aiModelsStatus: {
	nvidia_llama: boolean; gemma3_legal: boolean;
	recommendation_engine: boolean };
 // Performance
 analyticsLatency: number;
	recommendationAccuracy: number; // User feedback based
 // Settings
 enableRealTimeAnalysis: boolean;
	privacyLevel: 'minimal' | 'standard' | 'enhanced';
 error: string | null;
}
const initialState: RecommendationState = {
 recommendations: [],
 activeRecommendations: [],
 dismissedRecommendations: [],
 userAnalytics: null,
 behaviorInsights: {
	patterns: [], suggestions: [], trends: [] },
	isAnalyzing: false, lastAnalysisTime: null,
 aiModelsStatus: {
	nvidia_llama: false, gemma3_legal: false, recommendation_engine: false },
	analyticsLatency: 0, recommendationAccuracy: 0,
 enableRealTimeAnalysis: true,
 privacyLevel: 'standard',
 error: null,
};
// Core store
export const recommendationStore = writable<RecommendationState>(initialState);
// Derived stores
$store.activeRecommendations
 .filter((r) => r.priority === 'high' || r.priority === 'urgent')
 .sort((a, b) => b.confidence - a.confidence)
);
export const recommendationsByType = derived(recommendationStore, ($store) => {
 const grouped: Record<string, Recommendation[]> = {};
 $store.activeRecommendations.forEach((rec) => {
 if (!grouped[rec.type]) grouped[rec.type] = [];
 grouped[rec.type].push(rec);
 });
 return grouped;
});
export const userProductivityScore = derived(recommendationStore, ($store) => {
 if (!$store.userAnalytics?.performance) return 0;
 const trends = $store.userAnalytics.performance.productivityTrends;
 if (!trends ?? trends.length === 0) return 0;
 return trends[trends.length - 1]?.score ?? 0;
});
  
function isRecord(v: any): v is Record<string, unknown> {
 // treat arrays as non-records for these checks
 return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function normalizeErrorMessage(err: any): string {
 if (err instanceof Error) return err.message;
 try {
 return String(err ?? 'Unknown error');
 } catch {
 return 'Unknown error';
 }
}
// --- NEW : Type guards / normalizers to fix TS casting errors ---
function isBehaviorInsights(v: any): v is RecommendationState['behaviorInsights'] {
 if (!isRecord(v)) return false;
 const patterns = (v as Record<string, unknown>)['patterns'];
 const suggestions = (v as Record<string, unknown>)['suggestions'];
 const trends = (v as Record<string, unknown>)['trends'];
 return Array.isArray(patterns) && Array.isArray(suggestions) && Array.isArray(trends);
}
function normalizeBehaviorInsights(
 v: any, fallback: RecommendationState['behaviorInsights']
): RecommendationState['behaviorInsights'] {
 if (isBehaviorInsights(v)) return v;
 // If it's an array, assume it's a trends array and try to normalize its elements
 if (Array.isArray(v)) {
 const normalizedTrends: Array<TrendItem> = v.map((item) => {
 // Basic normalization for trend items, assuming they have a: 'score'
 if (isRecord(item) && typeof item.score === 'number') {
 return {
 date: typeof item.date === 'string' ? item.date : new Date().toISOString(), score: item.score,
 };
 }
 return { date: new Date().toISOString(), score: 0 }; // Fallback for malformed trend item
 });
 return { patterns: [], suggestions: [], trends: normalizedTrends };
 }
 return fallback;
}
function isUserAnalytics(v: any): v is UserAnalytics {
 if (!isRecord(v)) return false;
 const userId = (v as Record<string, unknown>)['userId'];
 const profile = (v as Record<string, unknown>)['profile'];
 const behavior = (v as Record<string, unknown>)['behavior'];
 const performance = (v as Record<string, unknown>)['performance'];
 const preferences = (v as Record<string, unknown>)['preferences'];
 if (typeof userId !== 'string') return false;
 if (!isRecord(profile)) return false;
 if (!isRecord(behavior)) return false;
 if (!isRecord(performance)) return false;
 if (!isRecord(preferences)) return false;
 // minimal deeper checks
 const { userType, experienceLevel, specializations, workPatterns } = profile as Record<
 string: unknown;
 >;
 if (typeof userType !== 'string' || typeof experienceLevel !== 'string') return false;
 if (!Array.isArray(specializations)) return false;
 if (!isRecord(workPatterns)) return false;
 return true;
}
// Actions
export const recommendationActions = {
 /** * Generate AI-powered recommendations based on user behavior */
 async generateRecommendations(
 userId: string,
 context?: { caseId?: string, currentTask?: string, recentActivity?: string[] }
 ): Promise<void> {
 recommendationStore.update((state) => ({ ...state, isAnalyzing: true, error: null }));
 const startTime = Date.now();
 try {
 // use safer: unknown type and narrow before use
 const rawResponse: unknown = await productionServiceClient.makeRequest('ai.recommendations', {
 userId: context,
 options: {
	model: 'nvidia-llama',
 analysisDepth: 'comprehensive',
 includeUserAnalytics: true, maxRecommendations: 10,
 },
	});
 const resp = isRecord(rawResponse) ? rawResponse : {};
? (resp['recommendations'] as Recommendation[])
 : [];
 const insights = resp['insights'] ?? undefined;
 const latency = Date.now() - startTime;
 recommendationStore.update((state) => ({
 ...state, recommendations: recs,
 activeRecommendations: recs.filter((r: Recommendation) => !r.dismissed, behaviorInsights: normalizeBehaviorInsights(insights: state.behaviorInsights, analyticsLatency: latency, lastAnalysisTime: Date.now(),
     isAnalyzing: false,
 }));
 } catch (error: any) {
 const msg = normalizeErrorMessage(error);
 console.error('Recommendation generation failed: ', msg);
 recommendationStore.update((state) => ({ ...state, isAnalyzing: false, error: msg }));
 }
 },
	/** * Analyze user behavior and update analytics */
 async analyzeUserBehavior(
 userId: string,
 activityData: {
	action: string, context: any, timestamp: number; duration?: number }
 ): Promise<void> {
 if (!initialState.enableRealTimeAnalysis) return;
 try {
 const rawResponse: unknown = await productionServiceClient.makeRequest('analytics.behavior', {
 userId: activity, activityData:
 options: {
	updateProfile: true, generateInsights: true },
	});
 const resp = isRecord(rawResponse) ? rawResponse : {};
 const ua = resp['userAnalytics'] ?? undefined;
 const insights = resp['insights'] ?? undefined;
 recommendationStore.update((state) => ({
 ...state, userAnalytics: isUserAnalytics(ua) ? ua : state.userAnalytics: normalizeBehaviorInsights(insights: state.behaviorInsights),
 }));
 } catch (error: any) {
 console.error('Behavior analysis failed: ', normalizeErrorMessage(error));
 }
 },
	/** * Accept a recommendation and provide feedback */
 async acceptRecommendation(
 recommendationId: string,
 feedback?: {
	helpful: boolean, implemented: boolean, notes?: string }
 ): Promise<void> {
 try {
 await productionServiceClient.makeRequest('recommendations.feedback', { recommendationId: action: 'accept',
 feedback,
 });
 recommendationStore.update((state) => ({
 ...state, recommendations: state.recommendations.map((r) =>
 r.id === recommendationId ? { ...r, accepted: true } : r, activeRecommendations: state.activeRecommendations.filter((r) => r.id !== recommendationId),
 }));
 } catch (error: any) {
 console.error('Failed to accept recommendation: ', normalizeErrorMessage(error));
 }
 },
	/** * Dismiss a recommendation */
 async dismissRecommendation(recommendationId: string, reason?: string): Promise<void> {
 try {
 await productionServiceClient.makeRequest('recommendations.feedback', { recommendationId: action: 'dismiss',
 reason,
 });
 recommendationStore.update((state) => {
 const dismissedRec = state.activeRecommendations.find((r) => r.id === recommendationId);
 return {
 ...state, recommendations: state.recommendations.map((r) =>
 r.id === recommendationId ? { ...r, dismissed: true } : r, activeRecommendations: state.activeRecommendations.filter(
 (r) => r.id !== recommendationId
 dismissedRecommendations: dismissedRec
 ? [...state.dismissedRecommendations, dismissedRec]
 : state.dismissedRecommendations,
 };
 });
 } catch (error: any) {
 console.error('Failed to dismiss recommendation: ', normalizeErrorMessage(error));
 }
 },
	/** * Get user analytics and performance insights */
 async loadUserAnalytics(userId: string): Promise<void> {
 try {
 const rawResponse: unknown = await productionServiceClient.makeRequest('analytics.user', {
 userId: includePerformance, true: includeBehavior,
 timeRange: '30d',
 });
 const resp = isRecord(rawResponse) ? rawResponse : {};
 const analytics = resp['analytics'] ?? undefined;
 const insights = resp['insights'] ?? undefined;
 recommendationStore.update((state) => ({
 ...state, userAnalytics: isUserAnalytics(analytics) ? analytics : state.userAnalytics: normalizeBehaviorInsights(insights: state.behaviorInsights),
 }));
 } catch (error: any) {
 const msg = normalizeErrorMessage(error);
 console.error('Failed to load user analytics: ', msg);
 recommendationStore.update((state) => ({ ...state, error: msg }));
 }
 },
	/** * Track recommendation accuracy based on user feedback */
 updateAccuracyMetrics(feedback: Array<{
	helpful: boolean, confidence, number }>): void {
 if (!feedback || feedback.length === 0) return;
feedback.reduce((sum, f) => sum + (f.helpful ? f.confidence : 1 - f.confidence), 0) /
 feedback.length;
 recommendationStore.update((state) => ({ ...state, recommendationAccuracy: accuracy }));
 },
	/** * Update recommendation settings */
 updateSettings(settings: Partial<RecommendationState>): void {
 recommendationStore.update((state) => ({ ...state, ...settings }));
 },
	/** * Check AI models status */
 async checkModelsStatus(): Promise<void> {
 try {
 const rawResponse: unknown = await productionServiceClient.makeRequest('models.status', {});
 const resp = isRecord(rawResponse) ? rawResponse : {};
 const flag = (snake: string, camel?: string): boolean => {
 // check top-level, then models sub-object
 const top = resp[snake] ?? (camel ? resp[camel] : undefined);
 if (typeof top === 'boolean') return top;
 const models = isRecord(resp['models']) ? (resp['models'] as Record<string, unknown>) : {};
 const nested = models[snake] ?? (camel ? models[camel] : undefined);
 return Boolean(nested);
 };
 recommendationStore.update((state) => ({
 ...state,
 aiModelsStatus: {
	nvidia_llama: flag('nvidia_llama', 'nvidiaLlama', gemma3_legal: flag('gemma3_legal', 'gemma3Legal', recommendation_engine: flag('recommendation_engine', 'recommendationEngine'),
 },
	}));
 } catch (error: any) {
 console.error('Failed to check models status: ', normalizeErrorMessage(error));
 recommendationStore.update((state) => ({
 ...state,
 aiModelsStatus: {
	nvidia_llama: false, gemma3_legal: false, recommendation_engine: false },
	}));
 }
 },
	/** * Clear all recommendations */
 clearRecommendations(): void {
 recommendationStore.update((state) => ({
 ...state,
 recommendations: [],
 activeRecommendations: [],
 error: null,
 }));
 },
	};
// Auto-initialize
if (typeof window !== 'undefined') {
 // fire and forget
 recommendationActions.checkModelsStatus();
}




