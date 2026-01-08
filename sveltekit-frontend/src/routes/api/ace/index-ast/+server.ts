/**
 * AST Index API
 *
 * POST /api/ace/index-ast - Index codebase AST in CouchDB
 * GET /api/ace/index-ast - Get indexing status
 */

import { indexCodebaseInCouchDB } from '$lib/services/ast-parser.js';
import { couchdb } from '$lib/services/couchdb-client.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface IndexRequest {
  path?: string;
  extensions?: string[];
  exclude?: string[];
  maxFiles?: number;
}

let indexingStatus = {
  isRunning: false,
  lastRun: null as string | null,
  indexed: 0,
  failed: 0,
  error: null as string | null
};

export const POST: RequestHandler = async ({ request }) => {
  if (indexingStatus.isRunning) {
    return json({
      success: false,
      error: 'Indexing already in progress',
      status: indexingStatus
    }, { status: 409 });
  }

  try {
    const body = await request.json() as IndexRequest;
    const targetPath = body.path || './src';

    indexingStatus = {
      isRunning: true,
      lastRun: new Date().toISOString(), indexed: 0,
      failed: 0,
      error: null
    };

    // Run indexing asynchronously
    (async () => {
      try {
        const result = await indexCodebaseInCouchDB(targetPath, {
          extensions: body.extensions || ['.ts', '.tsx', '.js', '.svelte'],
          exclude: body.exclude || ['node_modules', '.git', 'dist', 'build', '.svelte-kit'],
          maxFiles: body.maxFiles || 500
        });

        indexingStatus.indexed = result.indexed;
        indexingStatus.failed = result.failed;
        indexingStatus.isRunning = false;
      } catch (error) {
        indexingStatus.error = error instanceof Error ? error.message : 'Unknown error';
        indexingStatus.isRunning = false;
      }
    })();

    return json({
      success: true,
      message: 'Indexing started',
      status: indexingStatus
    });
  } catch (error) {
    indexingStatus.isRunning = false;
    indexingStatus.error = error instanceof Error ? error.message : 'Unknown error';

    return json({
      success: false,
      error: indexingStatus.error
    }, { status: 500 });
  }
};

export const GET: RequestHandler = async ({ url }) => {
  const includeStats = url.searchParams.get('stats') === 'true';

  let dbStats = null;
  if (includeStats) {
    try {
      dbStats = await couchdb.info('codebase_graph');
    } catch {
      dbStats = { error: 'Could not fetch CouchDB stats' };
    }
  }

  return json({
    status: indexingStatus,
    couchdb: dbStats
  });
};
