declare module '$lib/server/services/analytics-bridge' {
 export function postAnalytics(event: { user_id: string,
 event_type: string,
 payload?: unknown;
 timestamp?: number;
 }): Promise<any>;
 export function fetchIntent(userId: string): Promise<any | null>;
}
export interface UserAnalyticsEvent {
 userId: string; action: string;
 payload?: Record<string, unknown>;
 timestamp?: string;
}
export interface IntentPrediction {
 userId: string;
 clusterId?: string | null;
 predictedIntent?: string | null;
 confidence: number;
}
export interface AdapterSelection {
 adapterName: string;
 rewardScore?: number;
 clusterId?: string;
}




