#!/usr/bin/env node
/**
 * Ingest TypeScript Compiler API documentation into Qdrant
 * For RAG/KAG/DAG-enhanced error fixing
 */

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { QdrantClient } from '@qdrant/js-client-rest';
import ollama from 'ollama';

const client = new QdrantClient({ url: 'http://localhost:6333' });
const COLLECTION_NAME = 'typescript_ast_documentation';

// TypeScript AST documentation content (from web search)
const TS_AST_DOCS = `
# TypeScript Compiler API - Key Patterns

## Using parseDiagnostics for Syntax-Only Analysis

CRITICAL: Avoid module resolution errors by using syntax-level diagnostics:

\`\`\`javascript
// ✅ CORRECT: Syntax-only, no module resolution
const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
const diagnostics = sourceFile.parseDiagnostics;

// ❌ WRONG: Requires module resolution, causes crashes
const program = ts.createProgram([filePath], compilerOptions);
const diagnostics = ts.getPreEmitDiagnostics(program, sourceFile);
\`\`\`

## AST Traversal Patterns

### Using forEachChild for Recursive Traversal

\`\`\`typescript
function visit(node: ts.Node) {
    switch (node.kind) {
        case ts.SyntaxKind.InterfaceDeclaration:
            handleInterface(node);
            break;
        case ts.SyntaxKind.ObjectLiteralExpression:
            handleObjectLiteral(node);
            break;
    }
    ts.forEachChild(node, visit);
}

ts.forEachChild(sourceFile, visit);
\`\`\`

### Context Detection by Parent Node Kind

\`\`\`typescript
function getContextForCommaFix(node: ts.Node): FixContext | null {
    const parent = node.parent;

    switch (parent?.kind) {
        case ts.SyntaxKind.InterfaceDeclaration:
        case ts.SyntaxKind.TypeLiteral:
            return { type: 'type_member', position: node.end };

        case ts.SyntaxKind.ObjectLiteralExpression:
            return { type: 'object_property', position: node.end };

        case ts.SyntaxKind.ArrayLiteralExpression:
            // Check multiline
            if (isMultiline(parent)) {
                return { type: 'array_element', position: node.end };
            }
            return null;  // Single-line arrays: comma optional

        case ts.SyntaxKind.CallExpression:
            return { type: 'function_argument', position: node.end };

        default:
            return null;  // Unknown context, skip for safety
    }
}
\`\`\`

## Node Position and Text Ranges

Every AST node has position information:

\`\`\`typescript
interface Node {
    pos: number;      // Start position (includes trivia)
    end: number;      // End position
    parent?: Node;    // Parent node
    kind: SyntaxKind; // Node type identifier
}

// Get line/character from position
const {line, character} = sourceFile.getLineAndCharacterOfPosition(node.start);

// Get node text
const nodeText = node.getText(sourceFile);
\`\`\`

## Applying Fixes - Reverse Order Strategy

IMPORTANT: Apply fixes from end to start to avoid position shifts:

\`\`\`typescript
function applyFixes(sourceFile: ts.SourceFile, fixes: Fix[]): string {
    let content = sourceFile.getFullText();

    // Sort reverse order (highest position first)
    const sortedFixes = [...fixes].sort((a, b) => b.position - a.position);

    for (const fix of sortedFixes) {
        content =
            content.substring(0, fix.position) +
            fix.text +
            content.substring(fix.position);
    }

    return content;
}
\`\`\`

## TypeScript SyntaxKind Reference

Common syntax kinds for error fixing:

- ts.SyntaxKind.InterfaceDeclaration (256)
- ts.SyntaxKind.TypeLiteral (187)
- ts.SyntaxKind.ObjectLiteralExpression (206)
- ts.SyntaxKind.ArrayLiteralExpression (205)
- ts.SyntaxKind.CallExpression (208)
- ts.SyntaxKind.BinaryExpression (221)
- ts.SyntaxKind.PropertyAssignment (299)
- ts.SyntaxKind.PropertySignature (169)
- ts.SyntaxKind.MethodDeclaration (174)

## Error Code Reference

TS1005: ',' expected, ';' expected, ':' expected, etc.
TS1128: Declaration or statement expected
TS2304: Cannot find name (cascading error)

## Type Checker Usage (Advanced)

For semantic analysis (requires full program):

\`\`\`typescript
const program = ts.createProgram(fileNames, compilerOptions);
const checker = program.getTypeChecker();

// Get symbol at location
const symbol = checker.getSymbolAtLocation(node);

// Get type of symbol
const type = checker.getTypeOfSymbolAtLocation(symbol, node);

// Convert type to string
const typeString = checker.typeToString(type);
\`\`\`

## Best Practices for Error Fixing

1. **Start with Syntax-Only**: Use parseDiagnostics to avoid module resolution
2. **Be Conservative**: Skip unknown contexts to prevent false positives
3. **Validate Fixes**: Re-parse after applying fixes, check error count
4. **Backup First**: Always create backups before modifying files
5. **Reverse Order**: Apply fixes from end to start
6. **Test Incrementally**: Fix one file, validate, then proceed

## Resources

- Official Docs: https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
- AST Viewer: https://ts-ast-viewer.com/
- Deep Dive: https://basarat.gitbook.io/typescript/overview/ast
`;

async function main() {
    console.log('🚀 Ingesting TypeScript AST Documentation to Qdrant');
    console.log('═'.repeat(70));

    // Check if collection exists
    try {
        await client.getCollection(COLLECTION_NAME);
        console.log(`\n⚠️  Collection "${COLLECTION_NAME}" already exists`);
        console.log('   Deleting and recreating...');
        await client.deleteCollection(COLLECTION_NAME);
    } catch (error) {
        console.log(`\n✅ Collection "${COLLECTION_NAME}" does not exist, creating...`);
    }

    // Create collection
    await client.createCollection(COLLECTION_NAME, {
        vectors: {
            size: 3072,  // nomic-embed-text dimensions
            distance: 'Cosine',
        },
    });

    console.log('✅ Collection created');

    // Split documentation into chunks
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 800,
        chunkOverlap: 200,
        separators: ['\n\n## ', '\n\n### ', '\n\n', '\n', ' '],
    });

    const chunks = await splitter.createDocuments([TS_AST_DOCS]);

    console.log(`\n📄 Split documentation into ${chunks.length} chunks`);

    // Generate embeddings and ingest
    const points = [];

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        // Generate embedding
        const response = await ollama.embeddings({
            model: 'nomic-embed-text:latest',
            prompt: chunk.pageContent,
        });

        points.push({
            id: i,
            vector: response.embedding,
            payload: {
                text: chunk.pageContent,
                source: 'typescript_ast_documentation',
                chunk_index: i,
            },
        });

        if ((i + 1) % 10 === 0) {
            console.log(`   Embedded ${i + 1}/${chunks.length} chunks`);
        }
    }

    // Upsert to Qdrant
    await client.upsert(COLLECTION_NAME, {
        wait: true,
        points,
    });

    console.log(`\n✅ Ingested ${points.length} chunks into Qdrant`);
    console.log(`📊 Collection: ${COLLECTION_NAME}`);
    console.log(`🔗 Endpoint: http://localhost:6333`);

    // Test query
    console.log(`\n🔍 Testing query: "How to avoid module resolution errors?"`);

    const queryResponse = await ollama.embeddings({
        model: 'nomic-embed-text:latest',
        prompt: 'How to avoid module resolution errors in TypeScript AST?',
    });

    const searchResults = await client.search(COLLECTION_NAME, {
        vector: queryResponse.embedding,
        limit: 3,
    });

    console.log(`\n📋 Top 3 results:`);
    searchResults.forEach((result, idx) => {
        console.log(`\n${idx + 1}. Score: ${result.score.toFixed(4)}`);
        console.log(`   Text: ${result.payload.text.substring(0, 150)}...`);
    });

    console.log(`\n✅ TypeScript AST documentation ready for RAG/KAG/DAG!`);
}

main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
});
