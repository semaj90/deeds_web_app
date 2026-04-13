/**
 * Simple test endpoint to diagnose file upload issues
 * POST /api/evidence/upload-test
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    console.log('[UploadTest] Headers:', Object.fromEntries(request.headers.entries()));

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

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
    return json({
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      stack: err instanceof Error ? err.stack : undefined,
    }, { status: 500 });
  }
};
