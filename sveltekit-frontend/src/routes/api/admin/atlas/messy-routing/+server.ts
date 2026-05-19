import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = join(__dirname, '../../../../../../..', 'docs', 'reports', 'messy-query-routing-eval.json');

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const contents = await fs.readFile(REPORT_PATH, 'utf8');
    const payload = JSON.parse(contents) as Record<string, unknown>;
    return json(payload);
  } catch (error) {
    return json({ error: 'Phase 18 report not available', details: String(error) }, { status: 404 });
  }
};
