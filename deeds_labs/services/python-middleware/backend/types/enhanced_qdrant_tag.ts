/**
 * ═══════════════════════════════════════════════════════════════════════
 * Agentic Knowledge Integration V2 - Enhanced Qdrant Tag Interface
 * ═══════════════════════════════════════════════════════════════════════
 * Date: January 2, 2026
 * Purpose: TypeScript interface for enhanced Qdrant tags with validation
 * Task: 5.1 - Create EnhancedQdrantTag interface
 * ═══════════════════════════════════════════════════════════════════════
 */

import { z } from 'zod';

/**
 * Enhanced Qdrant Tag - Complete tag with embedding, summary, and metadata
 */
export interface EnhancedQdrantTag {
  id: string;
  name: string;
  category: 'file' | 'function' | 'component' | 'error' | 'pattern';
  embedding: number[]; // 384-dim vector from embeddinggemma
  summary: string; // AI-generated summary from gemma3-legal
  metadata: {
    filePath: string;
    lineNumber?: number;
    astNodeType?: string;
    imports?: string[];
    exports?: string[];
    dependencies?: string[];
    errorType?: string;
    confidence?: number;
  };
  timestamp: string; // ISO 8601
  clusterId?: string; // K-means cluster assignment
  coordinates?: {
    x: number;
    y: number;
    z: number;
  }; // CUDA-computed tensor coordinates
}

/**
 * Zod validation schema for EnhancedQdrantTag
 */
export const EnhancedQdrantTagSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  category: z.enum(['file', 'function', 'component', 'error', 'pattern']),
  embedding: z.array(z.number()).length(384),
  summary: z.string().min(1),
  metadata: z.object({
    filePath: z.string().min(1),
    lineNumber: z.number().int().positive().optional(),
    astNodeType: z.string().optional(),
    imports: z.array(z.string()).optional(),
    exports: z.array(z.string()).optional(),
    dependencies: z.array(z.string()).optional(),
    errorType: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
  }),
  timestamp: z.string().datetime(),
  clusterId: z.string().uuid().optional(),
  coordinates: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }).optional(),
});

/**
 * Type guard for EnhancedQdrantTag
 */
export function isEnhancedQdrantTag(obj: unknown): obj is EnhancedQdrantTag {
  try {
    EnhancedQdrantTagSchema.parse(obj);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate EnhancedQdrantTag and throw on error
 */
export function validateEnhancedQdrantTag(obj: unknown): EnhancedQdrantTag {
  return EnhancedQdrantTagSchema.parse(obj) as EnhancedQdrantTag;
}

/**
 * Factory function to create a new EnhancedQdrantTag
 */
export function createEnhancedQdrantTag(
  name: string,
  category: EnhancedQdrantTag['category'],
  filePath: string,
  embedding: number[],
  summary: string,
  metadata?: Partial<EnhancedQdrantTag['metadata']>
): EnhancedQdrantTag {
  const tag: EnhancedQdrantTag = {
    id: crypto.randomUUID(),
    name,
    category,
    embedding,
    summary,
    metadata: {
      filePath,
      ...metadata,
    },
    timestamp: new Date().toISOString(),
  };

  // Validate before returning
  return validateEnhancedQdrantTag(tag);
}

/**
 * Factory function to create a file tag
 */
export function createFileTag(
  filePath: string,
  embedding: number[],
  summary: string,
  metadata?: Partial<EnhancedQdrantTag['metadata']>
): EnhancedQdrantTag {
  const fileName = filePath.split('/').pop() || filePath;
  return createEnhancedQdrantTag(
    fileName,
    'file',
    filePath,
    embedding,
    summary,
    metadata
  );
}

/**
 * Factory function to create a function tag
 */
export function createFunctionTag(
  functionName: string,
  filePath: string,
  lineNumber: number,
  embedding: number[],
  summary: string,
  metadata?: Partial<EnhancedQdrantTag['metadata']>
): EnhancedQdrantTag {
  return createEnhancedQdrantTag(
    functionName,
    'function',
    filePath,
    embedding,
    summary,
    {
      lineNumber,
      astNodeType: 'FunctionDeclaration',
      ...metadata,
    }
  );
}

/**
 * Factory function to create a component tag
 */
export function createComponentTag(
  componentName: string,
  filePath: string,
  lineNumber: number,
  embedding: number[],
  summary: string,
  metadata?: Partial<EnhancedQdrantTag['metadata']>
): EnhancedQdrantTag {
  return createEnhancedQdrantTag(
    componentName,
    'component',
    filePath,
    embedding,
    summary,
    {
      lineNumber,
      astNodeType: 'ComponentDeclaration',
      ...metadata,
    }
  );
}

/**
 * Factory function to create an error tag
 */
export function createErrorTag(
  errorMessage: string,
  filePath: string,
  lineNumber: number,
  errorType: string,
  embedding: number[],
  summary: string,
  metadata?: Partial<EnhancedQdrantTag['metadata']>
): EnhancedQdrantTag {
  return createEnhancedQdrantTag(
    errorMessage,
    'error',
    filePath,
    embedding,
    summary,
    {
      lineNumber,
      errorType,
      astNodeType: 'Error',
      ...metadata,
    }
  );
}

/**
 * Factory function to create a pattern tag
 */
export function createPatternTag(
  patternName: string,
  filePath: string,
  embedding: number[],
  summary: string,
  metadata?: Partial<EnhancedQdrantTag['metadata']>
): EnhancedQdrantTag {
  return createEnhancedQdrantTag(
    patternName,
    'pattern',
    filePath,
    embedding,
    summary,
    metadata
  );
}

/**
 * Update tag summary
 */
export function updateTagSummary(
  tag: EnhancedQdrantTag,
  newSummary: string
): EnhancedQdrantTag {
  const updated = {
    ...tag,
    summary: newSummary,
    timestamp: new Date().toISOString(),
  };
  return validateEnhancedQdrantTag(updated);
}

/**
 * Update tag cluster assignment
 */
export function updateTagCluster(
  tag: EnhancedQdrantTag,
  clusterId: string
): EnhancedQdrantTag {
  const updated = {
    ...tag,
    clusterId,
    timestamp: new Date().toISOString(),
  };
  return validateEnhancedQdrantTag(updated);
}

/**
 * Update tag coordinates
 */
export function updateTagCoordinates(
  tag: EnhancedQdrantTag,
  coordinates: { x: number; y: number; z: number }
): EnhancedQdrantTag {
  const updated = {
    ...tag,
    coordinates,
    timestamp: new Date().toISOString(),
  };
  return validateEnhancedQdrantTag(updated);
}

/**
 * Serialize tag for storage
 */
export function serializeTag(tag: EnhancedQdrantTag): string {
  return JSON.stringify(tag);
}

/**
 * Deserialize tag from storage
 */
export function deserializeTag(json: string): EnhancedQdrantTag {
  const obj = JSON.parse(json);
  return validateEnhancedQdrantTag(obj);
}
