import { json } from '@sveltejs/kit';
import { ModelManager } from '$lib/server/admin/model-manager.js';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';

const UploadSchema = z.object({
  component: z.string().min(1),
  version: z.string().min(1),
  sha256: z.string().length(64),
  base64Data: z.string().min(1)
});

/**
 * POST /api/admin/model/upload-weights
 * Secure weight upload endpoint with SHA256 validation.
 */
export async function POST({ request, locals }) {
  if (!locals.user && !ENV.DEV_BYPASS_AUTH) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const raw = await request.json();
    const parsed = UploadSchema.safeParse(raw);
    
    if (!parsed.success) {
      return json({ error: 'Invalid payload: ' + parsed.error.issues[0]?.message }, { status: 400 });
    }

    const { component, version, sha256, base64Data } = parsed.data;
    const buffer = Buffer.from(base64Data, 'base64');

    const result = await ModelManager.uploadCandidate(component, version, sha256, buffer);
    
    if (!result.success) {
      return json({ error: result.error }, { status: 400 });
    }

    return json({ 
      success: true, 
      message: `Candidate ${component}:${version} uploaded and validated.` 
    });
  } catch (err) {
    console.error('[ModelUpload] Error:', err);
    return json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
