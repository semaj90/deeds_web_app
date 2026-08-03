/**
 * POST /api/semantic-contracts/proposals/approve
 *
 * Approve an ontology relation proposal for promotion to canonical graph.
 *
 * Authorization required: ONTOLOGY_APPROVER role
 * Request body: { proposal_id: string }
 * Response: { status: 'APPROVED', approved_at: ISO8601, proposal_id: string }
 *
 * Workflow:
 *   1. Load proposal from atlas_ontology_relation_proposals (status must be ACCEPTED or PROPOSED)
 *   2. Verify authorization (require locals.user, ONTOLOGY_APPROVER role)
 *   3. Update proposal status → APPROVED, set approved_by, approved_at
 *   4. Promote relation to canonical atlas_ontology table + Neo4j
 *   5. Invalidate Neo4j cache for subject/object nodes
 *   6. Return confirmation
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireOntologyApprover, getAuthorizedBy } from '$lib/server/auth/promotion-gate';

export const POST: RequestHandler = async ({ request, locals }) => {
  // 1. Authorization gate
  if (!requireOntologyApprover(locals)) {
    return json({ error: 'Unauthorized (missing ONTOLOGY_APPROVER role)' }, { status: 403 });
  }

  // 2. Parse request
  let body: { proposal_id: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { proposal_id } = body;
  if (!proposal_id) {
    return json({ error: 'Missing proposal_id' }, { status: 400 });
  }

  try {
    // 3. Load proposal from Postgres
    const { db } = await import('$lib/server/db/client');
    const { sql } = await import('drizzle-orm');

    const proposals = await db.execute(sql`
      SELECT proposal_id, subject_packet_key, predicate, object_packet_key, confidence, evidence_ids, status
      FROM atlas_ontology_relation_proposals
      WHERE proposal_id = ${proposal_id}::uuid
      LIMIT 1
    `);

    const proposal = proposals.rows?.[0] as any;
    if (!proposal) {
      return json({ error: 'Proposal not found' }, { status: 404 });
    }

    if (!['PROPOSED', 'ACCEPTED'].includes(proposal.status)) {
      return json(
        {
          error: `Proposal status is ${proposal.status}, must be PROPOSED or ACCEPTED to approve`,
        },
        { status: 400 }
      );
    }

    const approved_by = getAuthorizedBy(locals);
    const now = new Date().toISOString();

    // 4. Promote to canonical in transaction
    await db.execute(sql`
      BEGIN;

      -- Update proposal status to APPROVED
      UPDATE atlas_ontology_relation_proposals
      SET status = 'APPROVED', approved_by = ${approved_by}, approved_at = ${now}
      WHERE proposal_id = ${proposal_id}::uuid;

      -- Insert into canonical ontology table (if table exists)
      INSERT INTO atlas_ontology (
        subject_packet_key, predicate, object_packet_key, confidence,
        evidence_ids, created_by, approved_at, created_at
      ) VALUES (
        ${proposal.subject_packet_key}, ${proposal.predicate}, ${proposal.object_packet_key},
        ${proposal.confidence}, ${JSON.stringify(proposal.evidence_ids || [])}, ${approved_by}, ${now}, ${now}
      ) ON CONFLICT DO NOTHING;

      COMMIT;
    `);

    // 5. Attempt Neo4j sync (non-blocking if Neo4j unavailable)
    try {
      // Dynamic import to handle case where Neo4j driver not configured
      const neo4jModule = await import('$lib/server/graph/neo4j-driver').catch(() => null);
      if (neo4jModule?.getNeo4jDriver) {
        const driver = neo4jModule.getNeo4jDriver();
        await driver.session().run(
          `MATCH (s {packet_key: $subject}), (o {packet_key: $object})
           MERGE (s)-[r:${proposal.predicate}]->(o)
           SET r.confidence = $confidence, r.evidence_ids = $evidence_ids, r.approved_at = $approved_at`,
          {
            subject: proposal.subject_packet_key,
            object: proposal.object_packet_key,
            confidence: proposal.confidence,
            evidence_ids: proposal.evidence_ids || [],
            approved_at: now,
          }
        );
      }
    } catch (neoErr) {
      console.warn('[approve] Neo4j sync failed:', neoErr);
      // Non-blocking: continue if Neo4j fails
    }

    // 6. Return confirmation
    return json(
      {
        status: 'APPROVED',
        approved_at: now,
        proposal_id,
        subject_packet_key: proposal.subject_packet_key,
        predicate: proposal.predicate,
        object_packet_key: proposal.object_packet_key,
        approved_by,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('[approve] Error approving proposal:', err);
    return json(
      { error: 'Failed to approve proposal', details: (err as Error).message },
      { status: 500 }
    );
  }
};
