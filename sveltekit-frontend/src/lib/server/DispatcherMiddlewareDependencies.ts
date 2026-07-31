// Defines the concrete dependencies required by the DispatcherMiddleware.
// NOTE: This definition uses mocked/assumed schemas based on the task description,
// pending confirmation of the actual database schema for type safety.
export interface DispatcherMiddlewareDependencies {
  /** The connection pool for the primary database. */
  pool: Pool;
  /** The primary engram storage service instance. */
  engramBridge: EngramBridge;
  /** The LangChain graph orchestration service instance. */
  langgraphBridge: LangGraphBridge;
}