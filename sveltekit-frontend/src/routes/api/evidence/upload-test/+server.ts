/**
 * Simple test endpoint to diagnose file upload issues
 * POST /api/evidence/upload-test
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const uploadTestFieldsSchema = z.object({
  filename: z.string().max(500).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    console.log('[UploadTest] Headers:', Object.fromEntries(request.headers.entries()));

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    // Validate optional auxiliary fields with Zod (defense-in-depth)
    uploadTestFieldsSchema.safeParse({
      filename: formData.get('filename') ?? undefined,
    });

    if (!file) {
      return json({
        success: false,
        error: 'No file received',
        formDataKeys: Array.from(formData.keys()),
        contentType: request.headers.get('content-type'),
      }, { status: 400 });
    }

    return json({
      success: true,
      file: {
        name: file.name,
        size: file.size,
        type: file.type,
      },
      formDataKeys: Array.from(formData.keys()),
      contentType: request.headers.get('content-type'),
    });
  } catch (err) {
    console.error('[UploadTest] Error:', err);
    return json(
      {
        success: false,
        error: 'Upload test failed',
      },
      { status: 500 }
    );
  }
};
