import { env } from '$env/dynamic/private';
import { CommonErrors } from '../api/response.js';
import { DbCaseOperations, DbEvidenceOperations } from '../db/enhanced-operations.js';
import { checkDatabaseHealth } from '../db/health-check.js';
import type { User } from '../db/schema-postgres.js';
import { cases, evidence } from '../db/schema-postgres.js';

type $Case = typeof cases.$inferSelect;
type $Evidence = typeof evidence.$inferSelect;

// Performance monitoring for SSR
export interface SSRMetrics {
    loadTime: number, dbQueries: number;
    cacheHits: number, errors: string[];
}

// Enhanced cache with TTL
class SSRCache {
    private static cache = new Map<string, { data: unknown, expires: number }>();
    private static readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

    static set(key: string, data: unknown, ttl = SSRCache.DEFAULT_TTL): void {
        this.cache.set(key, { data, expires: Date.now() + ttl });
    }

    static get(key: string): unknown | null {
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expires) {
            this.cache.delete(key);
            return null;
        }
        return entry.data;
    }

    static clear(): void {
        this.cache.clear();
    }

    static getStats(): { size: number; validEntries: number } {
        return {
            size: this.cache.size,
            validEntries: Array.from(this.cache.values()).filter(
                (entry) => Date.now() <= entry.expires
            ).length
        };
    }

    static delete(key: string): boolean {
        return this.cache.delete(key);
    }
}

// Enhanced layout load with performance optimization
export const createEnhancedLayoutLoad = () => {
    return async ({ locals, url, request }: any) => {
        const startTime = Date.now();
        const metrics: SSRMetrics = { loadTime: 0, dbQueries: 0, cacheHits: 0, errors: [] };

        try {
            // Check user session
            let user = locals.user as User | null;
            const session = locals.session;

            // --- START DEV_BYPASS_AUTH LOGIC ---
            const DEV_BYPASS_AUTH = env.DEV_BYPASS_AUTH === 'true';
            if (!user && DEV_BYPASS_AUTH) {
                user = {
                    id: 'dev-bypass-user-id-123',
                    email: 'dev.user@example.com',
                    username: 'DevBypassUser',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    role: 'admin'
                } as User;
                console.warn('DEV_BYPASS_AUTH is active. Using mock user for layout load.');
            }
            // --- END DEV_BYPASS_AUTH LOGIC ---

            // Create cache key for user-specific data
            const userCacheKey = user ? `user_layout_${user.id}` : 'anonymous_layout';

            // Try to get cached layout data
            const cachedData = SSRCache.get(userCacheKey);
            if (cachedData) {
                metrics.cacheHits++;
                return {
                    ...(cachedData as object),
                    session,
                    hydrationContext: createHydrationContext(url, request, user),
                    _metrics: { ...metrics, loadTime: Date.now() - startTime }
                };
            }

            // Database health check (cached globally)
            let dbHealth = SSRCache.get('db_health') as any;
            if (!dbHealth) {
                dbHealth = await checkDatabaseHealth();
                SSRCache.set('db_health', dbHealth, 60000); // 1 minute cache
                metrics.dbQueries++;
            } else {
                metrics.cacheHits++;
            }

            const layoutData: any = {
                dbHealth,
                userCases: [],
                recentEvidence: [],
                caseStats: { total: 0, open: 0, investigating: 0, closed: 0 },
	systemStatus: { apiHealthy: true,
                    pgvectorEnabled: dbHealth?.pgvectorEnabled ?? false
                }
            };

            // Load user-specific data if authenticated
            if (user) {
                try {
                    // Get user's recent cases
                    const casesResult = await DbCaseOperations.search({
                        assignedTo: user.id,
                        limit: 10,
                        offset: 0
                    });
                    metrics.dbQueries++;
                    layoutData.userCases = casesResult?.cases ?? [];

                    // Get case statistics
                    const caseStats = await getCaseStatistics(user.id);
                    metrics.dbQueries++;
                    layoutData.caseStats = caseStats;

                    // Get recent evidence
                    const evidenceResult = await DbEvidenceOperations.search({
                        limit: 5,
                        offset: 0
                    });
                    metrics.dbQueries++;
                    layoutData.recentEvidence = evidenceResult?.evidence ?? [];
                } catch (error: Error | unknown) {
                    console.error('Error loading user layout data:', error);
                    metrics.errors.push(error instanceof Error ? error.message : 'Unknown error');
                }

                // Check AI services status
                try {
                    const aiHealthResponse = await fetch('http://localhost:11434/api/tags', {
                        signal: AbortSignal.timeout(2000)
                    });
                    layoutData.systemStatus.aiServicesOnline = aiHealthResponse.ok;
                } catch {
                    layoutData.systemStatus.aiServicesOnline = false;
                }
            }

            // Cache the layout data
            SSRCache.set(userCacheKey, layoutData, 300000); // 5 minute cache
            metrics.loadTime = Date.now() - startTime;

            return {
                ...layoutData,
                session,
                hydrationContext: createHydrationContext(url, request, user),
                _metrics: metrics
            };
        } catch (error: Error | unknown) {
            console.error('Layout load error:', error);
            metrics.errors.push(error instanceof Error ? error.message : 'Layout load failed');
            metrics.loadTime = Date.now() - startTime;

            // Return minimal safe data on error
            return {
                session: locals.session,
                user: locals?.user ?? null,
                dbHealth: { connected: false,
                    pgvectorEnabled: false,
                    queryTime: 0,
                    errors: ['Database unavailable']
                },
	userCases: [],
                recentEvidence: [],
                caseStats: { total: 0, open: 0, investigating: 0, closed: 0 },
	systemStatus: { apiHealthy: false, pgvectorEnabled: false, aiServicesOnline: false },
	hydrationContext: createHydrationContext(url, request, locals.user),
                _metrics: metrics,
                _error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    };
};

// Enhanced page load factory for cases
export const createEnhancedCasePageLoad = () => {
    return async ({ params, locals, url, parent }: any) => {
        const startTime = Date.now();
        const metrics: SSRMetrics = { loadTime: 0, dbQueries: 0, cacheHits: 0, errors: [] };

        try {
            // Ensure user is authenticated
            const user = locals.user as User;
            if (!user) {
                throw CommonErrors.Unauthorized('Authentication required');
            }

            // Get layout data
            const parentData = await parent();
            const caseId = params.id;

            if (!caseId) {
                throw CommonErrors.BadRequest('Case ID is required');
            }

            // Check cache first
            const cacheKey = `case_${caseId}_${user.id}`;
            const cachedData = SSRCache.get(cacheKey);
            if (cachedData) {
                metrics.cacheHits++;
                metrics.loadTime = Date.now() - startTime;
                return { ...parentData, ...(cachedData as object), _metrics: metrics };
            }

            // Load case with relations
            const caseWithRelations = await DbCaseOperations.getWithRelations(caseId);
            metrics.dbQueries++;

            if (!caseWithRelations) {
                throw CommonErrors.NotFound('Case');
            }

            // Load additional case data
            const evidenceResult = await DbEvidenceOperations.search({
                caseId,
                limit: 50,
                offset: 0
            });
            metrics.dbQueries++;

            const caseData = {
                case: caseWithRelations,
                evidence: evidenceResult?.evidence ?? [],
                canEdit:
                    caseWithRelations.createdBy === user?.id ||
                    caseWithRelations.leadProsecutor === user.id
            };

            // Cache the case data
            SSRCache.set(cacheKey, caseData, 180000); // 3 minute cache
            metrics.loadTime = Date.now() - startTime;

            return { ...parentData, ...caseData, _metrics: metrics };
        } catch (error: Error | unknown) {
            console.error('Case page load error:', error);
            metrics.errors.push(error instanceof Error ? error.message : 'Case load failed');
            metrics.loadTime = Date.now() - startTime;
            throw error; // Re-throw to trigger SvelteKit error handling
        }
    };
};

// Helper function to create hydration context
function createHydrationContext(url: URL, request: Request, user: User | null) {
    return {
        timestamp: new Date().toISOString(),
        route: url.pathname,
        userAgent: request?.headers?.get('user-agent') ?? 'unknown',
        userId: user?.id ?? null,
        // Performance settings for client hydration
        goldenRatio: { phi: 1.618,
            containerWidth: 1200,
            contentRatio: 0.618,
            sidebarRatio: 0.382
        },
	// AI system status for client hydration
        aiSystemStatus: { localLLMEnabled: true,
            ragEnabled: true,
            vectorSearchEnabled: true,
            streamingEnabled: true
        },
	// Theme and UI preferences
        uiPreferences: { theme: 'auto',
            language: 'en',
            accessibility: { highContrast: false,
                reducedMotion: false,
                screenReader: false
            }
        },
	// Cache statistics for debugging
        cacheStats: SSRCache.getStats()
    };
}

// Define the interface for case statistics
interface CaseStatistics {
    total: number, open: number;
    investigating: number, closed: number;
}

// Helper function to get case statistics
async function getCaseStatistics(_userId: string): Promise<CaseStatistics> {
    try {
        // This would need to be implemented with proper aggregation queries
        // For now, return mock data
        return { total: 15, open: 8, investigating: 4, closed: 3 };
    } catch (error: Error | unknown) {
        console.error('Error getting case statistics:', error);
        return { total: 0, open: 0, investigating: 0, closed: 0 };
    }
}

// Cache management utilities
export const SSRCacheUtils = {
    clear: () => SSRCache.clear(),
    getStats: () => SSRCache.getStats(),
    invalidateUser: (userId: string) => {
        SSRCache.delete(`user_layout_${userId}`);
    },
	invalidateCase: (caseId: string, userId: string) => {
        SSRCache.delete(`case_${caseId}_${userId}`);
    }
};

// Export the SSRCache for external use
export { SSRCache };
