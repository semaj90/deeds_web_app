import { json, type RequestHandler } from '@sveltejs/kit';
import { readFileSync } from 'fs';
import { join } from 'path';
import { requireAdmin } from '$lib/server/auth-utils.js';

/**
 * GET /api/batch-summary/jobs
 * Fetch bounded summarization job manifest
 */
export const GET: RequestHandler = async (event) => {
  requireAdmin(event);
  try {
    const jobPath = join(process.cwd(), '.tmp/rabbitmq-gemma4-summary-jobs.ndjson');
    const content = readFileSync(jobPath, 'utf-8');

    const jobs = content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));

    return json({ jobs, total: jobs.length }, { status: 200 });
  } catch (error) {
    return json(
      { jobs: [], total: 0, error: 'Failed to load batch summary jobs' },
      { status: 500 }
    );
  }
};
