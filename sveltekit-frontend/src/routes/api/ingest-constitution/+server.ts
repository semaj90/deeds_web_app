import { json } from '@sveltejs/kit';
import { uploadLibraryDocument, runIngestionPipeline } from '$lib/server/legal/ingestion-worker.js';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET() {
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
            userId: null as any
        });

        console.log(`    Document ID: ${documentId}`);
        console.log(`    Job ID:      ${jobId}`);

        console.log(`[3] Running complex chunker & embedding pipeline...`);
        // We do not await this entirely so the request doesn't timeout,
        // but we'll await it for the sake of logging the whole process here
        // if the server timeout is long enough (1000s).
        // Since it's a local script, we can just await it.
        const result = await runIngestionPipeline({ documentId, jobId });
        
        console.log("\n=================================================");
        console.log("  ✅ Ingestion Complete!                         ");
        console.log("=================================================");
        console.log(JSON.stringify(result, null, 2));

        return json({ success: true, result });
    } catch (err) {
        console.error("\n❌ Ingestion Failed:", err);
        return json({ success: false, error: 'Ingestion failed' }, { status: 500 });
    }
}
