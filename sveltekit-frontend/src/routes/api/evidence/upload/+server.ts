import { json, type RequestEvent } from '@sveltejs/kit';

/**
 * POST /api/evidence/upload
 * STUB: Mock upload handler for development/testing.
 * Returns a successful job ID without actual storage/DB ops.
 */
export async function POST({ request }: RequestEvent) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const caseId = formData.get('caseId');
    // const artifactType = formData.get('artifactType');

    if (!file) {
      return json({ error: 'No file provided' }, { status: 400 });
    }

    // Mock processing
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const docId = `doc-${Date.now()}`;

    console.log(`[STUB] Upload received for case ${caseId}. Assigned Job: ${jobId}`);

    return json({
      jobId,
      doc_id: docId,
      status: 'pending',
      message: 'Upload successful (stub)',
      minioKey: `uploads/${caseId}/${(file as File).name}`
    }, { status: 201 });

  } catch (err) {
    console.error('Upload error:', err);
    return json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
