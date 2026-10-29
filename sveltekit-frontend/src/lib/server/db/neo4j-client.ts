/** Compatibility facade for the canonical Neo4j driver owner. */

import { closeNeo4jDriver, getNeo4jDriver } from '../neo4j-driver.js';

export const neo4j_singleton = {
  session: () => getNeo4jDriver().session(),
  close: closeNeo4jDriver,
};

// Default export for compatibility
export const neo4j_default = neo4j_singleton;
export default neo4j_singleton;

// Fallback export as 'neo4j' for phase109a-inverse-lookup.ts
export const neo4j_fallback = neo4j_singleton;
