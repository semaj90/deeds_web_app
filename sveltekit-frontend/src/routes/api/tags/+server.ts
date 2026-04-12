import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';

/** GET /api/tags — List all unique tags from evidence and cases */
export const GET: RequestHandler = async ({ locals, request }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    // Extract unique tags from evidence metadata JSONB
    const result = await db
      .execute(
        sql`
			SELECT DISTINCT jsonb_array_elements_text(metadata->'tags') AS tag
			FROM evidence
			WHERE metadata->'tags' IS NOT NULL
			ORDER BY tag
			LIMIT 200
		`
      )
      .catch(() => ({ rows: [] }));

    const tags = (result.rows as Array<{ tag: string }>).map((r) => r.tag);

    // If no DB tags, return common legal tags
    if (tags.length === 0) {
      return json({
        tags: [
          'contract',
          'litigation',
          'evidence',
          'testimony',
          'discovery',
          'motion',
          'brief',
          'deposition',
          'ruling',
          'settlement',
          'criminal',
          'civil',
          'corporate',
          'employment',
          'ip',
          'urgent',
          'reviewed',
          'pending',
          'archived',
        ],
      });
    }

    const responseData = { tags };
    const { etag, isMatch } = checkETag(responseData, request.headers);
    if (isMatch) return notModified(etag);
    return json(responseData, { headers: { ...cacheControl.medium, ETag: etag } });
  } catch (err) {
    console.error('[/api/tags]', err);
    return json({
      tags: [
        'contract',
        'litigation',
        'evidence',
        'testimony',
        'motion',
        'brief',
        'urgent',
        'pending',
      ],
    });
  }
};
