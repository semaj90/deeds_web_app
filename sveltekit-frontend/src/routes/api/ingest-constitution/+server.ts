import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uploadLibraryDocument, runIngestionPipeline } from '$lib/server/legal/ingestion-worker.js';
import { promises as fs } from 'fs';
import path from 'path';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
    console.log("=================================================");
    console.log("  California Constitution Ingestion Pipeline    ");
    console.log("=================================================");

    const pdfPath = path.resolve(process.cwd(), '..', 'lawpdfs', 'California_Constitution_2023-24.pdf');
    try {
        console.log(`[1] Reading PDF: ${pdfPath}`);
        const fileBuffer = await fs.readFile(pdfPath);
        console.log(`    Read ${fileBuffer.length} bytes.`);

        console.log(`[2] Uploading to MinIO & initializing records...`);
        const { documentId, jobId } = await uploadLibraryDocument({
            fileBuffer,
            fileName: 'California_Constitution_2023-24.pdf',
            title: 'California Constitution 2023-24',
            corpusType: 'constitution',
            jurisdictionCode: 'CA',
            userId: null!
        });

        console.log(`    Document ID: ${documentId}`);
        console.log(`    Job ID:      ${jobId}`);

        console.log(`[3] Running complex chunker & embedding pipeline...`);
        // We do not await this entirely so the request doesn't timeout,
        // but we'll await it for the sake of logging the whole process here
        // if the server timeout is long enough (1000s).
        // Since it's a local script, we can just await it.
        const result = await runIngestionPipeline({ documentId, jobId });

        console.log('[ingest-constitution] Ingestion complete');

        return json({ success: true, result });
    } catch (err) {
        console.error("\n❌ Ingestion Failed:", err);
        return json({ success: false, result: null });
    }
}
