import { readJsonl } from '$lib/utils/jsonl-reader';
import { dbClient } from '$lib/server/db/client'; // Assuming Drizzle client import
import { getFileSha } from '$lib/utils/file-utils'; // Utility to calculate SHA
import { writeToParentAtlas } from '$lib/server/atlas/parent-atlas-service';

const CHUNK_INPUT_PATH = 'temp_chunks.jsonl';

/**
 * Step 3: Ingest metadata from chunking into the Postgres Parent Atlas.
 * This updates the atlas_files and atlas_chunks tables.
 */
async function updateParentAtlas() {
    console.log('Starting Parent Atlas metadata update...');
    
    // 1. Read all chunks to determine file metadata and chunk details
    const chunks = await readJsonl(CHUNK_INPUT_PATH);
    
    // Group chunks by file path to calculate SHA and update file metadata
    const filesMetadata = chunks.reduce((acc, chunk) => {
        if (!acc[chunk.file_path]) {
            acc[chunk.file_path] = { chunks: [], sha: null, language: 'unknown' };
        }
        acc[chunk.file_path].chunks.push(chunk);
        return acc;
    }, {});

    const fileUpdatePromises = Object.entries(filesMetadata).map(async ([filePath, meta]) => {
        // Calculate SHA for file_id consistency
        const sha = await getFileSha(filePath);
        
        // Update atlas_files table
        await writeToParentAtlas(filePath, { sha: sha, language: 'typescript' });
        
        // Write chunks to atlas_chunks table
        const chunkRecords = meta.chunks.map(chunk => ({
            file_id: filePath,
            symbol: 'N/A', // Symbol extraction would happen here
            text: chunk.content,
            start_line: chunk.start_line,
            end_line: chunk.end_line,
            embedding_id: 'TBD' // Placeholder for Qdrant ID
        }));
        await writeToParentAtlas('atlas_chunks', chunkRecords);
    });

    await Promise.all(fileUpdatePromises);
    
    console.log('✅ Parent Atlas update complete.');
}

// Execute the main function
updateParentAtlas().catch(console.error);