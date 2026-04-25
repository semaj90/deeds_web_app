#!/usr/bin/env node
/**
 * AST Worker with Gemma3 Local LLM Integration
 * Autonomous code analysis, error detection, and repair suggestions
 * Uses: TypeScript AST + Gemma3:legal-latest + TensorRT-LLM + Gemma embeddings
 */
import { parentPort, workerData } from 'worker_threads';
import { readFileSync, createHash } from 'fs';
import { extname } from 'path';
import ts from 'typescript';

const { workerId, config } = workerData;

console.log(`🤖 AST Worker ${workerId} initializing...`);

class GemmaAgenticWorker {
  constructor() {
    this.workerId = workerId;
    this.config = config;
    this.gemmaClient = new GemmaLLMClient(config.OLLAMA_URL);
    this.processedFiles = 0;
    this.repairPatterns = new Map();

    // Initialize repair knowledge base
    this.initializeRepairPatterns();
  }

  initializeRepairPatterns() {
    // Common TypeScript error patterns and their fixes
    this.repairPatterns.set('TS1005', {
      description: 'Missing comma in object/array literal',
      patterns: [
        { regex: /(\w+:\s*[^,;]+)\s*;(\s*\w+:)/, replacement: '$1,$2' },
        { regex: /(\w+:\s*[^,;]+)(\s*\})/, replacement: '$1,$2' },
        { regex: /(\w+:\s*[^,;]+)\s*$/, replacement: '$1,' }
      ],
      confidence: 0.9
    });

    this.repairPatterns.set('TS2304', {
      description: 'Cannot find name',
      patterns: [
        { regex: /import\s+.*from\s+['"]\$lib\/([^'"]+)['"]/, replacement: "import ... from '$lib/$1/index.js'" }
      ],
      confidence: 0.7
    });

    this.repairPatterns.set('SVELTE_EXPORT_LET', {
      description: 'Convert Svelte 4 export let to Svelte 5 $state()',
      patterns: [
        { regex: /export\s+let\s+(\w+)\s*(?:=\s*([^;]+))?;?/, replacement: 'let $1 = $state($2 || undefined);' }
      ],
      confidence: 0.85
    });

    this.repairPatterns.set('SVELTE_REACTIVE', {
      description: 'Convert $: reactive statements to $derived()/$effect()',
      patterns: [
        { regex: /\$:\s*(\w+)\s*=\s*([^;]+);/, replacement: 'let $1 = $derived($2);' },
        { regex: /\$:\s*{([^}]+)}/, replacement: '$effect(() => {$1});' }
      ],
      confidence: 0.8
    });
  }

  async generateGemmaEmbedding(text) {
    try {
      const response = await this.gemmaClient.embed(text);
      return response.embedding || Array(this.config.EMBEDDING_DIMENSION).fill(0);
    } catch (error) {
      console.warn(`⚠️  Worker ${this.workerId}: Embedding failed`, error.message);
      return Array(this.config.EMBEDDING_DIMENSION).fill(0);
    }
  }

  async getGemmaRepairSuggestions(code, errors, filePath) {
    const prompt = this.buildRepairPrompt(code, errors, filePath);

    try {
      const response = await this.gemmaClient.generate(prompt);
      return this.parseRepairResponse(response, errors);
    } catch (error) {
      console.warn(`⚠️  Worker ${this.workerId}: Gemma3 repair failed`, error.message);
      return this.getFallbackRepairs(code, errors);
    }
  }

  buildRepairPrompt(code, errors, filePath) {
    const fileType = extname(filePath);
    const contextualInfo = fileType === '.svelte' ? 'This is a Svelte 5 component file.' : 'This is a TypeScript file.';

    return `You are an expert TypeScript/Svelte code repair assistant. Analyze this code and provide specific fixes.

${contextualInfo}

RULES FOR SVELTE 5:
- Use $state() instead of export let
- Use $derived() instead of $: reactive assignments
- Use $effect() instead of $: reactive blocks
- Use {#snippet} instead of <slot>

CODE TO REPAIR:
\`\`\`typescript
${code.slice(0, 2000)} // Truncated for context
\`\`\`

DETECTED ERRORS:
${errors.map(e => `- Line ${e.line}: ${e.type} - ${e.message}`).join('\n')}

Provide fixes in this JSON format:
{
  "repairs": [
    {
      "line": 15,
      "type": "TS1005",
      "description": "Add missing comma",
      "oldContent": "property: value;",
      "newContent": "property: value,",
      "confidence": 0.95
    }
  ],
  "explanation": "Brief explanation of changes"
}

Focus on:
1. High confidence fixes only
2. Preserve code functionality
3. Follow modern TypeScript/Svelte 5 patterns
4. Fix syntax errors first, then improvement suggestions`;
  }

  parseRepairResponse(response, originalErrors) {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.getFallbackRepairs('', originalErrors);
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (parsed.repairs && Array.isArray(parsed.repairs)) {
        return {
          repairs: parsed.repairs.filter(r => r.confidence > 0.6),
          explanation: parsed.explanation || 'Auto-generated repairs',
          llmGenerated: true
        };
      }
    } catch (error) {
      console.warn(`⚠️  Worker ${this.workerId}: Failed to parse Gemma response`, error.message);
    }

    return this.getFallbackRepairs('', originalErrors);
  }

  getFallbackRepairs(code, errors) {
    const repairs = [];

    for (const error of errors) {
      const pattern = this.repairPatterns.get(error.type);
      if (pattern) {
        for (const p of pattern.patterns) {
          const lines = code.split('\n');
          const lineIndex = error.line - 1;

          if (lineIndex >= 0 && lineIndex < lines.length) {
            const line = lines[lineIndex];
            const match = line.match(p.regex);

            if (match) {
              repairs.push({
                line: error.line,
                type: error.type,
                description: pattern.description,
                oldContent: line,
                newContent: line.replace(p.regex, p.replacement),
                confidence: pattern.confidence
              });
              break; // One repair per error
            }
          }
        }
      }
    }

    return {
      repairs,
      explanation: 'Pattern-based fallback repairs',
      llmGenerated: false
    };
  }

  analyzeTypeScriptAST(content, filePath) {
    const errors = [];

    try {
      // Parse TypeScript AST
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true
      );

      // Custom TypeScript error detection
      function visit(node) {
        // Detect TS1005 - Missing comma errors
        if (ts.isObjectLiteralExpression(node)) {
          node.properties.forEach((prop, index) => {
            if (index < node.properties.length - 1) {
              const nextProp = node.properties[index + 1];
              const propEnd = prop.getEnd();
              const nextStart = nextProp.getStart();
              const textBetween = content.slice(propEnd, nextStart);

              if (!textBetween.includes(',') && textBetween.includes(';')) {
                const line = sourceFile.getLineAndCharacterOfPosition(propEnd).line + 1;
                errors.push({
                  type: 'TS1005',
                  line,
                  message: "',' expected",
                  severity: 'error'
                });
              }
            }
          });
        }

        // Detect TS2304 - Cannot find name (imports)
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
          const importPath = node.moduleSpecifier.text;
          if (importPath.startsWith('$lib/') && !importPath.endsWith('.js') && !importPath.includes('/index')) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
            errors.push({
              type: 'TS2304',
              line,
              message: `Cannot resolve module '${importPath}'`,
              severity: 'error'
            });
          }
        }

        ts.forEachChild(node, visit);
      }

      visit(sourceFile);

      return { ast: sourceFile, errors: errors.slice(0, 10) }; // Limit to 10 errors
    } catch (error) {
      console.warn(`⚠️  Worker ${this.workerId}: AST parsing failed for ${filePath}`, error.message);
      return { ast: null, errors: [] };
    }
  }

  analyzeSvelteFile(content, filePath) {
    const errors = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNumber = index + 1;

      // Detect Svelte 4 patterns that need upgrading
      if (line.includes('export let')) {
        errors.push({
          type: 'SVELTE_EXPORT_LET',
          line: lineNumber,
          message: 'Use $state() instead of export let in Svelte 5',
          severity: 'warning'
        });
      }

      if (line.match(/\$:\s+\w+\s*=/)) {
        errors.push({
          type: 'SVELTE_REACTIVE',
          line: lineNumber,
          message: 'Use $derived() instead of $: reactive assignment in Svelte 5',
          severity: 'warning'
        });
      }

      if (line.includes('<slot>') || line.includes('$$slots')) {
        errors.push({
          type: 'SVELTE_SLOT',
          line: lineNumber,
          message: 'Use {#snippet} instead of <slot> in Svelte 5',
          severity: 'warning'
        });
      }

      // Check for missing commas in object literals within script tags
      if (line.includes(':') && line.includes(';') && !line.includes(',')) {
        const scriptTagMatch = content.slice(0, content.indexOf(line)).match(/<script[^>]*>/g);
        if (scriptTagMatch && scriptTagMatch.length > 0) {
          errors.push({
            type: 'TS1005',
            line: lineNumber,
            message: "Replace ';' with ',' in object literal",
            severity: 'error'
          });
        }
      }
    });

    return { errors: errors.slice(0, 10) };
  }

  async processFile(filePath) {
    try {
      const content = readFileSync(filePath, 'utf8');
      const contentHash = createHash('sha256').update(content).digest('hex').slice(0, 16);

      let analysisResult;

      if (extname(filePath) === '.svelte') {
        analysisResult = this.analyzeSvelteFile(content, filePath);
        // Also analyze script sections with TypeScript AST
        const scriptMatch = content.match(/<script[^>]*lang=["']ts["'][^>]*>([\s\S]*?)<\/script>/);
        if (scriptMatch) {
          const tsResult = this.analyzeTypeScriptAST(scriptMatch[1], filePath);
          analysisResult.errors = [...analysisResult.errors, ...tsResult.errors];
        }
      } else {
        analysisResult = this.analyzeTypeScriptAST(content, filePath);
      }

      const { errors } = analysisResult;

      // Generate embedding for the file
      const embedding = await this.generateGemmaEmbedding(
        `File: ${filePath}\n\nContent:\n${content.slice(0, 1000)}\n\nErrors: ${errors.map(e => e.message).join('; ')}`
      );

      // Send analysis result to controller
      parentPort.postMessage({
        type: 'ast_analyzed',
        workerId: this.workerId,
        filePath,
        ast: analysisResult.ast ? 'parsed' : null,
        errors,
        embedding,
        contentHash
      });

      // If errors found, get repair suggestions
      if (errors.length > 0) {
        const repairResult = await this.getGemmaRepairSuggestions(content, errors, filePath);

        const totalConfidence = repairResult.repairs.length > 0
          ? repairResult.repairs.reduce((sum, r) => sum + r.confidence, 0) / repairResult.repairs.length
          : 0;

        parentPort.postMessage({
          type: 'repair_suggested',
          workerId: this.workerId,
          filePath,
          repairs: repairResult.repairs,
          confidence: totalConfidence,
          explanation: repairResult.explanation,
          llmGenerated: repairResult.llmGenerated
        });
      }

      this.processedFiles++;

    } catch (error) {
      parentPort.postMessage({
        type: 'error',
        workerId: this.workerId,
        filePath,
        error: error.message
      });
    }
  }

  async processBatch(files) {
    console.log(`🤖 Worker ${this.workerId}: Processing ${files.length} files...`);

    for (const filePath of files) {
      await this.processFile(filePath);
    }

    parentPort.postMessage({
      type: 'batch_complete',
      workerId: this.workerId,
      processedCount: this.processedFiles
    });
  }
}

// Gemma3 LLM Client
class GemmaLLMClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.modelName = 'gemma3:legal-latest';
    this.embeddingModel = 'embeddinggemma:latest';
  }

  async generate(prompt) {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          prompt,
          stream: false,
          options: {
            temperature: 0.1, // Low temperature for code generation
            top_p: 0.9,
            num_ctx: 4096
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Gemma3 API error: ${response.status}`);
      }

      const data = await response.json();
      return data.response || '';
    } catch (error) {
      console.error(`❌ Worker ${workerId}: Gemma3 generation failed:`, error.message);
      throw error;
    }
  }

  async embed(text) {
    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.embeddingModel,
          prompt: text
        })
      });

      if (!response.ok) {
        throw new Error(`Gemma Embeddings API error: ${response.status}`);
      }

      const data = await response.json();
      return { embedding: data.embedding };
    } catch (error) {
      console.error(`❌ Worker ${workerId}: Gemma embeddings failed:`, error.message);
      throw error;
    }
  }
}

// --- WORKER MESSAGE HANDLING ---
const worker = new GemmaAgenticWorker();

parentPort.on('message', async (msg) => {
  switch (msg.type) {
    case 'process_batch':
      await worker.processBatch(msg.batch);
      break;
    case 'process_file':
      await worker.processFile(msg.filePath);
      break;
    default:
      console.warn(`⚠️  Worker ${workerId}: Unknown message type: ${msg.type}`);
  }
});

// Handle worker shutdown
process.on('SIGTERM', () => {
  console.log(`👋 Worker ${workerId} shutting down...`);
  process.exit(0);
});

console.log(`✅ AST Worker ${workerId} ready with Gemma3 integration`);

export { GemmaAgenticWorker, GemmaLLMClient };
    };
  }

  async processFiles(files) {
    const results = [];

    for (const file of files) {
      try {
        const result = await this.processFile(file);
        results.push(result);
      } catch (error) {
        results.push({
          file,
          error: error.message,
          ast: null
        });
      }
    }

    return results;
  }

  async processFile(file) {
    const content = await readFile(file, 'utf-8');
    const isSvelte = file.endsWith('.svelte');

    let codeToAnalyze = content;
    let templateContent = '';

    if (isSvelte) {
      codeToAnalyze = this.sveltePreprocessor.extractScript(content);
      templateContent = this.sveltePreprocessor.extractTemplate(content);
    }

    // Parse TypeScript AST
    const ast = this.parseTypeScript(codeToAnalyze, file);

    // Analyze Svelte 5 patterns if applicable
    const svelteAnalysis = isSvelte ? this.analyzeSveltePatterns(templateContent, ast) : null;

    return {
      file,
      ast,
      svelteAnalysis,
      issues: this.detectIssues(ast, svelteAnalysis),
      metrics: this.calculateMetrics(ast)
    };
  }

  parseTypeScript(code, filename) {
    try {
      return parse(code, {
        sourceType: 'module',
        ecmaVersion: 2022,
        ecmaFeatures: {
          jsx: false
        },
        loc: true,
        range: true
      });
    } catch (error) {
      // Return partial AST or error information
      return {
        type: 'ParseError',
        error: error.message,
        filename
      };
    }
  }

  analyzeSveltePatterns(template, ast) {
    const patterns = {
      // Detect old Svelte 4 patterns
      exportLet: this.findExportLetPatterns(ast),
      reactiveStatements: this.findReactiveStatements(ast),
      slots: this.findSlotUsage(template),

      // Detect Svelte 5 patterns
      runes: this.findRunePatterns(ast),
      snippets: this.findSnippetPatterns(template),
      props: this.findPropsPatterns(ast)
    };

    return patterns;
  }

  findExportLetPatterns(ast) {
    const exportLets = [];

    this.traverse(ast, (node) => {
      if (node.type === 'ExportNamedDeclaration' &&
          node.declaration?.type === 'VariableDeclaration') {

        for (const declarator of node.declaration.declarations) {
          exportLets.push({
            name: declarator.id.name,
            location: node.loc,
            needsMigration: true
          });
        }
      }
    });

    return exportLets;
  }

  findReactiveStatements(ast) {
    const reactiveStmts = [];

    this.traverse(ast, (node) => {
      if (node.type === 'LabeledStatement' &&
          node.label.name === '$') {

        reactiveStmts.push({
          statement: node.body,
          location: node.loc,
          needsMigration: true
        });
      }
    });

    return reactiveStmts;
  }

  findSlotUsage(template) {
    const slots = [];
    const slotRegex = /<slot[^>]*>/g;
    let match;

    while ((match = slotRegex.exec(template)) !== null) {
      slots.push({
        content: match[0],
        position: match.index,
        needsSnippetMigration: true
      });
    }

    return slots;
  }

  findRunePatterns(ast) {
    const runes = [];

    this.traverse(ast, (node) => {
      if (node.type === 'CallExpression' &&
          node.callee?.name?.startsWith('$')) {

        runes.push({
          rune: node.callee.name,
          location: node.loc,
          isValidSvelte5: ['$state', '$derived', '$effect', '$props'].includes(node.callee.name)
        });
      }
    });

    return runes;
  }

  findSnippetPatterns(template) {
    const snippets = [];
    const snippetRegex = /\{#snippet\s+(\w+)\([^)]*\)\}/g;
    let match;

    while ((match = snippetRegex.exec(template)) !== null) {
      snippets.push({
        name: match[1],
        content: match[0],
        position: match.index,
        isSvelte5: true
      });
    }

    return snippets;
  }

  findPropsPatterns(ast) {
    const props = [];

    this.traverse(ast, (node) => {
      if (node.type === 'VariableDeclaration') {
        for (const declarator of node.declarations) {
          if (declarator.init?.type === 'CallExpression' &&
              declarator.init.callee?.name === '$props') {

            props.push({
              name: declarator.id.name,
              location: node.loc,
              isSvelte5: true
            });
          }
        }
      }
    });

    return props;
  }

  traverse(node, callback) {
    if (!node || typeof node !== 'object') return;

    callback(node);

    for (const key in node) {
      if (key === 'parent') continue; // Avoid infinite recursion

      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(item => {
          if (item && typeof item === 'object') {
            item.parent = node;
            this.traverse(item, callback);
          }
        });
      } else if (child && typeof child === 'object') {
        child.parent = node;
        this.traverse(child, callback);
      }
    }
  }

  detectIssues(ast, svelteAnalysis) {
    const issues = [];

    // TypeScript syntax issues
    if (ast.type === 'ParseError') {
      issues.push({
        type: 'syntax_error',
        message: ast.error,
        severity: 'error'
      });
    }

    // Svelte migration issues
    if (svelteAnalysis) {
      if (svelteAnalysis.exportLet.length > 0) {
        issues.push({
          type: 'svelte4_export_let',
          count: svelteAnalysis.exportLet.length,
          items: svelteAnalysis.exportLet,
          severity: 'warning',
          fix: 'migrate_to_props'
        });
      }

      if (svelteAnalysis.reactiveStatements.length > 0) {
        issues.push({
          type: 'svelte4_reactive_statements',
          count: svelteAnalysis.reactiveStatements.length,
          items: svelteAnalysis.reactiveStatements,
          severity: 'warning',
          fix: 'migrate_to_derived'
        });
      }

      if (svelteAnalysis.slots.length > 0) {
        issues.push({
          type: 'svelte4_slots',
          count: svelteAnalysis.slots.length,
          items: svelteAnalysis.slots,
          severity: 'info',
          fix: 'migrate_to_snippets'
        });
      }
    }

    return issues;
  }

  calculateMetrics(ast) {
    let nodeCount = 0;
    let complexity = 1;

    this.traverse(ast, (node) => {
      nodeCount++;

      // Calculate cyclomatic complexity
      if (['IfStatement', 'WhileStatement', 'ForStatement',
           'ConditionalExpression', 'LogicalExpression'].includes(node.type)) {
        complexity++;
      }
    });

    return {
      nodeCount,
      complexity,
      size: JSON.stringify(ast).length
    };
  }
}

// Worker main execution
const processor = new ParallelASTProcessor();
const { files, batchIndex } = workerData;

console.log(`🔄 Worker ${batchIndex}: Processing ${files.length} files`);

processor.processFiles(files)
  .then(results => {
    console.log(`✅ Worker ${batchIndex}: Completed`);
    parentPort.postMessage(results);
  })
  .catch(error => {
    console.error(`❌ Worker ${batchIndex}: Error:`, error);
    parentPort.postMessage({ error: error.message });
  });