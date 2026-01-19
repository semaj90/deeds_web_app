import type { FeedbackRecommendation, UserFeedbackContext } from '$lib/types/feedback';
import { RunnableSequence } from '@langchain/core/runnables';
import { PromptTemplate } from '@langchain/core/prompts';
import type { Writable } from 'svelte/store';
import { get, writable } from 'svelte/store';
// TODO: Verify these imports exist in your project or install @langchain/community
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { StringOutputParser } from '@langchain/core/output_parsers';

// Mock advancedCache if not available (restoring logic from context)
const advancedCache = {
    invalidateByTags: async (tags: string[]) => console.log('Cache invalidated:', tags)
};
const RECOMMENDATION_WORKER_PATH = '/workers/recommendation-worker.js'; // TODO: Confirm path

interface RecommendationContext {
    userQuery: string;
    legalDomain: string;
    userRole: string;
    priority: string;
}

interface Recommendation {
    id: string;
    title: string;
    description: string;
    confidence: number;
    actionable: boolean;
    category: string;
}

export class AIRecommendationEngine {
    private recommendations: Writable<Recommendation[]> = writable([]);
    private queryHistory: Writable<string[]> = writable([]);
    private userPatterns: Writable<Map<string, number>> = writable(new Map());

    private workerClient: Worker | null = null;
    private interpreter: any; // TODO: Type this properly with XState service
    private llmChain: RunnableSequence | null = null;

    // In-memory cache structures
    private userPatternsStore: Map<string, any[]> = new Map();
    private recommendationsStore: Map<string, any[]> = new Map();

    constructor() {
        // Initialize mock interpreter - TODO: Replace with actual machine service
        this.interpreter = {
            send: (event: any) => console.log('[AI Engine] State Event:', event)
        };

        if (typeof window !== 'undefined') {
            this.initializeCacheStore();
            this.initializeWorker();
            this.initializeLangChain();
        }
    }

    // Public API methods
    getRecommendations() { return this.recommendations; }
    getQueryHistory() { return this.queryHistory; }
    getUserPatterns() { return this.userPatterns; }

    async clearRecommendations() {
        this.recommendations.set([]);
        await advancedCache.invalidateByTags(['recommendations']);
    }

    async getRecommendationStats() {
        const patterns = get(this.userPatterns);
        const recommendations = get(this.recommendations);

        const totalQueries = Array.from(patterns.values()).reduce((sum, count) => sum + count, 0);

        return {
            totalQueries,
            uniqueQueries: patterns.size,
            recommendationCount: recommendations.length,
            highConfidenceRecs: recommendations.filter((r) => r.confidence > 0.7).length,
            actionableRecs: recommendations.filter((r) => r.actionable).length
        };
    }

    // === UTILITIES ===
    private similarity(str1: string, str2: string): number {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        if (longer.length === 0) return 1.0;
        const distance = this.levenshteinDistance(longer, shorter);
        return (longer.length - distance) / longer.length;
    }

    private levenshteinDistance(str1: string, str2: string): number {
        const matrix = Array(str2.length + 1)
            .fill(null)
            .map(() => Array(str1.length + 1).fill(null));
        for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,
                    matrix[j - 1][i] + 1,
                    matrix[j - 1][i - 1] + indicator
                );
            }
        }
        return matrix[str2.length][str1.length];
    }

    private hashContext(context: RecommendationContext): string {
        return btoa(
            JSON.stringify({
                query: context.userQuery,
                domain: context.legalDomain,
                role: context.userRole,
                priority: context.priority
            })
        )
        .replace(/[^a-zA-Z0-9]/g, '')
        .substring(0, 32);
    }

    private hashString(str: string): string {
        return btoa(str)
            .replace(/[^a-zA-Z0-9]/g, '')
            .substring(0, 16);
    }

    // === NEW ENHANCED INTEGRATION METHODS ===

    /**
     * Initialize Service Worker for background processing
     */
    private async initializeWorker() {
        if (typeof Worker !== 'undefined' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
            try {
                // Register service worker if not already registered
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('✅ AI Recommendation Service Worker registered: ', registration);

                // Create dedicated worker for recommendations
                this.workerClient = new Worker(RECOMMENDATION_WORKER_PATH);
                this.workerClient.onmessage = (event: MessageEvent) => {
                    this.interpreter.send({ type: 'RECOMMENDATIONS_GENERATED', data: event.data });
                    // TODO: Handle recommendation data updates here
                };
                this.workerClient.onerror = error => {
                    console.error('❌ Recommendation Worker error: ', error);
                    this.interpreter.send({ type: 'ERROR', data: { message: 'Worker Error' } });
                };
            } catch (error: unknown) {
                console.error('❌ Service Worker registration failed: ', error);
            }
        }
    }

    /**
     * Initialize LangChain.js with Ollama for enhanced AI processing
     */
    private async initializeLangChain() {
        try {
            // TODO: Use env vars properly (import.meta.env.VITE_OLLAMA_URL)
            const baseUrl = 'http://localhost:11434';

            const llm = new ChatOllama({
                baseUrl,
                model: 'gemma3-legal',
                temperature: 0.7,
                // topK: 40,
                // topP: 0.9
            });

            const prompt = PromptTemplate.fromTemplate(`
                You are an AI recommendation engine for a Legal AI Platform specializing in user experience optimization.
                User Context:
                - Role: {userRole}
                - Experience: {experienceLevel}
                - Device: {deviceType}
                - Legal Domain: {legalDomain}

                Current Query: {userQuery}
                User Behavior Patterns: {userPatterns}
                Recent Interactions: {recentInteractions}

                Generate intelligent recommendations to improve the user's workflow and experience.
                Focus:
                1. Legal research efficiency improvements
                2. Workflow optimization suggestions
                3. Feature discovery based on their role and domain
                4. Learning opportunities relevant to their experience level
                5. Time-saving shortcuts and advanced features

                Format as JSON array: with id, type, title, description, relevance (0-1), category, actionable (boolean).
                Limit to 5 most relevant recommendations.
            `);

            const parser = new StringOutputParser();

            this.llmChain = RunnableSequence.from([
                prompt,
                llm,
                parser
            ]);

            console.log('✅ LangChain.js initialized with Ollama gemma3-legal');
            this.interpreter.send({ type: `INITIALIZED` });
        } catch (error: unknown) {
            console.error('❌ Failed to initialize LangChain.js: ', error);
            this.interpreter.send({ type: 'ERROR', data: { message: error instanceof Error ? error.message : String(error) } });
        }
    }

    /**
     * Initialize cache store
     */
    private initializeCacheStore() {
        // Load from localStorage if available
        if (typeof localStorage !== 'undefined') {
            try {
                const storedPatterns = localStorage.getItem('ai-recommendation-patterns');
                if (storedPatterns) {
                    const patterns = JSON.parse(storedPatterns);
                    this.userPatternsStore = new Map(Object.entries(patterns));
                    // TODO: hydration logic
                }
                const storedRecs = localStorage.getItem('ai-recommendation-store');
                if (storedRecs) {
                    const recs = JSON.parse(storedRecs);
                    this.recommendationsStore = new Map(Object.entries(recs));
                    // TODO: hydration logic
                }
            } catch (error) {
                console.error('Error loading cached recommendations : ', error);
            }
            console.log('✅ Cache store initialized');
        }
    }

    /**
     * Enhanced recommendation generation using all integrated technologies
     */
    async generateEnhancedRecommendations(
        userContext: UserFeedbackContext,
        query: string,
        legalDomain: string = 'general'
    ): Promise<FeedbackRecommendation[]> {
        // Update XState machine context
        this.interpreter.send({ type: 'UPDATE_USER_CONTEXT', data: { userContext, query, legalDomain } });

        // TODO: Complete implementing the generation logic:
        // 1. Check cache
        // 2. Invoke LLM Chain
        // 3. Process with Worker
        // 4. Update stores

        return get(this.recommendations) as FeedbackRecommendation[];
    }
}

export const aiRecommendationEngine = new AIRecommendationEngine();






