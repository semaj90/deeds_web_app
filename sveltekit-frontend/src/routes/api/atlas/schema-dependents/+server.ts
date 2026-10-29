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
import { ENV } from '$lib/server/env.server.js';
import {
  findSchemaDependents,
  FindSchemaDependentsInputSchema
} from '$lib/server/tools/schema-dependents';

const databaseUrl = ENV.DATABASE_URL?.trim();
const pgPool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;

function failureResponse(message: string, table: string | null, status: number) {
  return json(
    {
      error: message,
      table,
      dependents: [],
      summary: { total: 0, reads: 0, writes: 0, deletes: 0, high_risk_count: 0 },
      ace_context: false,
      migration_risk: 'unknown'
    },
    { status }
  );
}

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
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    return failureResponse('Unauthorized', null, 401);
  }

  const tableName = url.searchParams.get('table');

  if (!tableName) {
    return failureResponse('table query param required', null, 400);
  }

  if (!pgPool) return failureResponse('Database is not configured', tableName, 503);

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
    return failureResponse('Failed to resolve schema dependents', tableName, 500);
  }
};

/**
 * POST handler: full request body
 */
export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    return failureResponse('Unauthorized', null, 401);
  }
  if (request.headers.get('content-type') !== 'application/json') {
    return failureResponse('content-type must be application/json', null, 400);
  }

  try {
    const body = await request.json();
    const input = FindSchemaDependentsInputSchema.parse(body);

    if (!pgPool) return failureResponse('Database is not configured', input.table, 503);

    const response = await findSchemaDependents(input, {
      neo4j: neoStub,
      postgres: pgPool
    });

    return json(response);
  } catch (error: any) {
    console.error('POST schema dependents failed:', error);
    return failureResponse(error.message || 'Invalid request', null, 400);
  }
};
