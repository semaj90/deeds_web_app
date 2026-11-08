import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
  if (!locals.user) {
    throw redirect(302, '/auth/login');
  }

  const caseId = params.id;
  const { caseData } = await parent();

  return {
    caseId,
    caseTitle: caseData.title,
    loadError: null,
  };
};

export const actions: Actions = {
  upload: async ({ request, params, locals }) => {
    if (!locals.user) {
      return fail(401, { success: false, error: 'Unauthorized' });
    }

    const caseId = params.id;
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return fail(400, { success: false, error: 'No file provided' });
    }

    // Validate file
    const maxSize = 50 * 1024 * 1024; // 50MB
    const allowedTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/tiff',
      'application/x-tiff',
    ];

    if (file.size > maxSize) {
      return fail(400, { success: false, error: 'File size exceeds 50MB limit' });
    }

    if (!allowedTypes.includes(file.type)) {
      return fail(400, { success: false, error: 'File type not supported' });
    }

    try {
      // Forward to the working upload API with caseId attached
      formData.set('caseId', caseId);
      formData.set('title', file.name);
      formData.set('evidenceType', 'document');

      const origin = new URL(request.url).origin;
      const res = await fetch(`${origin}/api/evidence/upload`, {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        return { success: false, error: result.error ?? 'Upload failed' };
      }

      return {
        success: true,
        message: `File uploaded and queued for embedding (${result.fileName})`,
        documentId: result.id,
        jobId: result.jobId,
      };
    } catch (err) {
      console.error('Upload error:', err);
      return fail(500, { success: false, error: 'Upload failed' });
    }
  },
};
