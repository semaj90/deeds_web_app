#!/usr/bin/env node

/**
 * Seed Neo4j USED_CONCEPT edges from atlas_packets table
 * 
 * Maps feature_id → Concept nodes + Packet nodes
 * Creates USED_CONCEPT relationships (Packet → Concept)
 * 
 * Usage:
 *   npm run seed:neo4j:used-concept
 *   npm run seed:neo4j:used-concept -- --limit 100
 *   npm run seed:neo4j:used-concept -- --audit
 */

import { config } from 'dotenv';
import { spawn } from 'child_process';
import fs from 'fs';
config();

const NEO4J_URL = process.env.NEO4J_URL || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';

// Canonical concepts (from domain ontology)
const CONCEPTS = [
  'auth.sessions',
  'auth.validation',
  'auth.login',
  'db.query',
  'db.schema',
  'cache.redis',
  'retrieval.semantic',
  'topology.som',
  'policy.decision',
  'ace.pipeline',
];

async function runCypher(query, params = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      'cypher-shell',
      `--address=${NEO4J_URL}`,
      `--username=${NEO4J_USER}`,
      `--password=${NEO4J_PASSWORD}`,
      '--format=json',
    ];

    const proc = spawn('cypher-shell', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let err = '';

    proc.stdin.write(query);
    proc.stdin.end();

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      err += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Cypher shell exited with code ${code}: ${err}`));
      } else {
        try {
          resolve(JSON.parse(output));
        } catch {
          resolve(output);
        }
      }
    });
  });
}

async function seedUsedConceptEdges() {
  console.log('🌱 Seeding Neo4j USED_CONCEPT edges...');
  
  // Step 1: Ensure Concept nodes exist
  console.log('  → Creating Concept nodes...');
  for (const concept of CONCEPTS) {
    const cypher = `
      MERGE (c:Concept {id: $id})
      SET c.name = $name, c.domain = $domain
      RETURN c.id
    `;
    const domain = concept.split('.')[0];
    try {
      await runCypher(cypher, { id: concept, name: concept, domain });
    } catch (e) {
      console.warn(`    ⚠ Failed to create Concept ${concept}:`, e.message);
    }
  }

  // Step 2: Create USED_CONCEPT edges from Packets to Concepts
  console.log('  → Creating USED_CONCEPT edges...');
  const edgeQuery = `
    MATCH (p:Packet)
    WITH p, split(p.feature_id, '.')[0] AS domain
    MATCH (c:Concept {domain: domain})
    MERGE (p)-[r:USED_CONCEPT]->(c)
    SET r.confidence = 0.8, r.source = 'atlas_packet'
    RETURN count(r) AS edgesCreated
  `;
  
  try {
    const result = await runCypher(edgeQuery);
    console.log(`  ✓ Created ${result || '?'} USED_CONCEPT edges`);
  } catch (e) {
    console.error('  ✗ Failed to create edges:', e.message);
  }

  // Step 3: Audit
  console.log('  → Auditing edges...');
  const auditQuery = `
    MATCH (p:Packet)-[r:USED_CONCEPT]->(c:Concept)
    RETURN count(r) AS totalEdges, 
           count(DISTINCT p) AS packetCount,
           count(DISTINCT c) AS conceptCount
  `;
  
  try {
    const audit = await runCypher(auditQuery);
    console.log(`  ✓ Total edges: ${audit?.totalEdges || 0}`);
    console.log(`    - Packets: ${audit?.packetCount || 0}`);
    console.log(`    - Concepts: ${audit?.conceptCount || 0}`);
  } catch (e) {
    console.warn('  ⚠ Audit failed:', e.message);
  }

  console.log('✅ Seeding complete');
}

// Run
seedUsedConceptEdges().catch(console.error);
