/**
 * Neo4j Driver Singleton
 * Manages connection to Neo4j graph database for topology queries
 */

import * as neo4j from 'neo4j-driver';

let driver: ReturnType<typeof neo4j.driver> | null = null;

export function getNeo4jDriver() {
  if (!driver) {
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const username = process.env.NEO4J_USERNAME || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'neo4j';

    driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
  }
  return driver;
}

export const neo4j_singleton = {
  session: () => getNeo4jDriver().session(),
  close: async () => {
    if (driver) {
      await driver.close();
      driver = null;
    }
  },
};

// Default export for compatibility
export const neo4j_default = neo4j_singleton;
export default neo4j_singleton;

// Fallback export as 'neo4j' for phase109a-inverse-lookup.ts
export const neo4j_fallback = neo4j_singleton;
