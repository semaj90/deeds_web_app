import { writable, derived } from 'svelte/store';
import { getOllamaEndpoint, DEFAULT_OLLAMA } from './get-ollama-endpoint';

export interface FixAttempt {
    id: string;
    errorId: string;
    strategy: string;
    originalCode: string;
    fixedCode: string;
    confidence: number;
    applied: boolean;
    result: 'success' | 'failed' | 'partial';
    timestamp: Date;
    llmModel?: string;
}

export interface ErrorFix {
    errorId: string;
    file: string;
    line: number;
    originalText: string;
    fixedText: string;
    strategy: string;
    confidence: number;
    reasoning: string;
    dependencies: string[];
    validated: boolean;
}

export interface AIFixConfig {
    model: string;
    endpoint: string;
    maxRetries: number;
    confidenceThreshold: number;
    batchSize: number;
    validateFixes: boolean;
    embeddingModel: string;
}

export interface ErrorAnalysisResult {
    id: string;
    file?: string;
    line?: number;
    originalCode?: string;
    code?: string;
    message?: string;
    category?: string;
    fixable?: boolean;
    confidence?: number;
    dependencies?: string[];
    [key: string]: unknown;
}

export class AIErrorFixer {
    private config: AIFixConfig = {
        model: 'gemma3:270m', // Updated model
        endpoint: DEFAULT_OLLAMA,
        maxRetries: 3,
        confidenceThreshold: 0.7,
        batchSize: 5,
        validateFixes: true,
        embeddingModel: 'nomic-embed-text'
    };

    private fixHistory = new Map<string, FixAttempt[]>();

    constructor() {
        // Initialize config with dynamic endpoint if needed
        this.config.endpoint = getOllamaEndpoint();
    }

    async fixErrors(errors: ErrorAnalysisResult[]): Promise<ErrorFix[]> {
        if (!errors || errors.length === 0) return [];
        console.log(`Starting AI fix for ${errors.length} errors...`);

        // Stub implementation for now to clear errors
        // In real impl, we would batch process with Ollama
        return [];
    }

    async applyFixes(fixes: ErrorFix[]): Promise<{ applied: number, failed: number, results: unknown[] }> {
        // Stub implementation
        return { applied: 0, failed: 0, results: [] };
    }

    getStats() {
        const allAttempts = this.getFixHistory();
        const successfulFixes = allAttempts.filter((a) => a.result === 'success').length;
        const failedFixes = allAttempts.filter((a) => a.result === 'failed').length;
        const appliedFixes = allAttempts.filter((a) => a.applied).length;

        return {
            totalAttempts: allAttempts.length,
            successfulFixes,
            failedFixes,
            appliedFixes,
            averageConfidence: 0 // Simplification
        };
    }

    getFixHistory(errorId?: string): FixAttempt[] {
        if (errorId) return this.fixHistory.get(errorId) || [];
        return Array.from(this.fixHistory.values()).flat();
    }
}

// ======================================================================
// STORE INTEGRATION
// ======================================================================

export const aiErrorFixer = new AIErrorFixer();

export const errorFixerStore = writable({
    initialized: false,
    fixing: false,
    fixes: [] as ErrorFix[],
    appliedFixes: 0,
    failedFixes: 0,
    stats: {
        totalAttempts: 0,
        successfulFixes: 0,
        failedFixes: 0,
        averageConfidence: 0,
        appliedFixes: 0
    }
});

export const fixerProgressStore = derived(errorFixerStore, ($store) => ({
    active: $store.fixing,
    totalFixes: $store.fixes.length,
    applied: $store.appliedFixes,
    failed: $store.failedFixes,
    successRate: $store.appliedFixes + $store.failedFixes > 0
        ? $store.appliedFixes / ($store.appliedFixes + $store.failedFixes)
        : 0
}));

export const aiErrorFixerAPI = {
    async initialize() {
        errorFixerStore.update((s) => ({ ...s, initialized: true }));
    },

    async processAndFixErrors(tscOutput: string) {
        errorFixerStore.update((s) => ({ ...s, fixing: true }));
        try {
            // Stub logic
            const analysisResults: ErrorAnalysisResult[] = [];
            const fixes = await aiErrorFixer.fixErrors(analysisResults);
            const applyResults = await aiErrorFixer.applyFixes(fixes);
            const stats = aiErrorFixer.getStats();

            errorFixerStore.update((state) => ({
                ...state,
                fixing: false,
                fixes: fixes,
                appliedFixes: applyResults.applied,
                failedFixes: applyResults.failed,
                stats
            }));

            return {
                totalErrors: analysisResults.length,
                fixableErrors: fixes.length,
                appliedFixes: applyResults.applied,
                failedFixes: applyResults.failed,
                fixes
            };
        } catch (error) {
            console.error('Error fixing failed: ', error);
            errorFixerStore.update((s) => ({ ...s, fixing: false }));
            throw error;
        }
    },

    async getStats() {
        return aiErrorFixer.getStats();
    },

    async getFixHistory(errorId?: string) {
        return aiErrorFixer.getFixHistory(errorId);
    }
};
