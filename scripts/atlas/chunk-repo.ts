import { glob } from 'glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import { chunkText } from '$lib/utils/text-utils'; // Assuming a utility exists for chunking
import { writeJsonl } from '$lib/utils/jsonl-writer';

const ROOT_DIR = process.cwd();
const CHUNK_OUTPUT_PATH = path.join(ROOT_DIR, 'temp_chunks.jsonl');

/**
 * Step 1: Traverse the entire codebase and chunk content into metadata JSONL.
 * This simulates the chunking process for the Parent Atlas.
 */
async function chunkRepository() {
    console.log('Starting repository chunking process...');
    
    // Use glob to find all source files recursively
    const patterns = ['**/*.{ts,tsx,js,svelte}'];
    let allFilePaths = [];

    for (const pattern of patterns) {
        const files = await glob(pattern, {cwd: ROOT_DIR});
        allFilePaths.push(...files);
    }

    console.log(`Found ${allFilePaths.length} files to process.`);

    const chunkPromises = allFilePaths.map(async (filePath) => {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            
            // A more advanced implementation would use AST parsing here, but we simulate chunking.
            const chunks = chunkText(content, 1000, 50); // Simulate chunking by token count
            
            return chunks.map(chunk => ({
                file_path: filePath,
                content: chunk.text,
                start_line: chunk.startLine,
                end_line: chunk.endLine,
                // Add other metadata like symbol/metadata if possible
            }));

        } catch (error) {
            console.error(`Error processing file ${filePath}:`, error);
            return []; // Return empty array for failed files
        }
    });

    const allChunks = await Promise.all(chunkPromises);
    
    // Flatten and write all chunks to the temporary JSONL file
    const flattenedChunks = allChunks.flat();
    await writeJsonl(CHUNK_OUTPUT_PATH, flattenedChunks);
    
    console.log(`✅ Chunking complete. Wrote ${flattenedChunks.length} chunks to ${CHUNK_OUTPUT_PATH}`);
}

// Execute the main function
chunkRepository().catch(console.error);