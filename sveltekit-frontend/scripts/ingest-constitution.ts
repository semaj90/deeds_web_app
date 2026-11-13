import { uploadLibraryDocument } from '../src/lib/server/legal/ingestion-worker.js';
import { promises as fs, existsSync } from 'fs';
import path from 'path';

async function ingestConstitution() {
    console.log("=================================================");
    console.log("  California Constitution Ingestion Pipeline    ");
    console.log("=================================================");

    const pdfPath = existsSync(path.resolve('lawpdfs', 'California_Constitution_2023-24.pdf'))
        ? path.resolve('lawpdfs', 'California_Constitution_2023-24.pdf')
        : path.resolve('..', 'lawpdfs', 'California_Constitution_2023-24.pdf');
    try {
        console.log(`[1] Reading PDF: ${pdfPath}`);
        const fileBuffer = await fs.readFile(pdfPath);
        console.log(`    Read ${fileBuffer.length} bytes.`);

        console.log(`[2] Uploading to MinIO & initializing records...`);
        const actorId = process.env.LIBRARY_INGESTION_ACTOR_ID;
        if (!actorId || !/^\\d+$/.test(actorId) || Number(actorId) <= 0) {
            throw new Error('Set LIBRARY_INGESTION_ACTOR_ID to an authorized positive database user ID.');
        }
        const { documentId, jobId } = await uploadLibraryDocument({
            fileBuffer,
            fileName: 'California_Constitution_2023-24.pdf',
            title: 'California Constitution 2023-24',
            corpusType: 'constitution',
            jurisdictionCode: 'CA',
            userId: actorId
        });

        console.log(`    Document ID: ${documentId}`);
        console.log(`    Job ID:      ${jobId}`);

        console.log(`[3] Job ${jobId} is queued for the durable library worker.`);
        console.log(JSON.stringify({ documentId, jobId, status: 'queued' }, null, 2));

    } catch (err) {
        console.error("\n❌ Ingestion Failed:", err);
    } finally {
        process.exit(0);
    }
}

ingestConstitution();
