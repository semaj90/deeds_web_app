import neo4j from "neo4j-driver";
import {
  NEO4J_URI,
  NEO4J_USER,
  NEO4J_PASSWORD,
  NEO4J_DATABASE,
} from "$env/static/private";

/**
 * Phase 4: Neo4j Graph Database Service
 * Manages relationships between cases, evidence, people, and locations
 */

class Neo4jService {
  constructor() {
    this.driver = null;
    this.session = null;
    this.isConnected = false;
  }

  /**
   * Initialize Neo4j connection
   */
  async initialize() {
    if (this.isConnected) return;

    try {
      console.log("📊 Connecting to Neo4j...");

      this.driver = neo4j.driver(
        NEO4J_URI || "bolt://localhost:7687",
        neo4j.auth.basic(
          NEO4J_USER || "neo4j",
          NEO4J_PASSWORD || "LegalSecure2024!"
        )
      );

      // Test connection
      const serverInfo = await this.driver.getServerInfo();
      console.log(`✅ Connected to Neo4j ${serverInfo.protocolVersion}`);

      this.isConnected = true;
      await this.createConstraintsAndIndexes();
    } catch (error) {
      console.error("❌ Failed to connect to Neo4j:", error);
      throw error;
    }
  }

  /**
   * Create database constraints and indexes
   */
  async createConstraintsAndIndexes() {
    const session = this.driver.session({
      database: NEO4J_DATABASE || "neo4j",
    });

    try {
      // Create constraints for unique properties
      const constraints = [
        "CREATE CONSTRAINT IF NOT EXISTS FOR (c:Case) REQUIRE c.id IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (e:Evidence) REQUIRE e.id IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (d:Document) REQUIRE d.id IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (l:Location) REQUIRE l.id IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (ev:Event) REQUIRE ev.id IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (ch:Charge) REQUIRE ch.id IS UNIQUE",
      ];

      for (const constraint of constraints) {
        await session.run(constraint);
      }

      // Create indexes for better performance
      const indexes = [
        "CREATE INDEX IF NOT EXISTS FOR (c:Case) ON (c.status)",
        "CREATE INDEX IF NOT EXISTS FOR (c:Case) ON (c.prosecutor)",
        "CREATE INDEX IF NOT EXISTS FOR (p:Person) ON (p.name)",
        "CREATE INDEX IF NOT EXISTS FOR (p:Person) ON (p.role)",
        "CREATE INDEX IF NOT EXISTS FOR (e:Evidence) ON (e.type)",
        "CREATE INDEX IF NOT EXISTS FOR (d:Document) ON (d.content_hash)",
        "CREATE INDEX IF NOT EXISTS FOR (ev:Event) ON (ev.datetime)",
        "CREATE INDEX IF NOT EXISTS FOR (ch:Charge) ON (ch.statute)",
      ];

      for (const index of indexes) {
        await session.run(index);
      }

      console.log("✅ Neo4j constraints and indexes created");
    } finally {
      await session.close();
    }
  }

  /**
   * Create a case node
   */
  async createCase(caseData) {
    const session = this.driver.session();

    try {
      const result = await session.run(
        `
        CREATE (c:Case {
          id: $id,
          title: $title,
          status: $status,
          prosecutor: $prosecutor,
          date_filed: $date_filed,
          description: $description,
          created_at: datetime(),
          updated_at: datetime()
        })
        RETURN c
      `,
        caseData
      );

      return result.records[0]?.get("c").properties;
    } finally {
      await session.close();
    }
  }

  /**
   * Create a person node
   */
  async createPerson(personData) {
    const session = this.driver.session();

    try {
      const result = await session.run(
        `
        CREATE (p:Person {
          id: $id,
          name: $name,
          role: $role,
          contact_info: $contact_info,
          date_of_birth: $date_of_birth,
          address: $address,
          created_at: datetime(),
          updated_at: datetime()
        })
        RETURN p
      `,
        personData
      );

      return result.records[0]?.get("p").properties;
    } finally {
      await session.close();
    }
  }

  /**
   * Create an evidence node
   */
  async createEvidence(evidenceData) {
    const session = this.driver.session();

    try {
      const result = await session.run(
        `
        CREATE (e:Evidence {
          id: $id,
          type: $type,
          description: $description,
          chain_of_custody: $chain_of_custody,
          collected_date: $collected_date,
          collected_by: $collected_by,
          location_found: $location_found,
          created_at: datetime(),
          updated_at: datetime()
        })
        RETURN e
      `,
        evidenceData
      );

      return result.records[0]?.get("e").properties;
    } finally {
      await session.close();
    }
  }

  /**
   * Create relationships between nodes
   */
  async createRelationship(
    fromId,
    fromType,
    toId,
    toType,
    relationshipType,
    properties = {}
  ) {
    const session = this.driver.session();

    try {
      const result = await session.run(
        `
        MATCH (from:${fromType} {id: $fromId}), (to:${toType} {id: $toId})
        CREATE (from)-[r:${relationshipType} $properties]->(to)
        RETURN r
      `,
        { fromId, toId, properties }
      );

      return result.records[0]?.get("r").properties;
    } finally {
      await session.close();
    }
  }

  /**
   * Find connected cases (cases with shared people/evidence)
   */
  async findConnectedCases(caseId) {
    const session = this.driver.session();

    try {
      const result = await session.run(
        `
        MATCH (c1:Case {id: $caseId})
        MATCH (c1)-[:HAS_EVIDENCE]->(e:Evidence)<-[:HAS_EVIDENCE]-(c2:Case)
        WHERE c1 <> c2
        RETURN DISTINCT c2, count(e) as shared_evidence
        ORDER BY shared_evidence DESC
        LIMIT 10

        UNION

        MATCH (c1:Case {id: $caseId})
        MATCH (c1)-[:INVOLVES_PERSON]->(p:Person)<-[:INVOLVES_PERSON]-(c2:Case)
        WHERE c1 <> c2
        RETURN DISTINCT c2, count(p) as shared_people
        ORDER BY shared_people DESC
        LIMIT 10
      `,
        { caseId }
      );

      return result.records.map((record) => ({
        case: record.get("c2").properties,
        connections:
          record.get("shared_evidence") || record.get("shared_people"),
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Find patterns in charging decisions
   */
  async findChargingPatterns(evidenceType) {
    const session = this.driver.session();

    try {
      const result = await session.run(
        `
        MATCH (e:Evidence {type: $evidenceType})-[:SUPPORTS]->(ch:Charge)
        MATCH (ch)<-[:HAS_CHARGE]-(c:Case)
        RETURN ch.statute as statute, ch.description as charge_description,
               count(c) as case_count, collect(c.id) as case_ids
        ORDER BY case_count DESC
        LIMIT 20
      `,
        { evidenceType }
      );

      return result.records.map((record) => ({
        statute: record.get("statute"),
        description: record.get("charge_description"),
        caseCount: record.get("case_count").toNumber(),
        caseIds: record.get("case_ids"),
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Trace evidence chain through multiple cases
   */
  async traceEvidenceChain(evidenceId) {
    const session = this.driver.session();

    try {
      const result = await session.run(
        `
        MATCH path = (e:Evidence {id: $evidenceId})-[*1..3]-(connected)
        RETURN path,
               nodes(path) as path_nodes,
               relationships(path) as path_relationships
        ORDER BY length(path) DESC
        LIMIT 50
      `,
        { evidenceId }
      );

      return result.records.map((record) => ({
        pathLength: record.get("path").length,
        nodes: record.get("path_nodes").map((node) => ({
          id: node.properties.id,
          labels: node.labels,
          properties: node.properties,
        })),
        relationships: record.get("path_relationships").map((rel) => ({
          type: rel.type,
          properties: rel.properties,
        })),
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Get case network analysis
   */
  async getCaseNetworkAnalysis(caseId) {
    const session = this.driver.session();

    try {
      const result = await session.run(
        `
        MATCH (c:Case {id: $caseId})
        OPTIONAL MATCH (c)-[:INVOLVES_PERSON]->(p:Person)
        OPTIONAL MATCH (c)-[:HAS_EVIDENCE]->(e:Evidence)
        OPTIONAL MATCH (c)-[:HAS_CHARGE]->(ch:Charge)
        OPTIONAL MATCH (c)-[:OCCURRED_AT]->(l:Location)

        RETURN c,
               collect(DISTINCT p) as people,
               collect(DISTINCT e) as evidence,
               collect(DISTINCT ch) as charges,
               collect(DISTINCT l) as locations
      `,
        { caseId }
      );

      if (result.records.length === 0) return null;

      const record = result.records[0];
      return {
        case: record.get("c").properties,
        people: record.get("people").map((p) => p.properties),
        evidence: record.get("evidence").map((e) => e.properties),
        charges: record.get("charges").map((ch) => ch.properties),
        locations: record.get("locations").map((l) => l.properties),
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Execute custom Cypher query
   */
  async executeQuery(cypher, parameters = {}) {
    const session = this.driver.session();

    try {
      const result = await session.run(cypher, parameters);
      return result.records.map((record) => {
        const obj = {};
        record.keys.forEach((key) => {
          const value = record.get(key);
          obj[key] =
            value && typeof value === "object" && value.properties
              ? value.properties
              : value;
        });
        return obj;
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      await this.driver.verifyConnectivity();
      return {
        status: "healthy",
        connection: "connected",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Close connection
   */
  async close() {
    if (this.driver) {
      await this.driver.close();
      this.isConnected = false;
      console.log("🔌 Neo4j connection closed");
    }
  }
}

// Export singleton instance
export const neo4jService = new Neo4jService();
export default neo4jService;
