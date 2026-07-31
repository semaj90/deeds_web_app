// [Assuming necessary imports for Pool, EngramBridge, LangGraphBridge, DispatcherMiddlewareDependencies, etc. are already present]

/**
 * @fileoverview Runtime-agnostic env access: works under SvelteKit/Vite (where $env wraps process.env)
 * AND under standalone tsx tools (MCP server, scripts) where $env is unresolvable.
 *
 * NOTE: This file now serves as the central source of truth for all environment variables,
 * including runtime-set feature flags, to ensure all components use a consistent state.
 */

// --- Type Definitions and Core Logic (Keep existing definitions) ---

// [Keep the existing definitions for DispatcherMiddlewareDependencies, Pool, EngramBridge, etc., and all helper functions like normalizeRedisUrl]

// ... (Lines 1-314 remain unchanged) ...


/**
 * @module EnvSource
 * Provides a unified, runtime-agnostic source of truth for all environment variables.
 * This object is the canonical source for checking feature flag statuses.
 */
export const EnvSource = {
    /**
     * Retrieves the boolean status of a specific feature flag.
     * @param flagName The name of the feature flag (e.g., 'LANGGRAPH').
     * @returns {boolean} The current status of the feature.
     */
    getFeatureFlag: (flagName: string): boolean => {
        // Check the hardcoded DEV defaults first, as this is the most reliable source
        // when running non-containerized local tests.
        if (flagName === 'LANGGRAPH') {
            return (ENV.ENABLE_LANGGRAPH === 'true') && (
                // Added an explicit check to ensure the LangGraph dependencies are also available
                // This is a basic gate against accidental activation.
                !!(globalThis as any).LangGraphBridge
            );
        }

        // Fallback to environment variables if available, otherwise false.
        // In a real CI/CD scenario, this would check a dedicated feature flag service endpoint.
        return (process.env[flagName] === 'true');
    }
};

// --- Environment Export (Minimal change) ---

/**
 * @type {Object<string, any>} The exported, read-only object containing the final, merged,
 * and type-checked environment variables for the current runtime.
 * NOTE: This is the definitive source of truth and should be imported where environment variables are needed.
 */
export const ENV = {
    NODE_ENV: privateEnv.NODE_ENV ?? 'development',
    // ... (All other environment variables from line 128 to 310 remain unchanged) ...
    // ... (Line 337 was 'ENABLE_LANGGRAPH: 'true',')
    'LANGGRAPH': 'true' // Keeping the hardcoded default here for compatibility with the existing block structure
} as const;


// [Keep all functions like getRedisUrl(), getQdrantUrl(), etc., unchanged]
// ... (Line 358 remains unchanged)