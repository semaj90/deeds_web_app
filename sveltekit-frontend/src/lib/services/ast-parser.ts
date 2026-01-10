/**
 * Universal AST Parser for Codebase Analysis
 *
 * Parses TypeScript, Svelte, and JavaScript into a unified AST format
 * for RAG/KAG/DAG analysis and CouchDB storage
 */

import * as fs from 'fs';
import * as path from 'path';
import { couchdb: aceGraphs } from './couchdb-client.js';

// Universal AST Node types
export interface UniversalASTNode {
  id: string;
  type: ASTNodeType;
  name?: string;
  kind?: string;
  start: number;
  end: number;
  children: UniversalASTNode[];
  metadata: Record<string, unknown>;
}

export type ASTNodeType =
  | 'Program'
  | 'Module'
  | 'Script'
  | 'Template'
  | 'Style'
  | 'Function'
  | 'Class'
  | 'Interface'
  | 'Type'
  | 'Variable'
  | 'Import'
  | 'Export'
  | 'Component'
  | 'Prop'
  | 'Event'
  | 'Slot'
  | 'Element'
  | 'Expression'
  | 'Statement'
  | 'Comment'
  | 'Error'
  | 'Unknown';

// File analysis result
export interface FileAST {
  id: string;
  file_path: string;
  language: 'typescript' | 'javascript' | 'svelte' | 'json' | 'css' | 'unknown';
  root: UniversalASTNode;
  imports: ImportInfo[];
  exports: ExportInfo[];
  dependencies: string[];
  errors: ErrorInfo[];
  metadata: {
    lines: number;
    bytes: number;
    hash: string;
    analyzed_at: string;
  };
}

export interface ImportInfo {
  source: string;
  specifiers: string[];
  type: 'default' | 'named' | 'namespace' | 'side-effect';
  line: number;
}

export interface ExportInfo {
  name: string;
  type: 'default' | 'named' | 'all';
  kind: 'function' | 'class' | 'variable' | 'type' | 'interface' | 'component' | 'unknown';
  line: number;
}

export interface ErrorInfo {
  line: number;
  column: number;
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

// Simple regex-based parser (no external dependencies)
class UniversalASTParser {
  private generateId(filePath: string, name: string): string {
    const hash = Buffer.from(filePath + name).toString('base64').slice(0, 16);
    return `ast_${hash}`;
  }

  private getLanguage(filePath: string): FileAST['language'] {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.js':
      case '.jsx':
      case '.mjs':
      case '.cjs':
        return 'javascript';
      case '.svelte':
        return 'svelte';
      case '.json':
        return 'json';
      case '.css':
      case '.scss':
      case '.less':
        return 'css';
      default:
        return 'unknown';
    }
  }

  /**
   * Parse a file into universal AST format
   */
  async parseFile(filePath: string): Promise<FileAST> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const language = this.getLanguage(filePath);
    const lines = content.split('\n').length;

    const fileAST: FileAST = {
      id: this.generateId(filePath, 'root'),
      file_path: filePath,
      language,
      root: {
        id: this.generateId(filePath, 'program'),
        type: 'Program',
        name: path.basename(filePath),
        start: 0,
        end: content.length,
        children: [],
        metadata: { language }
      },
      imports: [],
      exports: [],
      dependencies: [],
      errors: [],
      metadata: {
        lines,
        bytes: content.length,
        hash: Buffer.from(content).toString('base64').slice(0, 32),
        analyzed_at: new Date().toISOString()
      }
    };

    // Parse based on language
    switch (language) {
      case 'typescript':
      case 'javascript':
        this.parseJSTS(content, fileAST);
        break;
      case 'svelte':
        this.parseSvelte(content, fileAST);
        break;
    }

    return fileAST;
  }

  private parseJSTS(content: string, fileAST: FileAST): void {
    // Extract imports
    const importRegex = /import\s+(?:(?:(\w+)(?:\s*,\s*)?)?(?:\{([^}]+)\}\s*)?(?:\*\s+as\s+(\w+)\s*)?)?from\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const [, defaultImport, namedImports, namespaceImport, source] = match;
      const specifiers: string[] = [];
      let type: ImportInfo['type'] = 'side-effect';

      if (defaultImport) {
        specifiers.push(defaultImport);
        type = 'default';
      }
      if (namedImports) {
        specifiers.push(...namedImports.split(',').map(s => s.trim().split(' as ')[0]));
        type = specifiers.length > 0 ? 'named' : type;
      }
      if (namespaceImport) {
        specifiers.push(namespaceImport);
        type = 'namespace';
      }

      const line = content.slice(0, match.index).split('\n').length;
      fileAST.imports.push({ source, specifiers, type, line });
      fileAST.dependencies.push(source);

      // Add to AST
      fileAST.root.children.push({
        id: this.generateId(fileAST.file_path, `import_${ source }`),
        type: 'Import',
        name: source,
        start: match.index,
        end: match.index + match[0].length,
        children: [],
        metadata: { specifiers: type }
      });
    }

    // Extract exports
    const exportRegex = /export\s+(?:(default)\s+)?(?:(const|let|var|function|class|interface|type)\s+)?(\w+)/g;
    while ((match = exportRegex.exec(content)) !== null) {
      const [, isDefault, kind, name] = match;
      const line = content.slice(0, match.index).split('\n').length;

      fileAST.exports.push({
        name,
        type: isDefault ? 'default' : 'named',
        kind: (kind as ExportInfo['kind']) || 'unknown',
        line
      });

      fileAST.root.children.push({
        id: this.generateId(fileAST.file_path, `export_${ name }`),
        type: 'Export',
        name,
        kind: isDefault ? 'default' : 'named',
        start: match.index,
        end: match.index + match[0].length,
        children: [],
        metadata: { isDefault: !!isDefault, kind }
      });
    }

    // Extract functions
    const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/g;
    while ((match = functionRegex.exec(content)) !== null) {
      const [fullMatch, name] = match;
      fileAST.root.children.push({
        id: this.generateId(fileAST.file_path, `function_${ name }`),
        type: 'Function',
        name,
        start: match.index,
        end: match.index + fullMatch.length,
        children: [],
        metadata: { async: fullMatch.includes('async') }
      });
    }

    // Extract classes
    const classRegex = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/g;
    while ((match = classRegex.exec(content)) !== null) {
      const [fullMatch, name, extendsClass, implementsInterfaces] = match;
      fileAST.root.children.push({
        id: this.generateId(fileAST.file_path, `class_${name}`),
        type: 'Class',
        name,
        start: match.index,
        end: match.index + fullMatch.length,
        children: [],
        metadata: {
          extends: extendsClass,
          implements: implementsInterfaces?.split(',').map(s => s.trim())
        }
      });
    }

    // Extract interfaces
    const interfaceRegex = /(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+([^{]+))?/g;
    while ((match = interfaceRegex.exec(content)) !== null) {
      const [fullMatch, name, extendsInterfaces] = match;
      fileAST.root.children.push({
        id: this.generateId(fileAST.file_path, `interface_${name}`),
        type: 'Interface',
        name,
        start: match.index,
        end: match.index + fullMatch.length,
        children: [],
        metadata: {
          extends: extendsInterfaces?.split(',').map(s => s.trim())
        }
      });
    }

    // Extract type aliases
    const typeRegex = /(?:export\s+)?type\s+(\w+)\s*=/g;
    while ((match = typeRegex.exec(content)) !== null) {
      const [fullMatch, name] = match;
      fileAST.root.children.push({
        id: this.generateId(fileAST.file_path, `type_${name}`),
        type: 'Type',
        name,
        start: match.index,
        end: match.index + fullMatch.length,
        children: [],
        metadata: {}
      });
    }
  }

  private parseSvelte(content: string, fileAST: FileAST): void {
    // Extract script block
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    if (scriptMatch) {
      const scriptContent = scriptMatch[1];
      const scriptNode: UniversalASTNode = {
        id: this.generateId(fileAST.file_path, 'script'),
        type: 'Script',
        name: 'script',
        start: scriptMatch.index!,
        end: scriptMatch.index! + scriptMatch[0].length,
        children: [],
        metadata: {
          lang: scriptMatch[0].includes('lang="ts"') ? 'typescript' : 'javascript'
        }
      };
      fileAST.root.children.push(scriptNode);

      // Parse script content
      this.parseJSTS(scriptContent, fileAST);
    }

    // Extract style block
    const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/);
    if (styleMatch) {
      fileAST.root.children.push({
        id: this.generateId(fileAST.file_path, 'style'),
        type: 'Style',
        name: 'style',
        start: styleMatch.index!,
        end: styleMatch.index! + styleMatch[0].length,
        children: [],
        metadata: {
          scoped: styleMatch[0].includes('scoped') || true, // Svelte styles are scoped by default
          lang: styleMatch[0].includes('lang="scss"') ? 'scss' : 'css'
        }
      });
    }

    // Extract template (remaining content)
    let templateContent = content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
      .trim();

    if (templateContent) {
      const templateNode: UniversalASTNode = {
        id: this.generateId(fileAST.file_path, 'template'),
        type: 'Template',
        name: 'template',
        start: 0,
        end: templateContent.length,
        children: [],
        metadata: {}
      };

      // Extract component usage
      const componentRegex = /<([A-Z]\w+)[^>]*>/g;
      let match;
      while ((match = componentRegex.exec(templateContent)) !== null) {
        const componentName = match[1];
        templateNode.children.push({
          id: this.generateId(fileAST.file_path, `component_${componentName}`),
          type: 'Component',
          name: componentName,
          start: match.index,
          end: match.index + match[0].length,
          children: [],
          metadata: {}
        });
        fileAST.dependencies.push(componentName);
      }

      // Extract props
      const propRegex = /export\s+let\s+(\w+)/g;
      while ((match = propRegex.exec(content)) !== null) {
        fileAST.root.children.push({
          id: this.generateId(fileAST.file_path, `prop_${match[1]}`),
          type: 'Prop',
          name: match[1],
          start: match.index,
          end: match.index + match[0].length,
          children: [],
          metadata: {}
        });
      }

      fileAST.root.children.push(templateNode);
    }
  }

  /**
   * Parse a directory recursively
   */
  async parseDirectory(
    dirPath: string,
    options: {
      extensions?: string[];
      exclude?: string[];
      maxFiles?: number;
    } = {}
  ): Promise<FileAST[]> {
    const extensions = options.extensions || ['.ts', '.tsx', '.js', '.jsx', '.svelte'];
    const exclude = options.exclude || ['node_modules', '.git', 'dist', 'build'];
    const maxFiles = options.maxFiles || 1000;

    const results: FileAST[] = [];

    async function* walkDir(dir: string): AsyncGenerator<string> {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (exclude.some(ex => fullPath.includes(ex))) continue;

        if (entry.isDirectory()) {
          yield* walkDir(fullPath);
        } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
          yield fullPath;
        }
      }
    }

    let count = 0;
    for await (const filePath of walkDir(dirPath)) {
      if (count >= maxFiles) break;

      try {
        const ast = await this.parseFile(filePath);
        results.push(ast);
        count++;
      } catch (error) {
        console.warn(`Failed to parse ${filePath}:`, error);
      }
    }

    return results;
  }

  /**
   * Store AST in CouchDB
   */
  async storeInCouchDB(fileAST: FileAST): Promise<void> {
    try {
      await couchdb.put('codebase_graph', {
        _id: fileAST.id,
        type: 'file_ast',
        ...fileAST
      });
    } catch (error) {
      console.warn(`Failed to store AST for ${fileAST.file_path}:`, error);
    }
  }

  /**
   * Build dependency graph
   */
  buildDependencyGraph(fileASTs: FileAST[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();

    for (const ast of fileASTs) {
      const deps = ast.imports.map(imp => imp.source);
      graph.set(ast.file_path, deps);
    }

    return graph;
  }

  /**
   * Find circular dependencies
   */
  findCircularDependencies(fileASTs: FileAST[]): string[][] {
    const graph = this.buildDependencyGraph(fileASTs);
    const visited = new Set<string>();
    const stack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (node: string, path: string[]): void => {
      if (stack.has(node)) {
        const cycleStart = path.indexOf(node);
        cycles.push(path.slice(cycleStart));
        return;
      }

      if (visited.has(node)) return;

      visited.add(node);
      stack.add(node);
      path.push(node);

      const deps = graph.get(node) || [];
      for (const dep of deps) {
        dfs(dep, [...path]);
      }

      stack.delete(node);
    };

    for (const file of graph.keys()) {
      dfs(file, []);
    }

    return cycles;
  }
}

// Singleton instance
export const astParser = new UniversalASTParser();

// Convenience functions
export async function analyzeFile(filePath: string): Promise<FileAST> {
  return astParser.parseFile(filePath);
}

export async function analyzeDirectory(
  dirPath: string,
  options?: Parameters<UniversalASTParser['parseDirectory']>[1]
): Promise<FileAST[]> {
  return astParser.parseDirectory(dirPath, options);
}

export async function indexCodebaseInCouchDB(
  dirPath: string,
  options?: Parameters<UniversalASTParser['parseDirectory']>[1]
): Promise<{ indexed: number; failed: number }> {
  const asts = await astParser.parseDirectory(dirPath, options);
  let indexed = 0;
  let failed = 0;

  for (const ast of asts) {
    try {
      await astParser.storeInCouchDB(ast);
      indexed++;
    } catch {
      failed++;
    }
  }

  return { indexed: failed };
}
