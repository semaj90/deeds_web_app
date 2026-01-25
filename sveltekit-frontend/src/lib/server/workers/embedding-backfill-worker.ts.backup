
/**
 * Embedding Backfill Worker
 *
 * Automatically generates embeddings for evidence files that don't have them yet.
 * Integrates with the existing evidence upload pipeline and embedding API.
 */
import { query } from '$lib/server/db/client.js';
import { minioService } from '$lib/server/storage/minio-service.js';
// import { embeddingService } from '$lib/services/embedding-service.js'; // Not used directly, using fetch

interface EvidenceFile {
    id: number;
    title: string;
    description?: string;
    storage_bucket: string;
    object_name: string;
    mime_type: string;
    file_type: string;
    case_id?: string;
}

interface BackfillResult {
    processed: number;
    success: number;
    failed: number;
    errors: Array<any>;
}

export class EmbeddingBackfillWorker {
    private isRunning = false;
    private batchSize = 10;
    private retryCount = 3;

    constructor(private options: { batchSize?: number; retryCount?: number; enableTextExtraction?: boolean } = {}) {
        this.batchSize = options?.batchSize ?? 10;
        this.retryCount = options?.retryCount ?? 3;
    }

    /**
     * Process all evidence files that don't have embeddings yet
     */
    async processAll(): Promise<BackfillResult> {
        if (this.isRunning) {
            throw new Error('Backfill worker is already running');
        }

        this.isRunning = true;
        console.log('🔄 Starting embedding backfill process...');

        try {
            // Get all evidence files without embeddings
            const { rows: evidenceFiles } = await query<EvidenceFile>(
                `
                SELECT id, title, description, storage_bucket, object_name, mime_type, file_type, case_id
                FROM evidence_files
                WHERE embeddings IS NULL
                ORDER BY uploaded_at DESC
                LIMIT $1
                `,
                [this.batchSize]
            );

            console.log(`📋 Found ${evidenceFiles.length} files to process`);

            const result: BackfillResult = {
                processed: 0,
                success: 0,
                failed: 0,
                errors: []
            };

            // Process in batches to avoid overwhelming the system
            for (let i = 0; i < evidenceFiles.length; i += this.batchSize) {
                const batch = evidenceFiles.slice(i, i + this.batchSize);
                console.log(`📦 Processing batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(evidenceFiles.length / this.batchSize)}`);

                await Promise.allSettled(batch.map(async (file) => {
                    result.processed++;
                    try {
                        await this.processEvidenceFile(file);
                        result.success++;
                        console.log(`✅ Processed ${file.title} (ID: ${file.id})`);
                    } catch (error) {
                        result.failed++;
                        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                        result.errors.push({ id: file.id, error, errorMsg });
                        console.error(`❌ Failed to process ${file.title} (ID: ${file.id}):`, errorMsg);
                    }
                }));

                // Small delay between batches to prevent overwhelming the system
                if (i + this.batchSize < evidenceFiles.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            console.log(`🎉 Backfill complete! Processed: ${result.processed}, Success: ${result.success}, Failed: ${result.failed}`);
            return result;
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Process a single evidence file and generate its embeddings
     */
    private async processEvidenceFile(file: EvidenceFile): Promise<void> {
        // Extract text content from the file
        const textContent = await this.extractTextContent(file);

        if (!textContent || textContent.trim().length === 0) {
            console.warn(`⚠️ No extractable text content for ${file.title}`);
            return;
        }

        // Generate embeddings using our existing embedding service
        let embeddingResult;
        for (let attempt = 1; attempt <= this.retryCount; attempt++) {
            try {
                // Use mock model for now - can be switched to real models when configured
                embeddingResult = await this.generateEmbedding(textContent);
                break;
            } catch (error) {
                console.warn(`⚠️ Embedding attempt ${attempt}/${this.retryCount} failed for ${file.title}`, error);
                if (attempt === this.retryCount) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
            }
        }

        if (!embeddingResult?.embedding) {
            throw new Error('Failed to generate embedding');
        }

        // Store embeddings in the database
        await this.storeEmbedding(file.id, embeddingResult.embedding);
    }

    /**
     * Extract text content from evidence file
     */
    private async extractTextContent(file: EvidenceFile): Promise<string> {
        // Initialize MinIO service
        await minioService.initialize();

        // For now, use title and description as text content
        // In production, you would extract text from PDFs: DOCs, etc.
        let textContent = file.title;
        if (file.description) {
            textContent += '\n\n' + file.description;
        }

        // TODO: Add file content extraction for different types
        // - PDF text extraction using pdf-parse
        // - DOCX text extraction using mammoth
        // - TXT file reading
        // - OCR for images using tesseract.js

        try {
            switch (file.mime_type) {
                case 'text/plain':
                    // Get file from MinIO and extract text
                    const txtParams = await minioService.getFileUrl(file.storage_bucket, file.object_name, 60);
                    // Fetch the content from the signed URL
                    const txtResponse = await fetch(txtParams);
                    if (txtResponse.ok) {
                         const fileText = await txtResponse.text();
                         textContent += '\n\n' + fileText;
                    }
                    break;
                case 'application/json':
                    const jsonParams = await minioService.getFileUrl(file.storage_bucket, file.object_name, 60);
                    const jsonResponse = await fetch(jsonParams);
                    if (jsonResponse.ok) {
                        const jsonData = await jsonResponse.json();
                        textContent += '\n\n' + JSON.stringify(jsonData, null, 2);
                    }
                    break;
                default:
                    // For unsupported file types, use just title and description
                    console.log(`📄 Using metadata for ${file.mime_type}: ${file.object_name}`);
            }
        } catch (error) {
            console.warn(`Failed to extract content from ${file.object_name}:`, error);
        }

        return textContent;
    }

    /**
     * Generate embedding for text content
     */
    private async generateEmbedding(text: string): Promise<any> {
        // Call our embedding API endpoint
        const response = await fetch('http://localhost:5174/api/ai/embed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: text.substring(0, 50000), // Limit text length
                model: 'mock', // Use mock for testing - change to 'openai' or 'nomic' when ready
                dimensions: 768
            })
        });

        if (!response.ok) {
            throw new Error(`Embedding API error: ${response.statusText}`);
        }

        const result = await response.json();
        if (!result.embedding) { // Removed unnecessary casting
             throw new Error('No embedding returned from API');
        }
        return result;
    }

    /**
     * Store embedding vector in database
     */
    private async storeEmbedding(fileId: number, embedding: number[]): Promise<void> {
        // Convert embedding array to PostgreSQL vector format
        const embeddingVector = `[${embedding.join(',')}]`;
        await query(
            `UPDATE evidence_files SET embeddings = $1 WHERE id = $2`,
            [embeddingVector, fileId]
        );
    }

    /**
     * Get statistics about embedding status
     */
    async getStats(): Promise<any> {
        const [totalResult, withEmbeddingsResult] = await Promise.all([
            query('SELECT COUNT(*) as count FROM evidence_files'),
            query('SELECT COUNT(*) as count FROM evidence_files WHERE embeddings IS NOT NULL')
        ]);

        const total = parseInt((totalResult.rows[0] as any).count);
        const withEmbeddings = parseInt((withEmbeddingsResult.rows[0] as any).count);
        // const withoutEmbeddings = total - withEmbeddings; // Unused
        const percentage = total > 0 ? (withEmbeddings / total) * 100 : 0;

        return {
            total,
            withEmbeddings,
            percentage: Math.round(percentage * 100) / 100
        };
    }
}

// Export singleton instance
export const embeddingBackfillWorker = new EmbeddingBackfillWorker({
    batchSize: 10,
    retryCount: 3,
    enableTextExtraction: true
});








