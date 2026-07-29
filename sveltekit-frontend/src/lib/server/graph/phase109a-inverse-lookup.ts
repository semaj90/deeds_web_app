/**
 * QW-5: Neo4j Inverse Query Pattern
 * Find packets citing a given evidence ID via Neo4j topology
 */

import { neo4j } from '../db/neo4j-client';

interface EvidenceCitationResult {
  packetKey: string;
  packetId: string;
  citationCount: number;
  confidence?: number;
  signalTypes: string[];
}

/**
 * Find all packets that cite a given evidence ID
 * Query: MATCH (p:Packet)-[r:CITES]->(e:Evidence) WHERE e.id = $eid RETURN p, count(r)
 */
export async function findPacketsCitingEvidence(
  evidenceId: string
): Promise<EvidenceCitationResult[]> {
  if (!neo4j) {
    console.warn('Neo4j client not available, skipping inverse lookup');
    return [];
  }

  const session = neo4j.session();
  try {
    const result = await session.run(
      `
      MATCH (p:Packet)-[r:CITES]->(e:Evidence)
      WHERE e.id = $evidenceId
      RETURN
        p.packet_key as packetKey,
        p.id as packetId,
        count(r) as citationCount,
        collect(distinct r.signal_type) as signalTypes
      ORDER BY citationCount DESC
      `,
      { evidenceId }
    );

    return result.records.map((record) => ({
      packetKey: record.get('packetKey') as string,
      packetId: record.get('packetId') as string,
      citationCount: record.get('citationCount').toNumber(),
      signalTypes: record.get('signalTypes') as string[],
    }));
  } catch (error) {
    console.error('Error in findPacketsCitingEvidence:', error);
    return [];
  } finally {
    await session.close();
  }
}

/**
 * Expand evidence references via graph neighborhood
 * Useful for finding related evidence through packet topology
 */
export async function expandEvidenceNeighborhood(
  evidenceId: string,
  maxHops: number = 2
): Promise<Map<string, number>> {
  if (!neo4j) return new Map();

  const session = neo4j.session();
  try {
    const result = await session.run(
      `
      MATCH (e:Evidence {id: $evidenceId})-[*1..$maxHops]-(neighbor:Evidence)
      WHERE neighbor.id <> $evidenceId
      RETURN neighbor.id as neighborId, min(length(shortestPath(e, neighbor))) as distance
      `,
      { evidenceId, maxHops }
    );

    const neighborhood = new Map<string, number>();
    result.records.forEach((record) => {
      const neighborId = record.get('neighborId') as string;
      const distance = record.get('distance').toNumber();
      neighborhood.set(neighborId, distance);
    });

    return neighborhood;
  } catch (error) {
    console.error('Error in expandEvidenceNeighborhood:', error);
    return new Map();
  } finally {
    await session.close();
  }
}

/**
 * Find confidence-weighted evidence paths
 * Filters by producer and confidence score
 */
export async function findConfidentEvidencePaths(
  evidenceId: string,
  minConfidence: number = 0.7,
  producers?: string[]
): Promise<
  Array<{
    path: string[];
    totalConfidence: number;
    producers: string[];
  }>
> {
  if (!neo4j) return [];

  const session = neo4j.session();
  try {
    let query = `
      MATCH (start:Evidence {id: $evidenceId})-[r:CITES|SUPPORTS|CORROBORATES*1..3]-(end:Evidence)
      WHERE all(rel in r WHERE rel.confidence >= $minConfidence)
    `;

    if (producers && producers.length > 0) {
      query += ` AND any(rel in r WHERE rel.producer IN $producers)`;
    }

    query += `
      RETURN
        [rel in r | rel.evidence_id] as path,
        reduce(conf = 1.0, rel in r | conf * rel.confidence) as totalConfidence,
        collect(distinct r[0].producer) as producers
      ORDER BY totalConfidence DESC
      LIMIT 10
    `;

    const params: Record<string, any> = {
      evidenceId,
      minConfidence,
    };

    if (producers && producers.length > 0) {
      params.producers = producers;
    }

    const result = await session.run(query, params);

    return result.records.map((record) => ({
      path: record.get('path') as string[],
      totalConfidence: record.get('totalConfidence').toNumber(),
      producers: record.get('producers') as string[],
    }));
  } catch (error) {
    console.error('Error in findConfidentEvidencePaths:', error);
    return [];
  } finally {
    await session.close();
  }
}

/**
 * Detect orphaned evidence (no citations from any packet)
 * Useful for cleanup and integrity checks
 */
export async function findOrphanedEvidence(): Promise<string[]> {
  if (!neo4j) return [];

  const session = neo4j.session();
  try {
    const result = await session.run(`
      MATCH (e:Evidence)
      WHERE NOT (e)<-[:CITES]-()
      RETURN e.id as evidenceId
      LIMIT 100
    `);

    return result.records.map((record) => record.get('evidenceId') as string);
  } catch (error) {
    console.error('Error in findOrphanedEvidence:', error);
    return [];
  } finally {
    await session.close();
  }
}
