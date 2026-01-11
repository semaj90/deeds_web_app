/**
 * PDF Download API Route
 * Serves statute PDFs from MinIO
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

/**
 * GET /api/laws/download-pdf
 * Download statute PDF from MinIO
 */
export const GET: RequestHandler = async ({ url }) => {
  try {
    const path = url.searchParams.get('path');

    if (!path) {
      throw error(400, 'Missing required parameter: path');
    }

    // Validate path to prevent directory traversal
    if (path.includes('..') || !path.startsWith('laws/')) {
      throw error(400, 'Invalid path');
    }

    // Dynamic import to avoid build-time issues
    const { MinioClient } = await import('$lib/server/minio');

    // Get object from MinIO
    const stream = await MinioClient.getObject('laws', path);

    // Return as PDF
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${path.split('/').pop()}"`,
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
      },
    });
  } catch (err) {
    console.error('PDF download error:', err);

    if (err instanceof Error && 'status' in err) {
      throw err;
    }

    throw error(500, 'Failed to download PDF');
  }
};
