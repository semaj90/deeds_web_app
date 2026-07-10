/**
 * Schema Dependency Intelligence API Route
 *
 * GET /api/atlas/schema-dependents?table=users
 * POST /api/atlas/schema-dependents with { table, includeAce }
 *
 * Returns file-level impacts of schema changes for migration planning
 * and risk assessment.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { Pool } from 'pg';
import {
  findSchemaDependents,
  FindSchemaDependentsInputSchema
} from '$lib/server/tools/schema-dependents';

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

// Stub for Neo4j (would be replaced with real neo4j-driver in production)
const neoStub = {
  session: () => ({
    run: async () => ({ records: [] }),
    close: async () => {}
  })
};

/**
 * GET handler: table name via query param
 */
export const GET: RequestHandler = async ({ url }) => {
  const tableName = url.searchParams.get('table');

  if (!tableName) {
    return json({ error: 'table query param required' }, { status: 400 });
  }

  try {
    const input = { table: tableName, includeAce: true };
    FindSchemaDependentsInputSchema.parse(input);

    const response = await findSchemaDependents(input, {
      neo4j: neoStub,
      postgres: pgPool
    });

    return json(response);
  } catch (error) {
    console.error('Schema dependents lookup failed:', error);
    return json(
      {
        error: 'Failed to resolve schema dependents',
        table: tableName,
        dependents: [],
        summary: { total: 0, reads: 0, writes: 0, deletes: 0, high_risk_count: 0 },
        ace_context: false,
        migration_risk: 'unknown'
      },
      { status: 500 }
    );
  }
};

/**
 * POST handler: full request body
 */
export const POST: RequestHandler = async ({ request }) => {
  if (request.headers.get('content-type') !== 'application/json') {
    return json({ error: 'content-type must be application/json' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const input = FindSchemaDependentsInputSchema.parse(body);

    const response = await findSchemaDependents(input, {
      neo4j: neoStub,
      postgres: pgPool
    });

    return json(response);
  } catch (error: any) {
    console.error('POST schema dependents failed:', error);
    return json(
      {
        error: error.message || 'Invalid request',
        dependents: [],
        summary: { total: 0, reads: 0, writes: 0, deletes: 0, high_risk_count: 0 },
        ace_context: false,
        migration_risk: 'unknown'
      },
      { status: 400 }
    );
  }
};
