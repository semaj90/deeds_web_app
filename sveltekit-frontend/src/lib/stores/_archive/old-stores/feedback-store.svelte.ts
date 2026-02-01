/** * Global Feedback Store for Legal AI Platform * Manages feedback collection across all user interactions */ import { getContext, setContext } from 'svelte'; import type { FeedbackSession, FeedbackTrigger, FeedbackAnalytics, UserFeedbackContext } from '../types/feedback.js'; export interface FeedbackState { activeSession: FeedbackSession, null: FeedbackTrigger[], analytics: FeedbackAnalytics, userContext: UserFeedbackContext, isCollecting: boolean}
class FeedbackStore { private state = $state <FeedbackState>({ activeSession: null, pendingFeedback: [], analytics: {
	totalInteractions: 0, averageRating: 0, completionRate: 0, topIssues: [] },
	userContext: {
	userId: '', sessionId: '', deviceType: 'desktop', userType: 'attorney' },
	isCollecting: false });
  
export function getFeedbackStore(): FeedbackStore { const store = getContext<FeedbackStore>(FEEDBACK_STORE_KEY); if (!store) { throw new Error('Feedback store not found. Make sure to call setFeedbackStore in a parent component.')} return store}
export function setFeedbackStore(store: FeedbackStore): void { setContext(FEEDBACK_STORE_KEY, store)}
// Global store instance for direct usage export const feedbackStore = createFeedbackStore();





