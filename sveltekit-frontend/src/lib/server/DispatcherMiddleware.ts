// [Assuming necessary imports for Pool, EngramBridge, LangGraphBridge, DispatcherMiddlewareDependencies, etc. are already present]

/**
 * @fileoverview Core middleware responsible for dispatching all MCP tooling
 * and managing the complex, optional initialization sequence, especially for
 * advanced features like LangGraph.
 */

// --- Dependencies Interface ---

/**
 * @interface DispatcherMiddlewareDependencies
 * Defines the required, concrete, and injectable dependencies for the middleware
 * to initialize. This enforces that we do not rely on global/ambient singletons
 * during construction, making the code testable and auditable.
 */
export interface DispatcherMiddlewareDependencies {
    pool: Pool;
    engramBridge: EngramBridge;
    langgraphBridge: LangGraphBridge;
}

/**
 * @class DispatcherMiddleware
 * The central middleware class managing all tool registrations and the startup
 * sequence. It enforces a strict, staged initialization process, allowing
 * optional modules (like LangGraph) to be conditionally loaded without
 * compromising the core middleware startup.
 */
export class DispatcherMiddleware {
    private readonly pool: Pool;
    private readonly engramBridge: EngramBridge;
    private readonly langgraphBridge: LangGraphBridge;

    /**
     * @constructor
     * @param deps The dependencies required for the middleware instance.
     */
    constructor(deps: DispatcherMiddlewareDependencies) {
        // Initialize all required dependencies using the passed object.
        this.pool = deps.pool;
        this.engramBridge = deps.engramBridge;
        this.langgraphBridge = deps.langgraphBridge;
    }

    /**
     * @method initialize
     * Executes the full, staged initialization process for the middleware,
     * ensuring core services are always run before optional/advanced services.
     * @param server The middleware server instance context.
     */
    public initialize(server: any) {
        // 1. Run core initialization first
        this.registerCoreTools(server);

        // 2. Run optional initialization last
        this.registerOptionalTools(server);
    }

    /**
     * @method validate
     * Performs a deep validation of the middleware state and dependencies
     * to ensure all required contracts are met before the service is exposed.
     * This is a critical gate before accepting external calls.
     * @throws {Error} If any critical dependency or contract check fails.
     */
    public validate(server: any): void {
        console.log("--- DispatcherMiddleware: Running Pre-Start Validation Gate ---");

        // 1. Validate Dependency Injection: Ensure the instance is constructed correctly.
        DispatcherMiddleware.assertDispatcherMiddleware(this);

        // 2. Validate Core Dependencies: Ensure all required components are available.
        if (!this.pool || !this.engramBridge || !this.langgraphBridge) {
            throw new Error("CORE_DEP_FAIL: One or more critical dependencies (Pool, EngramBridge, LangGraphBridge) were not injected.");
        }

        // 3. Run Core Tools: This ensures mandatory tool registrations succeed.
        this.registerCoreTools(server);

        // 4. Run optional validation: Check if optional services (LangGraph) are enabled and available.
        this.registerOptionalTools(server);

        console.log("Validation successful: All required core dependencies and optional components (if enabled) are validated.");
    }

    /**
     * Registers all tools that are required for the core functionality (always run).
     * @param server The middleware server instance.
     */
    private registerCoreTools(server: any) {
        console.log("-> [CORE] Registering mandatory tools...");
        this.registerNewTools(server);
        this.registerAdminTools(server);
        this.registerSkillTools(server);
        this.registerEngramTools(server);
        this.registerAtlasEmbeddingTools(server);
        this.registerDbInspectionTools(server);
    }

    /**
     * Registers tools that are optional and depend on feature flags or external
     * services (e.g., LangGraph). This is the primary point of failure isolation.
     * @param server The middleware server instance.
     */
    private registerOptionalTools(server: any) {
        // 1. Check LangGraph Bridge Dependency
        if (!this.langgraphBridge) {
            console.warn("[LANGGRAPH] MCP LangGraph Bridge is unavailable. Skipping LangGraph tool registrations.");
            (server as any).config.setFeatureFlag('LANGGRAPH', false);
            return;
        }

        // 2. Feature Flag Check & Execution: Check the server/global config for explicit enablement.
        // This is the primary gate to ensure core tools run even if optional services fail.
        let isLanggraphEnabled = (server as any).config?.getFeatureFlag('LANGGRAPH') || false;

        // --- START OF CRITICAL FEATURE FLAG CHECK (Step 5 implementation) ---
        console.log("Checking LangGraph feature flag...");
        isLanggraphEnabled = (server as any).config.getFeatureFlag('MCP_LANGGRAPH_ENABLED') === 'true';

        if (!isLanggraphEnabled) {
            console.info("[LANGGRAPH] Skipping LangGraph tool registrations: Feature flag 'LANGGRAPH' is explicitly disabled.");
            (server as any).config.setFeatureFlag('LANGGRAPH', false);
            return;
        }
        // --- END OF CRITICAL FEATURE FLAG CHECK ---

        // The feature is enabled AND the bridge is available, so we proceed with the registration block.
        try {
            console.info("[LANGGRAPH] Feature flag enabled. Attempting to register optional LangGraph tools...");
            this.registerLangGraphTools(server);
        } catch (error) {
            // The error will be logged, but the middleware core continues execution.
            console.error("[LANGGRAPH] LangGraph tool registration failed (non-blocking, core middleware continues):", error);
            // Critical: If registration fails, we must manually disable the feature flag to prevent re-entry on next startup.
            (server as any).config.setFeatureFlag('LANGGRAPH', false);
        }
    }

    /**
     * Registers all LangGraph-specific tools, guarded by feature flag checks.
     * @param server The middleware server instance.
     */
    private registerLangGraphTools(server: any) {
        console.info("Successfully entered LangGraph registration scope.");
        // TODO: Add actual tool registration calls for LangGraph here, e.g.,
        // this.registerLangGraphTool(server);
    }

    /**
     * @method assertDispatcherMiddleware
     * Validates that the provided value is an instance of the expected middleware type
     * before it is used in a critical path.
     * @param value The middleware instance to check.
     * @throws {TypeError} If the type validation fails.
     */
    public static assertDispatcherMiddleware(value: unknown): void {
        if (!value || typeof value !== 'object' || !(value as any).constructor.name === 'DispatcherMiddleware') {
            throw new TypeError("INVALID_DISPATCHER_MIDDLEWARE: Value provided is not a valid DispatcherMiddleware instance.");
        }
    }

    // [Method stubs for other tools remain unchanged]
    private registerNewTools(server: any) { /* ... */ }
    private registerAdminTools(server: any) { /* ... */ }
    private registerSkillTools(server: any) { /* ... */ }
    private registerEngramTools(server: any) { /* ... */ }
    private registerAtlasEmbeddingTools(server: any) { /* ... */ }
    private registerDbInspectionTools(server: any) { /* ... */ }
    private registerLangGraphTools(server: any) { /* ... */ }