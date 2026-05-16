// Phase 89: Adaptive Chunking Library
// Smart context-preserving chunking with AST awareness and overlap strategy

import { parse } from '@typescript-eslint/typescript-estree';

/**
 * Adaptive chunking strategy
 * - Preserves AST boundaries (functions, classes, blocks)
 * - Maintains context overlap between chunks
 * - Adapts chunk size based on error density
 * - Includes metadata for reassembly
 */

export const ChunkStrategy = {
  AST_AWARE: 'ast-aware',        // Split at function/class boundaries
  SLIDING_WINDOW: 'sliding',     // Fixed size with overlap
  ERROR_DENSE: 'error-dense',    // Smaller chunks in high-error areas
  SEMANTIC: 'semantic'           // Topic-based chunking
};

export class AdaptiveChunker {
  constructor(options = {}) {
    this.baseChunkSize = options.baseChunkSize || 500; // lines
    this.overlapLines = options.overlapLines || 50;
    this.minChunkSize = options.minChunkSize || 100;
    this.maxChunkSize = options.maxChunkSize || 1000;
    this.strategy = options.strategy || ChunkStrategy.AST_AWARE;
    this.errorDensityThreshold = options.errorDensityThreshold || 0.1; // errors per line
  }

  /**
   * Chunk a file with adaptive strategy
   * @param {string} content - File content
   * @param {string} filePath - File path for context
   * @param {Array} errors - Known errors in this file
   * @returns {Array<Chunk>} - Array of chunks with metadata
   */
  chunk(content, filePath, errors = []) {
    const lines = content.split('\n');
    const errorDensity = this.calculateErrorDensity(lines, errors);

    // Select strategy based on error density
    const strategy = errorDensity > this.errorDensityThreshold
      ? ChunkStrategy.ERROR_DENSE
      : this.strategy;

    switch (strategy) {
      case ChunkStrategy.AST_AWARE:
        return this.chunkByAST(content, filePath, lines, errors);

      case ChunkStrategy.ERROR_DENSE:
        return this.chunkErrorDense(lines, filePath, errors);

      case ChunkStrategy.SLIDING_WINDOW:
        return this.chunkSlidingWindow(lines, filePath, errors);

      case ChunkStrategy.SEMANTIC:
        return this.chunkSemantic(lines, filePath, errors);

      default:
        return this.chunkByAST(content, filePath, lines, errors);
    }
  }

  /**
   * AST-aware chunking: Split at function/class boundaries
   */
  chunkByAST(content, filePath, lines, errors) {
    const chunks = [];

    try {
      const ast = parse(content, {
        loc: true,
        range: true,
        comment: true,
        errorOnUnknownASTType: false
      });

      const boundaries = this.extractASTBoundaries(ast);

      // Create chunks from AST boundaries
      let currentStart = 0;

      for (const boundary of boundaries) {
        const chunk = this.createChunk(
          lines,
          currentStart,
          boundary.end,
          filePath,
          errors,
          { type: 'ast', name: boundary.name, kind: boundary.kind }
        );

        if (chunk.lines.length >= this.minChunkSize) {
          chunks.push(chunk);
          currentStart = Math.max(0, boundary.end - this.overlapLines);
        }
      }

      // Handle remaining lines
      if (currentStart < lines.length) {
        const chunk = this.createChunk(
          lines,
          currentStart,
          lines.length,
          filePath,
          errors,
          { type: 'ast', name: 'tail', kind: 'remainder' }
        );
        chunks.push(chunk);
      }

    } catch (parseError) {
      // Fall back to sliding window if AST parsing fails
      console.warn(`AST parsing failed for ${filePath}, using sliding window`);
      return this.chunkSlidingWindow(lines, filePath, errors);
    }

    return chunks;
  }

  /**
   * Extract function/class boundaries from AST
   */
  extractASTBoundaries(ast) {
    const boundaries = [];

    const visit = (node) => {
      if (!node) return;

      if (node.type === 'FunctionDeclaration' ||
          node.type === 'ClassDeclaration' ||
          node.type === 'MethodDefinition') {
        if (node.loc) {
          boundaries.push({
            start: node.loc.start.line - 1,
            end: node.loc.end.line,
            name: node.id?.name || node.key?.name || 'anonymous',
            kind: node.type
          });
        }
      }

      // Recurse into child nodes
      for (const key in node) {
        if (key === 'loc' || key === 'range' || key === 'parent') continue;

        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach(visit);
        } else if (child && typeof child === 'object') {
          visit(child);
        }
      }
    };

    visit(ast);

    // Sort by start line
    return boundaries.sort((a, b) => a.start - b.start);
  }

  /**
   * Error-dense chunking: Smaller chunks in high-error areas
   */
  chunkErrorDense(lines, filePath, errors) {
    const chunks = [];
    const errorLines = new Set(errors.map(e => e.line));

    let currentStart = 0;

    while (currentStart < lines.length) {
      // Count errors in next window
      const windowSize = this.baseChunkSize;
      const windowEnd = Math.min(currentStart + windowSize, lines.length);
      const errorsInWindow = Array.from(errorLines).filter(
        line => line >= currentStart && line < windowEnd
      ).length;

      // Adjust chunk size based on error density
      const density = errorsInWindow / windowSize;
      const adaptiveSize = density > this.errorDensityThreshold
        ? Math.max(this.minChunkSize, windowSize / 2)
        : windowSize;

      const chunkEnd = Math.min(currentStart + adaptiveSize, lines.length);

      const chunk = this.createChunk(
        lines,
        currentStart,
        chunkEnd,
        filePath,
        errors,
        { type: 'error-dense', errorCount: errorsInWindow, density }
      );

      chunks.push(chunk);
      currentStart = Math.max(0, chunkEnd - this.overlapLines);
    }

    return chunks;
  }

  /**
   * Sliding window chunking with overlap
   */
  chunkSlidingWindow(lines, filePath, errors) {
    const chunks = [];
    let currentStart = 0;

    while (currentStart < lines.length) {
      const chunkEnd = Math.min(currentStart + this.baseChunkSize, lines.length);

      const chunk = this.createChunk(
        lines,
        currentStart,
        chunkEnd,
        filePath,
        errors,
        { type: 'sliding', overlap: this.overlapLines }
      );

      chunks.push(chunk);

      // Move window with overlap
      currentStart = chunkEnd - this.overlapLines;

      // Prevent infinite loop at end
      if (chunkEnd === lines.length) break;
    }

    return chunks;
  }

  /**
   * Semantic chunking: Group by topic/imports/exports
   */
  chunkSemantic(lines, filePath, errors) {
    const chunks = [];
    let currentStart = 0;
    let currentTopic = 'imports';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Detect topic boundaries
      let newTopic = null;
      if (line.startsWith('import ')) newTopic = 'imports';
      else if (line.startsWith('export ')) newTopic = 'exports';
      else if (line.startsWith('class ')) newTopic = 'class';
      else if (line.startsWith('function ')) newTopic = 'function';
      else if (line.startsWith('const ') || line.startsWith('let ')) newTopic = 'variables';

      // Create chunk on topic change or size limit
      if ((newTopic && newTopic !== currentTopic) ||
          (i - currentStart > this.baseChunkSize)) {

        const chunk = this.createChunk(
          lines,
          currentStart,
          i,
          filePath,
          errors,
          { type: 'semantic', topic: currentTopic }
        );

        if (chunk.lines.length >= this.minChunkSize) {
          chunks.push(chunk);
          currentStart = Math.max(0, i - this.overlapLines);
        }

        if (newTopic) currentTopic = newTopic;
      }
    }

    // Handle remaining lines
    if (currentStart < lines.length) {
      const chunk = this.createChunk(
        lines,
        currentStart,
        lines.length,
        filePath,
        errors,
        { type: 'semantic', topic: currentTopic }
      );
      chunks.push(chunk);
    }

    return chunks;
  }

  /**
   * Create a chunk with full metadata
   */
  createChunk(lines, start, end, filePath, errors, metadata = {}) {
    const chunkLines = lines.slice(start, end);
    const chunkErrors = errors.filter(e => e.line >= start && e.line < end);

    return {
      id: `${filePath}:${start}-${end}`,
      filePath,
      startLine: start,
      endLine: end,
      lines: chunkLines,
      content: chunkLines.join('\n'),
      errors: chunkErrors,
      errorCount: chunkErrors.length,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
        chunkSize: chunkLines.length,
        hasOverlap: start > 0 && metadata.type !== 'ast'
      }
    };
  }

  /**
   * Calculate error density (errors per line)
   */
  calculateErrorDensity(lines, errors) {
    if (lines.length === 0) return 0;
    return errors.length / lines.length;
  }

  /**
   * Reassemble chunks back into original content
   * (useful for validation)
   */
  reassemble(chunks) {
    if (chunks.length === 0) return '';

    // Sort by start line
    const sorted = chunks.sort((a, b) => a.startLine - b.startLine);

    // Deduplicate overlapping lines
    const lines = [];
    let lastEnd = 0;

    for (const chunk of sorted) {
      if (chunk.startLine >= lastEnd) {
        // No overlap, append all lines
        lines.push(...chunk.lines);
      } else {
        // Overlap detected, skip duplicate lines
        const skipLines = lastEnd - chunk.startLine;
        lines.push(...chunk.lines.slice(skipLines));
      }
      lastEnd = chunk.endLine;
    }

    return lines.join('\n');
  }
}

/**
 * Chunk metadata for tracking and versioning
 */
export class ChunkMetadata {
  constructor(chunk) {
    this.chunkId = chunk.id;
    this.filePath = chunk.filePath;
    this.lineRange = [chunk.startLine, chunk.endLine];
    this.errorCount = chunk.errorCount;
    this.strategy = chunk.metadata.type;
    this.timestamp = chunk.metadata.timestamp;
    this.hash = this.hashContent(chunk.content);
  }

  /**
   * Generate content hash for change detection
   */
  async hashContent(content) {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Check if chunk has changed
   */
  hasChanged(newChunk) {
    return this.hash !== this.hashContent(newChunk.content);
  }
}

export default AdaptiveChunker;
