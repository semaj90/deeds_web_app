import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uploadLibraryDocument } from '$lib/server/legal/ingestion-worker.js';
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
            userId: String(locals.user.id)
        });

        console.log(`    Document ID: ${documentId}`);
        console.log(`    Job ID:      ${jobId}`);

        console.log('[3] Ingestion job durably queued for the library worker.');
        return json({ success: true, documentId, jobId, status: 'queued' }, { status: 202 });
    } catch (err) {
        console.error("\n❌ Ingestion Failed:", err);
        return json({ success: false, result: null });
    }
}
