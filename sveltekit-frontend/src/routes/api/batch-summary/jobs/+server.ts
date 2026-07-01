import { json, type RequestHandler } from '@sveltejs/kit';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * GET /api/batch-summary/jobs
 * Fetch bounded summarization job manifest
 */
export const GET: RequestHandler = async () => {
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
      { error: (error as Error).message },
      { status: 500 }
    );
  }
};
