import { readCodebaseFiles, processCodeSnippet } from '$lib/utils/codebase-loader';
import { writeFact, Fact } from '$lib/utils/fact-writer';

/**
 * Maps source code files into structured, indexed facts.
 * This script reads from the codebase directory structure and transforms raw code snippets into structured JSONL facts.
 *
 * @param codePaths An array of paths to the source code files to process.
 * @param context A context object containing necessary configuration or memory pointers.
 * @returns A Promise resolving to a count of facts processed and any errors encountered.
 */
export async function mapCode(codePaths: string[], context: { sourceRefs: string[] }): Promise<{ processedCount: number, errors: string[] }> {
    console.log("Starting code mapping process...");
    const facts: Fact[] = [];
    const errors: string[] = [];
    let processedCount = 0;

    for (const path of codePaths) {
        try {
            // 1. Read the raw code content from the specified file path
            const codeContent = await readCodebaseFiles(path);
            if (!codeContent) {
                errors.push(`Could not read code at path: ${path}`);
                continue;
            }

            // 2. Process the code content to extract semantic facts (e.g., function signatures, class methods)
            const factsFromCode = await processCodeSnippet(codeContent, context.sourceRefs);

            // 3. Write extracted facts to the Fact Store (JSONL output)
            for (const fact of factsFromCode) {
                // The 'writeFact' utility handles emitting the standardized JSONL format
                await writeFact(fact);
                facts.push(fact);
                processedCount++;
            }

        } catch (e) {
            errors.push(`Error processing code ${path}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    return { processedCount, errors };
}