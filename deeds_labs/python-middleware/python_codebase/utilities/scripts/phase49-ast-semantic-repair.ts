import { Project, SyntaxKind, Node } from 'ts-morph';
import fs from 'fs';
import path from 'path';
import { Redis } from 'ioredis';
import { config } from 'dotenv';

config(); // Load environment variables

interface Diagnostic {
    code: string;
    message: string;
    severity: 'error' | 'warning' | 'info';
    file: string;
    line: number;
    character: number;
    embeddingId?: string;
    fixSuggestion?: string;
    semanticGroup?: string;
}

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const GEMMA_API_URL = process.env.GEMMA_API_URL || 'http://localhost:11434/api/generate'; // Default Ollama endpoint
const EMBEDDING_GEMMA_API_URL = process.env.EMBEDDING_GEMMA_API_URL || 'http://localhost:11434/api/embeddings'; // Default Ollama endpoint

const redis = new Redis(REDIS_URL, {
    password: REDIS_PASSWORD,
});

async function generateEmbedding(text: string): Promise<number[]> {
    try {
        const response = await fetch(EMBEDDING_GEMMA_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'embeddinggemma:latest',
                prompt: text,
            }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data.embedding;
    } catch (error) {
        console.error('Error generating embedding:', error);
        return [];
    }
}

async function getGemmaFixSuggestion(prompt: string): Promise<string> {
    try {
        const response = await fetch(GEMMA_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gemma3-legal:latest',
                prompt: prompt,
                stream: false,
            }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data.response.trim();
    } catch (error) {
        console.error('Error getting Gemma fix suggestion:', error);
        return 'No fix suggestion available.';
    }
}

async function processDiagnostics(inputFilePath: string) {
    const diagnostics: Diagnostic[] = JSON.parse(fs.readFileSync(inputFilePath, 'utf-8'));
    const project = new Project();

    console.log(`Processing ${diagnostics.length} diagnostics...`);

    for (const diagnostic of diagnostics) {
        console.log(`\n--- Processing Diagnostic: ${diagnostic.code} ---`);
        console.log(`Message: ${diagnostic.message}`);
        console.log(`File: ${diagnostic.file}:${diagnostic.line}:${diagnostic.character}`);

        // 1. Build an AST morph tree using ts-morph
        const sourceFile = project.addSourceFileAtPathIfExists(diagnostic.file);
        if (sourceFile) {
            // compute absolute position from line/character and use getDescendantAtPos
            let pos = 0;
            try {
                // diagnostic.line/character are usually 1-based; convert to 0-based and clamp.
                // ts-morph SourceFile may not expose getPositionOfLineAndCharacter in some setups,
                // so compute absolute position from the file text to avoid the missing API.
                const text = sourceFile.getFullText();
                const lines = text.split(/\r\n|\n|\r/);
                const lineIndex = Math.max(0, (diagnostic.line || 1) - 1);
                const charIndex = Math.max(0, (diagnostic.character || 1) - 1);

                if (lineIndex >= lines.length) {
                    // fall back to start of file if line is out of range
                    pos = 0;
                } else {
                    let offset = 0;
                    for (let i = 0; i < lineIndex; i++) {
                        // add line length + 1 for the newline that was split out
                        offset += lines[i].length + 1;
                    }
                    // clamp character to line length
                    offset += Math.min(charIndex, lines[lineIndex].length);
                    pos = offset;
                }
            } catch (err) {
                // fallback to start of file on error
                pos = 0;
            }

            const node = sourceFile.getDescendantAtPos(pos);
            if (node) {
                console.log(`AST Node Kind: ${node.getKindName()}`);
                // You can further analyze the AST node here
                // For example, get its parent, children, text, etc.
            } else {
                console.log('Could not find AST node at specified position.');
            }
        } else {
            console.log(`Could not load source file: ${diagnostic.file}`);
        }

        // 2. Query embeddinggemma:latest for semantic grouping
        const embeddingText = `${diagnostic.file} ${diagnostic.message}`;
        const embedding = await generateEmbedding(embeddingText);
        if (embedding.length > 0) {
            const embeddingId = `embedding:${diagnostic.code}:${diagnostic.file}:${diagnostic.line}`;
            await redis.hset(embeddingId, {
                vector: JSON.stringify(embedding),
                message: diagnostic.message,
                file: diagnostic.file,
                line: diagnostic.line,
                code: diagnostic.code,
            });
            diagnostic.embeddingId = embeddingId;
            console.log(`Generated and stored embedding for diagnostic: ${embeddingId}`);
            // In a real scenario, you'd query for semantic groups here
            // For now, we'll just store the embedding.
            diagnostic.semanticGroup = 'ungrouped'; // Placeholder
        }

        // 3. Use gemma3-legal:latest for natural-language fix suggestions
        const fixPrompt = `Given the following diagnostic from a SvelteKit project, provide a concise natural language fix suggestion. Focus on the core issue and a direct solution.

        Diagnostic Code: ${diagnostic.code}
        File: ${diagnostic.file}
        Line: ${diagnostic.line}
        Message: ${diagnostic.message}

        Fix Suggestion:`;
        const fixSuggestion = await getGemmaFixSuggestion(fixPrompt);
        diagnostic.fixSuggestion = fixSuggestion;
        console.log(`Fix Suggestion (Gemma): ${fixSuggestion}`);

        // 4. Store enriched results in Redis + Neo4j (Neo4j integration is Phase 50)
        const diagnosticKey = `diagnostic:${diagnostic.code}:${diagnostic.file}:${diagnostic.line}`;
        await redis.hset(diagnosticKey, {
            ...diagnostic,
            embedding: JSON.stringify(embedding), // Store embedding as string
            timestamp: new Date().toISOString(),
        });
        console.log(`Stored enriched diagnostic in Redis: ${diagnosticKey}`);
    }

    console.log('\nAll diagnostics processed.');
    // You might want to save the enriched diagnostics to a new JSON file or return them
    fs.writeFileSync('logs/phase49-enriched-diagnostics.json', JSON.stringify(diagnostics, null, 2));
    console.log('Enriched diagnostics saved to logs/phase49-enriched-diagnostics.json');

    redis.disconnect();
}

async function main() {
    const args = process.argv.slice(2);
    const inputFlagIndex = args.indexOf('--input');
    let inputFilePath: string | undefined;

    if (inputFlagIndex > -1 && args[inputFlagIndex + 1]) {
        inputFilePath = args[inputFlagIndex + 1];
    }

    if (!inputFilePath) {
        console.error('Usage: npx tsx scripts/phase49-ast-semantic-repair.ts --input <path_to_diagnostics.json>');
        process.exit(1);
    }

    await processDiagnostics(inputFilePath);
}

main().catch(console.error);