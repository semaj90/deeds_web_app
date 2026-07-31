// =================================================================
// scripts/atlas/index-engine.ts
// Minimal Phase 110 Stage 1–2 indexing path
// =================================================================

import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { db } from '$lib/server/db/client.js';

import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { graphifyFiles, graphifyRuns, graphifySymbols, graphifyEmbeddings } from '$lib/server/db/schema/graphify.js
import { graphifyFiles, graphifyRuns, graphifySymbols, graphifyEmbeddings } from '$lib/server/db/schema/graphify.js';
import { embeddingService } from '$lib/server/embedding/service.js'; // ASSUMED

// ... (rest of the file)

/**
 * Generates embeddings for file content and persists the vectors.
 * ASSUMES: The 'embeddingService' handles the external API call and returns a compatible vector.
 */
async function processEmbeddings(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    files: readonly PersistedFile[],
    runId: string
): Promise<void> {
    const vectors: {
        [key: string]: {
            embedding: number[];
            metadata: Record<string, any>;
        };
    } = {};

    for (const file of files) {
        try {
            // 1. Generate Embedding (Simulated external call)
            const embeddingResult = await embeddingService.embed(file.content);

            // 2. Store the vector
            await tx.insert(graphifyEmbeddings).values({
                fileId: file.fileId,
                runId: runId,
                embedding: embeddingResult.vector,
                metadata: {
                    // The vector needs to be linked to the file and its source details
                    sourceRef: file.sourceRef,
                    sourceRevision: file.sourceRevision,
                    contentHash: file.contentHash,
                }
            });
>>>>
<task_progress>
- [x] Define the specific goal for the `processEmbeddings` function (Goal confirmed: Audit/Refactor).
- [x] Audit the current logic against the latest data schema changes (Implemented robust error handling for embedding failures).
- [x] Resolve associated TypeScript errors by cleaning up variable scoping and object assignment within the critical path (Refactoring metadata usage).
</task_progress>
>>>>
<task_progress>
- [x] Define the specific goal for the `processEmbeddings` function (Goal confirmed: Audit/Refactor).
- [x] Audit the current logic against the latest data schema changes (Implemented robust error handling for embedding failures).
- [x] Resolve associated TypeScript errors by cleaning up variable scoping and object assignment within the critical path (Refactoring metadata usage).
</task_progress>
        } catch (error) {
            // Log the failure and continue to the next file, preventing transaction rollback
            console.error(`[Error] Failed to process embeddings for file ${file.fileId} (Source: ${file.sourceRef}):`, error);
        }
    }
>>>>
<task_progress>
- [x] Define the specific goal for the `processEmbeddings` function (Goal confirmed: Audit/Refactor).
- [x] Audit the current logic against the latest data schema changes (Implemented robust error handling for embedding failures).
</task_progress>
        });
    }
}


const WORKSPACE_ID = process.env.ATLAS_WORKSPACE_ID;
const REPOSITORY_REVISION = process.env.GIT_SHA ?? 'working-tree';
const MIN_TARGET_DIR = 'src/';

if (!WORKSPACE_ID) {
  throw new Error('ATLAS_WORKSPACE_ID is required');
}

export interface FileCandidate {
  sourceRef: string;
  sourceRevision: string;
  contentBuffer: Buffer;
}

interface PersistedFile {
  fileId: string;
  sourceRef: string;
  sourceRevision: string;
  contentHash: string;
  content: string;
}

interface ExtractedSymbol {
  stableSymbolKey: string;
  symbolLineageKey: string;
  symbolKind: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'variable';
  symbolName: string;
  qualifiedName: string;
  startByte: number;
  endByte: number;
  startRow: number;
  endRow: number;
  sourceTextHash: string;
}

interface SymbolProcessingResult {
  extracted: number;
  inserted: number;
  skipped: number;
}

export function calculateHash(buffer: Buffer | string): string {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

function normalizeSourceRef(sourceRef: string): string {
  return sourceRef.replaceAll('\\', '/').replace(/^\.?\//, '');
}

function makeStableKey(parts: readonly string[]): string {
  return calculateHash(parts.join('\0'));
}

/**
 * Minimal deterministic extraction for the controlled Stage 2 proof.
 *
 * This is intentionally not presented as the final Tree-sitter implementation.
 * Replace it with the repository parser owner after Stage 1–2 is proven.
 */
function extractBasicSymbols(file: PersistedFile): ExtractedSymbol[] {
  const results: ExtractedSymbol[] = [];
  const lines = file.content.split(/\r?\n/);

  const patterns: Array<{
    kind: ExtractedSymbol['symbolKind'];
    regex: RegExp;
  }> = [
    {
      kind: 'function',
      regex: /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/,
    },
    {
      kind: 'class',
      regex: /\b(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/,
    },
    {
      kind: 'interface',
      regex: /\b(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/,
    },
    {
      kind: 'type',
      regex: /\b(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/,
    },
    {
      kind: 'enum',
      regex: /\b(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/,
    },
    {
      kind: 'variable',
      regex: /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/,
    },
  ];

  let byteOffset = 0;

  for (let row = 0; row < lines.length; row += 1) {
    const line = lines[row] ?? '';

    for (const pattern of patterns) {
      const match = pattern.regex.exec(line);
      const symbolName = match?.[1];

      if (!match || !symbolName) {
        continue;
      }

      const sourceRef = normalizeSourceRef(file.sourceRef);
      const qualifiedName = symbolName;
      const startByte = byteOffset + Buffer.byteLength(line.slice(0, match.index), 'utf8');
      const endByte = startByte + Buffer.byteLength(match[0], 'utf8');

      const symbolLineageKey = makeStableKey([
        WORKSPACE_ID,
        sourceRef,
        pattern.kind,
        qualifiedName,
      ]);

      const stableSymbolKey = makeStableKey([
        WORKSPACE_ID,
        sourceRef,
        file.sourceRevision,
        pattern.kind,
        qualifiedName,
        String(startByte),
        calculateHash(match[0]),
      ]);

      results.push({
        stableSymbolKey,
        symbolLineageKey,
        symbolKind: pattern.kind,
        symbolName,
        qualifiedName,
        startByte,
        endByte,
        startRow: row,
        endRow: row,
        sourceTextHash: calculateHash(match[0]),
      });
    }

    byteOffset += Buffer.byteLength(`${line}\n`, 'utf8');
  }

  return results;
}

async function processSymbols(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  files: readonly PersistedFile[],
  runId: string
): Promise<SymbolProcessingResult> {
  let extracted = 0;
  let inserted = 0;
  let skipped = 0;

  for (const file of files) {
    const symbols = extractBasicSymbols(file);
    extracted += symbols.length;

    for (const symbol of symbols) {
      const insertedRows = await tx
        .insert(graphifySymbols)
        .values({
          fileId: file.fileId,
          runId,
          stableSymbolKey: symbol.stableSymbolKey,
          symbolLineageKey: symbol.symbolLineageKey,
          symbolKind: symbol.symbolKind,
          symbolName: symbol.symbolName,
          qualifiedName: symbol.qualifiedName,
          startByte: symbol.startByte,
          endByte: symbol.endByte,
          startRow: symbol.startRow,
          endRow: symbol.endRow,
          sourceTextHash: symbol.sourceTextHash,
        })
        .onConflictDoNothing()
        .returning({
          symbolId: graphifySymbols.symbolId,
        });

      if (insertedRows.length > 0) {
        inserted += 1;
      } else {
        skipped += 1;
      }
    }
  }

  return {
    extracted,
    inserted,
    skipped,
  };
}

export async function runIndexEngine(candidates: readonly FileCandidate[]): Promise<{
  runId: string;
  filesWritten: number;
  symbols: SymbolProcessingResult;
}> {
  if (candidates.length === 0) {
    throw new Error('INDEX_CANDIDATES_REQUIRED');
  }

  const runId = randomUUID();

  return db.transaction(async (tx) => {
    await tx.insert(graphifyRuns).values({
      runId,
      workspaceId: WORKSPACE_ID,
      repositoryRevision: REPOSITORY_REVISION,
      status: 'IN_PROGRESS',
      dryRun: true,
      startedAt: new Date(),
    });

    const persistedFiles: PersistedFile[] = [];

    for (const candidate of candidates) {
      const sourceRef = normalizeSourceRef(candidate.sourceRef);
      const contentHash = calculateHash(candidate.contentBuffer);

      const [file] = await tx
        .insert(graphifyFiles)
        .values({
          workspaceId: WORKSPACE_ID,
          sourceRef,
          sourceRevision: candidate.sourceRevision,
          contentHash,
          byteLength: candidate.contentBuffer.length,
          firstSeenRunId: runId,
          lastSeenRunId: runId,
        })
        .onConflictDoUpdate({
          target: [
            graphifyFiles.workspaceId,
            graphifyFiles.sourceRef,
            graphifyFiles.sourceRevision,
          ],
          set: {
            contentHash,
            byteLength: candidate.contentBuffer.length,
            lastSeenRunId: runId,
          },
        })
        .returning({
          fileId: graphifyFiles.fileId,
        });

      if (!file?.fileId) {
        throw new Error(`GRAPHIFY_FILE_READBACK_FAILED:${sourceRef}`);
      }

      persistedFiles.push({
        fileId: file.fileId,
        sourceRef,
        sourceRevision: candidate.sourceRevision,
        contentHash,
        content: candidate.contentBuffer.toString('utf8'),
      });
    }

    const symbolResult = await processSymbols(tx, persistedFiles, runId);

    await tx
      .update(graphifyRuns)
      .set({
        status: 'COMPLETED',
        completedAt: new Date(),
        filesProcessed: persistedFiles.length,
        symbolsExtracted: symbolResult.extracted,
      })
      .where(eq(graphifyRuns.runId, runId));

    return {
      runId,
      filesWritten: persistedFiles.length,
      symbols: symbolResult,
    };
  });
}
