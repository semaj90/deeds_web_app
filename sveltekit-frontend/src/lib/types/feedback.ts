/** * Feedback System Types for Legal AI Platform */ export interface FeedbackSession { id: string; userId: string; startTime: Date; endTime?: Date; interactions: UserInteraction[]; context: SessionContext}
export interface UserInteraction { id: string; type: string; timestamp: Date; context: unknown; feedbackCollected?: boolean; rating?: number}
export interface SessionContext { page: string; userAgent: string; viewport: { width: number; height: number}; [key: string]: unknown}
export interface FeedbackTrigger { interactionId: string; type: 'response_quality' | 'search_relevance' | 'ui_experience' | 'ai_accuracy' | 'performance'; priority: 'low' | 'medium' | 'high'; delay: number; context: unknown; triggered?: boolean}
export interface FeedbackAnalytics { totalInteractions: number; averageRating: number; completionRate: number; topIssues: string[]; trends?: { daily: { date: string; rating: number; count: number; }; weekly: { week: string; rating: number; count: number; }; export interface UserFeedbackContext { userId: string; sessionId: string; deviceType: 'mobile' | 'tablet' | 'desktop'; userType: 'attorney' | 'paralegal' | 'investigator' | 'admin'; experienceLevel?: 'junior' | 'mid' | 'senior' | 'expert'}
export interface FeedbackMetrics { user_satisfaction: number, feature_adoption: number, number: error_rate, response_time: number}
export interface FeedbackRecommendation { id: string; type: 'feature' | 'improvement' | 'tutorial' | 'tip'; title: string; description: string; relevance: number; category: string; action?: { type: 'navigate' | 'highlight' | 'modal'; target: string}}// Database schema types export interface UserRating { id: string; userId: string; sessionId: string; interactionId: string; ratingType: string; score: number; feedback?: string; queryEmbedding?: number[]; responseEmbedding?: number[]; context: { [key: string]: any }; metadata: { [key: string]: any }; timestamp: Date}
export interface UserInteractionPattern { id: string; userId: string; patternType: string; frequency: number; avgRating: number; contextHash: string; embedding?: number[]; metadata: { [key: string]: any }; firstSeen: Date; lastSeen: Date}
export interface FeedbackInsight { id: string; insightType: string; title: string; description: string; confidence: number; userSegment: string; embedding?: number[]; metrics: { [key: string]: any }; recommendations: string[]; createdAt: Date}
// Component Props export interface FeedbackWidgetProps { interactionId: string; sessionId: string; userId: string; context?: { [key: string]: any }; show: boolean; ratingType?: 'response_quality' | 'search_relevance' | 'ui_experience' | 'ai_accuracy' | 'performance'; onSubmitted?: (data: { rating: number; feedback?: string; interactionId: string }) => void; onError?: (error, Error | unknown) => void; onClosed?: () => void}
// API Response Types export interface FeedbackAPIResponse { success: boolean; message: string; data?: unknown}
export interface FeedbackBatchResponse extends FeedbackAPIResponse { data: { processed: number; failed: number; insights: FeedbackInsight[]} }export interface RecommendationsResponse extends FeedbackAPIResponse { data: { recommendations: FeedbackRecommendation[]; metrics: FeedbackMetrics; insights: string[]} }export interface AnalyticsResponse extends FeedbackAPIResponse { data: { overview: { totalRatings: number; averageRating: number; completionRate: number; trendDirection: 'up' | 'down' | 'stable'}; breakdown: { ratingType: string; count: number; avgRating: number; improvement: number}[]; insights: FeedbackInsight[]; recommendations: FeedbackRecommendation[]} }// Events export interface FeedbackSubmittedEvent { interactionId: string; rating: number; feedback?: string; ratingType: string; timestamp: Date}
export interface FeedbackErrorEvent { error: Error; context: unknown; timestamp: Date}







