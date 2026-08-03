import type { Pool } from 'pg';

import type { EngramMemoryBridge } from '../mcp/memory-bridge.js';
import type { LangGraphBridge } from '../mcp/langgraph-bridge.js';

// Defines the concrete dependencies required by the DispatcherMiddleware.
export interface DispatcherMiddlewareDependencies {
  /** The connection pool for the primary database. */
  pool: Pool;
  /** The primary engram storage service instance. */
  engramBridge: EngramMemoryBridge;
  /** The LangChain graph orchestration service instance. */
  langgraphBridge: LangGraphBridge;
}
