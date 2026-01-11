/**
 * Collection Citation Detail API
 * DELETE: Remove citation from collection
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { getUser } from '$lib/server/auth/lucia';
import { citationLibraryService } from '$lib/server/services/citation-library.service';

/**
 * DELETE: Remove citation from collection
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  try {
    const user = await getUser(locals);
    if (!user) {
      return json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    await citationLibraryService.removeCitationFromCollection(
      params.id,
      params.citation_id,
      user.id
    );

    return json({
      success: true,
      message: 'Citation removed from collection',
    });
  } catch (error) {
    console.error('Error removing citation from collection:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove citation',
      },
      { status: 500 }
    );
  }
};
