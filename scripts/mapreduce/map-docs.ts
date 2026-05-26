import { readDocAtlas, processDocument } from '$lib/utils/doc-loader';
import { writeFact, Fact } from '$lib/utils/fact-writer';

/**
 * Maps raw documentation files into structured, indexed facts for the knowledge graph.
 * This script reads from the local Docs Atlas and transforms raw markdown/text into structured JSONL facts.
 *
 * @param docPaths An array of paths to the documentation files to process.
 * @param context A context object containing necessary configuration or memory pointers.
 * @returns A Promise resolving to a count of facts processed and any errors encountered.
 */
export async function mapDocs(docPaths: string[], context: { sourceRefs: string[] }): Promise<{ processedCount: number, errors: string[] }> {
    console.log("Starting documentation mapping process...");
    const facts: Fact[] = [];
    const errors: string[] = [];
    let processedCount = 0;

    for (const path of docPaths) {
        try {
            // 1. Read the raw content from the specified documentation file path
            const content = await readDocAtlas(path);
            if (!content) {
                errors.push(`Could not read doc at path: ${path}`);
                continue;
            }

            // 2. Process the content to extract semantic facts
            const factsFromDoc = await processDocument(content, context.sourceRefs);

            // 3. Write extracted facts to the Fact Store (JSONL output)
            for (const fact of factsFromDoc) {
                // The 'writeFact' utility handles emitting the standardized JSONL format
                await writeFact(fact);
                facts.push(fact);
                processedCount++;
            }

        } catch (e) {
            errors.push(`Error processing ${path}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    return { processedCount, errors };
}