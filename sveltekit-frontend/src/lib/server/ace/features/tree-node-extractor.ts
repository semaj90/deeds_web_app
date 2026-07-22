import { z } from 'zod';
import { createHash } from 'node:crypto';

export const TreeNodeIdSchema = z.object({
  sourceRef: z.string(),
  language: z.string(),
  kind: z.string(), // 'function', 'class', 'variable', 'type', 'interface', 'enum', 'module', 'import'
  name: z.string(),
  lineStart: z.number(),
  lineEnd: z.number(),
  hash: z.string()
});

export type TreeNodeId = z.infer<typeof TreeNodeIdSchema>;

export class TreeNodeExtractor {
  generateNodeId(node: Omit<TreeNodeId, 'hash'>): string {
    const components = [
      node.sourceRef,
      node.language,
      node.kind,
      node.name,
      node.lineStart.toString(),
      node.lineEnd.toString()
    ];

    const hash = createHash('sha256')
      .update(components.join('|'))
      .digest('hex')
      .slice(0, 16);

    return hash;
  }

  extractFromTypeScript(sourceRef: string, content: string): TreeNodeId[] {
    const nodes: TreeNodeId[] = [];
    const lines = content.split('\n');

    // Simple regex-based extraction (production code would use a proper AST parser like ts-morph)
    const functionPattern = /^\s*(async\s+)?function\s+(\w+)\s*\(/gm;
    const classPattern = /^\s*class\s+(\w+)/gm;
    const interfacePattern = /^\s*interface\s+(\w+)/gm;
    const exportConstPattern = /^\s*export\s+const\s+(\w+)\s*[:=]/gm;
    const importPattern = /^\s*import\s+.*?from\s+['"]([^'"]+)['"]/gm;

    let match;

    // Extract functions
    while ((match = functionPattern.exec(content)) !== null) {
      const lineNum = content.substring(0, match.index).split('\n').length;
      nodes.push({
        sourceRef,
        language: 'typescript',
        kind: 'function',
        name: match[2],
        lineStart: lineNum,
        lineEnd: lineNum + 10, // Estimate
        hash: ''
      });
    }

    // Extract classes
    while ((match = classPattern.exec(content)) !== null) {
      const lineNum = content.substring(0, match.index).split('\n').length;
      nodes.push({
        sourceRef,
        language: 'typescript',
        kind: 'class',
        name: match[1],
        lineStart: lineNum,
        lineEnd: lineNum + 30,
        hash: ''
      });
    }

    // Extract interfaces
    while ((match = interfacePattern.exec(content)) !== null) {
      const lineNum = content.substring(0, match.index).split('\n').length;
      nodes.push({
        sourceRef,
        language: 'typescript',
        kind: 'interface',
        name: match[1],
        lineStart: lineNum,
        lineEnd: lineNum + 15,
        hash: ''
      });
    }

    // Extract exported constants
    while ((match = exportConstPattern.exec(content)) !== null) {
      const lineNum = content.substring(0, match.index).split('\n').length;
      nodes.push({
        sourceRef,
        language: 'typescript',
        kind: 'variable',
        name: match[1],
        lineStart: lineNum,
        lineEnd: lineNum,
        hash: ''
      });
    }

    // Generate hashes for all nodes
    return nodes.map(node => ({
      ...node,
      hash: this.generateNodeId(node)
    }));
  }

  extractFromRust(sourceRef: string, content: string): TreeNodeId[] {
    const nodes: TreeNodeId[] = [];

    const fnPattern = /^\s*(pub\s+)?(async\s+)?fn\s+(\w+)/gm;
    const structPattern = /^\s*(pub\s+)?struct\s+(\w+)/gm;
    const implPattern = /^\s*impl\s+(\w+)/gm;
    const traitPattern = /^\s*(pub\s+)?trait\s+(\w+)/gm;

    let match;

    while ((match = fnPattern.exec(content)) !== null) {
      const lineNum = content.substring(0, match.index).split('\n').length;
      nodes.push({
        sourceRef,
        language: 'rust',
        kind: 'function',
        name: match[3],
        lineStart: lineNum,
        lineEnd: lineNum + 20,
        hash: ''
      });
    }

    while ((match = structPattern.exec(content)) !== null) {
      const lineNum = content.substring(0, match.index).split('\n').length;
      nodes.push({
        sourceRef,
        language: 'rust',
        kind: 'class',
        name: match[2],
        lineStart: lineNum,
        lineEnd: lineNum + 15,
        hash: ''
      });
    }

    while ((match = traitPattern.exec(content)) !== null) {
      const lineNum = content.substring(0, match.index).split('\n').length;
      nodes.push({
        sourceRef,
        language: 'rust',
        kind: 'interface',
        name: match[2],
        lineStart: lineNum,
        lineEnd: lineNum + 20,
        hash: ''
      });
    }

    return nodes.map(node => ({
      ...node,
      hash: this.generateNodeId(node)
    }));
  }

  extractFromCpp(sourceRef: string, content: string): TreeNodeId[] {
    const nodes: TreeNodeId[] = [];

    const fnPattern = /^\s*(?:static\s+)?(?:\w+\s+)*(\w+)\s*\([^)]*\)\s*{/gm;
    const classPattern = /^\s*(?:class|struct)\s+(\w+)/gm;

    let match;

    while ((match = fnPattern.exec(content)) !== null) {
      const lineNum = content.substring(0, match.index).split('\n').length;
      nodes.push({
        sourceRef,
        language: 'cpp',
        kind: 'function',
        name: match[1],
        lineStart: lineNum,
        lineEnd: lineNum + 30,
        hash: ''
      });
    }

    while ((match = classPattern.exec(content)) !== null) {
      const lineNum = content.substring(0, match.index).split('\n').length;
      nodes.push({
        sourceRef,
        language: 'cpp',
        kind: 'class',
        name: match[1],
        lineStart: lineNum,
        lineEnd: lineNum + 50,
        hash: ''
      });
    }

    return nodes.map(node => ({
      ...node,
      hash: this.generateNodeId(node)
    }));
  }

  extract(sourceRef: string, content: string, language?: string): TreeNodeId[] {
    // Auto-detect language from sourceRef if not provided
    const detectedLanguage = language ||
      (sourceRef.endsWith('.ts') || sourceRef.endsWith('.tsx') ? 'typescript' :
       sourceRef.endsWith('.rs') ? 'rust' :
       sourceRef.endsWith('.cc') || sourceRef.endsWith('.h') ? 'cpp' :
       'unknown');

    switch (detectedLanguage) {
      case 'typescript':
        return this.extractFromTypeScript(sourceRef, content);
      case 'rust':
        return this.extractFromRust(sourceRef, content);
      case 'cpp':
        return this.extractFromCpp(sourceRef, content);
      default:
        return [];
    }
  }
}
