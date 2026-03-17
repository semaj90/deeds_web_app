import { uploadLibraryDocument, runIngestionPipeline } from '../src/lib/server/legal/ingestion-worker.js';
import { promises as fs } from 'fs';
import path from 'path';

async function ingestConstitution() {
    console.log("=================================================");
    console.log("  California Constitution Ingestion Pipeline    ");
    console.log("=================================================");

    const pdfPath = path.resolve('lawpdfs', 'California_Constitution_2023-24.pdf');
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
            userId: null as any // Allow null for system ingest
        });

        console.log(`    Document ID: ${documentId}`);
        console.log(`    Job ID:      ${jobId}`);

        console.log(`[3] Running complex chunker & embedding pipeline...`);
        console.log(`    (This will take some time for 400+ pages)`);
        const result = await runIngestionPipeline({ documentId, jobId });
        
        console.log("\n=================================================");
        console.log("  ✅ Ingestion Complete!                         ");
        console.log("=================================================");
        console.log(JSON.stringify(result, null, 2));

    } catch (err) {
        console.error("\n❌ Ingestion Failed:", err);
    } finally {
        process.exit(0);
    }
}

ingestConstitution();
