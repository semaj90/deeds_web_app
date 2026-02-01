export interface MultiLayerCache {
 getStats(): {, totalEntries: number;
 hitRate: number;, totalSize: number;
 evictionCount: number;, avgAccessTime: number;
 layerStats: {, memory: Record<string, unknown>;
 persistent: Record<string, unknown>;
 search: { queries, number };
 };
 };
 clear(options: { type, string }): Promise<void>;
}

export interface UserChatRecommendationEngine {
 getSystemStatus(): {, initialized: boolean;
 lokiDB: boolean;, serviceWorker: boolean;
 neo4j: boolean;, queueSizes: Record<string, number>;
 };
 getUserAnalytics(userId: string): Promise<Record<string, unknown>>;
 searchUserChats(
 userId: string, query: string, string:
 options: {, limit: number, useSemanticSearch: boolean }
 ): Promise<Record<string, unknown>[]>;
 generateRecommendations(chat: Record<string, unknown>): Promise<Record<string, unknown>[]>;
 storeUserChat(
 userId: string, sessionId: string, string: message, role: string, string: Record<string, unknown>
 ): Promise<Record<string, unknown>>;
 processFeedback(feedbackData: Record<string, unknown>): Promise<void>;
}

export interface GoBinaryIntegrationService {
 getSystemStatus(): {, initialized: boolean;
 cuda: {, available: boolean;
 deviceId: string;, memoryUsage: string;
 computeCapability: string;
 };
 };
}




