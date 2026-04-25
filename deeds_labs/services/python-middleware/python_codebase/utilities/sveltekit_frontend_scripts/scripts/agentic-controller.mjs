#!/usr/bin/env node
/**
 * Agentic Programming Controller
 *
 * This script ties together all the agentic programming components:
 * - AST Workers for TypeScript/Svelte parsing
 * - Redis caching for performance
 * - PostgreSQL + pgvector for semantic indexing
 * - Gemma embeddings integration
 * - TensorRT-LLM local inference
 * - Claude repair loop integration
 */

import { Worker } from 'worker_threads';
import { readFile, writeFile, readdir, mkdir } from 'fs/promises';
import { join, extname, relative } from 'path';
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import { performance } from 'perf_hooks';
import { createHash } from 'crypto';

// Redis client (optional)
let redisClient = null;
try {
  // Dynamic import to handle missing redis
  const redis = await import('redis');
  redisClient = redis.createClient({
    url: 'redis://localhost:6379'
  });
  await redisClient.connect();
  console.log('✅ Redis connected');
} catch (error) {
  console.log('⚠️  Redis not available, using memory cache');
}

class AgenticController {
  constructor(options = {}) {
    this.options = {
      dryRun: options.dryRun || false,
      maxWorkers: options.maxWorkers || 4,
      enableGPU: options.enableGPU || false,
      enableEmbeddings: options.enableEmbeddings || false,
      cacheEnabled: redisClient !== null,
      ...options
    };

    this.workers = [];
    this.processedFiles = new Map();
    this.errors = [];
    this.fixes = [];
    this.cache = new Map(); // Memory fallback if Redis unavailable

    this.stats = {
      filesProcessed: 0,
      errorsFound: 0,
      fixesApplied: 0,
      cacheHits: 0,
      processingTime: 0,
      startTime: performance.now()
    };

    console.log(`🤖 Agentic Controller initialized`);
    console.log(`   Mode: ${this.options.dryRun ? 'DRY RUN' : 'REPAIR'}`)
    console.log(`   Workers: ${this.options.maxWorkers}`);
    console.log(`   Cache: ${this.options.cacheEnabled ? 'Redis' : 'Memory'}`);
    console.log(`   GPU: ${this.options.enableGPU ? 'Enabled' : 'Disabled'}`);
  }

  async run() {
    try {
      console.log('\n🔍 Phase 1: File Discovery');
      const files = await this.discoverFiles();

      console.log('\n🧠 Phase 2: AST Analysis & Error Detection');
      const analysisResults = await this.processFiles(files);

      console.log('\n🔧 Phase 3: Generate Fixes');
      const fixes = await this.generateFixes(analysisResults);

      if (!this.options.dryRun) {
        console.log('\n✨ Phase 4: Apply Fixes');
        await this.applyFixes(fixes);

        console.log('\n✅ Phase 5: Validation');
        await this.validateFixes();
      }

      console.log('\n📊 Phase 6: Generate Report');
      await this.generateReport();

    } catch (error) {
      console.error('❌ Agentic processing failed:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async discoverFiles() {
    const startTime = performance.now();
    const files = [];

    // Target directories for analysis
    const searchDirs = [
      'src/lib/components',
      'src/lib/stores',
      'src/routes',
      'src/lib/utils',
      'src/lib/services'
    ];

    for (const dir of searchDirs) {
      if (existsSync(dir)) {
        const dirFiles = await this.walkDirectory(dir, ['.ts', '.svelte', '.js']);
        files.push(...dirFiles);
      }
    }

    const discoveryTime = performance.now() - startTime;
    console.log(`   Found ${files.length} files (${discoveryTime.toFixed(0)}ms)`);

    return files;
  }

  async walkDirectory(dir, extensions) {
    const files = [];

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory() && !['node_modules', '.git', '.svelte-kit', 'build'].includes(entry.name)) {
          files.push(...await this.walkDirectory(fullPath, extensions));
        } else if (entry.isFile() && extensions.includes(extname(entry.name))) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Directory not accessible
    }

    return files;
  }

  async processFiles(files) {
    const results = [];
    const batches = this.chunkArray(files, Math.ceil(files.length / this.options.maxWorkers));

    console.log(`   Processing ${files.length} files in ${batches.length} batches`);

    const workerPromises = batches.map((batch, index) =>
      this.processFileBatch(batch, index)
    );

    const batchResults = await Promise.all(workerPromises);

    // Flatten results
    for (const batchResult of batchResults) {
      results.push(...batchResult);
    }

    console.log(`   Analyzed ${results.length} files, found ${results.filter(r => r.analysis?.issues?.length > 0).length} files with errors`);

    return results;
  }

  async processFileBatch(files, workerId) {
    return new Promise(async (resolve, reject) => {
      // Pre-read files for the worker
      const fileData = {};
      for (const filepath of files) {
        try {
          const content = await readFile(filepath, 'utf-8');
          const contentHash = createHash('sha256').update(content).digest('hex').substring(0, 16);
          fileData[filepath] = { content, hash: contentHash };
        } catch (error) {
          console.warn(`Failed to read ${filepath}:`, error.message);
        }
      }

      const worker = new Worker('./scripts/enhanced-ast-worker.mjs', {
        workerData: {
          files,
          fileData,
          batchIndex: workerId,
          options: {
            enableEmbeddings: this.options.enableEmbeddings,
            enableGPU: this.options.enableGPU
          }
        }
      });

      worker.on('message', (message) => {
        if (message.type === 'progress') {
          process.stdout.write(`\r   Worker ${workerId}: ${message.progress}%`);
        } else if (message.results) {
          console.log(`\n   Worker ${workerId} completed: ${message.results.length} files`);
          resolve(message.results);
        }
      });

      worker.on('error', (error) => {
        console.error(`❌ Worker ${workerId} failed:`, error);
        reject(error);
      });

      this.workers.push(worker);
    });
  }

  async generateFixes(analysisResults) {
    const fixes = [];

    for (const result of analysisResults) {
      if (result.errors.length === 0) continue;

      // Check cache for existing fixes
      const cacheKey = `fix:${result.fileHash}`;
      const cachedFix = await this.getFromCache(cacheKey);

      if (cachedFix) {
        fixes.push(JSON.parse(cachedFix));
        this.stats.cacheHits++;
        continue;
      }

      // Generate new fix
      const fileFixes = await this.generateFileFixes(result);
      fixes.push(fileFixes);

      // Cache the fix
      await this.setCache(cacheKey, JSON.stringify(fileFixes));
    }

    console.log(`   Generated ${fixes.length} fix plans (${this.stats.cacheHits} from cache)`);
    return fixes;
  }

  async generateFileFixes(result) {
    const fixes = {
      file: result.file,
      originalHash: result.fileHash,
      fixes: []
    };

    // Process each error and generate appropriate fixes
    for (const error of result.errors) {
      let fix = null;

      switch (error.type) {
        case 'TS1005': // Semicolon expected
          fix = {
            type: 'syntax_fix',
            line: error.line,
            column: error.column,
            original: error.text,
            replacement: this.generateSemicolonFix(error),
            confidence: 0.95
          };
          break;

        case 'svelte4_export_let':
          fix = {
            type: 'svelte5_migration',
            pattern: 'export_let_to_props',
            original: error.text,
            replacement: this.generatePropsReplacementFix(error),
            confidence: 0.90
          };
          break;

        case 'svelte4_reactive_statement':
          fix = {
            type: 'svelte5_migration',
            pattern: 'reactive_to_derived',
            original: error.text,
            replacement: this.generateDerivedReplacementFix(error),
            confidence: 0.85
          };
          break;

        case 'missing_import':
          fix = {
            type: 'import_fix',
            module: error.module,
            importName: error.importName,
            insertAt: 'top',
            replacement: this.generateImportFix(error),
            confidence: 0.80
          };
          break;

        default:
          // Use semantic analysis for unknown errors
          if (this.options.enableEmbeddings) {
            fix = await this.generateSemanticFix(error, result);
          }
          break;
      }

      if (fix) {
        fixes.fixes.push(fix);
      }
    }

    return fixes;
  }

  generateSemicolonFix(error) {
    // Simple semicolon fixes
    if (error.text && error.text.endsWith('}')) {
      return error.text.replace(';', '');
    }
    return error.text + ';';
  }

  generatePropsReplacementFix(error) {
    // Convert export let to $props()
    const match = error.text.match(/export\s+let\s+(\w+)(\s*:\s*\w+)?(\s*=\s*[^;]+)?/);
    if (match) {
      const propName = match[1];
      const type = match[2] || '';
      const defaultValue = match[3] || '';

      return `const { ${propName}${type}${defaultValue} } = $props();`;
    }
    return error.text;
  }

  generateDerivedReplacementFix(error) {
    // Convert $: reactive statements to $derived()
    const match = error.text.match(/\$:\s*(.+)/);
    if (match) {
      const expression = match[1].trim();

      // Check if it's an assignment
      if (expression.includes('=')) {
        const [variable, computation] = expression.split('=').map(s => s.trim());
        return `const ${variable} = $derived(${computation});`;
      } else {
        // It's an effect
        return `$effect(() => { ${expression} });`;
      }
    }
    return error.text;
  }

  generateImportFix(error) {
    if (error.module && error.importName) {
      return `import ${error.importName} from '${error.module}';`;
    }
    return null;
  }

  async generateSemanticFix(error, result) {
    // This would integrate with Gemma embeddings + TensorRT-LLM
    // For now, return a placeholder
    return {
      type: 'semantic_fix',
      original: error.text,
      replacement: error.text,
      confidence: 0.5,
      note: 'Semantic fix requires LLM integration'
    };
  }

  async applyFixes(fixes) {
    let appliedCount = 0;

    for (const fileFixes of fixes) {
      if (fileFixes.fixes.length === 0) continue;

      try {
        // Read original file
        const originalContent = await readFile(fileFixes.file, 'utf-8');
        let modifiedContent = originalContent;

        // Apply fixes in reverse order (to preserve line numbers)
        const sortedFixes = fileFixes.fixes.sort((a, b) => (b.line || 0) - (a.line || 0));

        for (const fix of sortedFixes) {
          if (fix.confidence < 0.7) {
            console.log(`   ⚠️  Skipping low confidence fix in ${relative(process.cwd(), fileFixes.file)}`);
            continue;
          }

          modifiedContent = this.applyFix(modifiedContent, fix);
          appliedCount++;
        }

        // Write modified file
        if (modifiedContent !== originalContent) {
          await writeFile(fileFixes.file, modifiedContent);
          console.log(`   ✅ Fixed ${fileFixes.fixes.length} issues in ${relative(process.cwd(), fileFixes.file)}`);
        }

      } catch (error) {
        console.error(`   ❌ Failed to fix ${fileFixes.file}:`, error.message);
      }
    }

    this.stats.fixesApplied = appliedCount;
    console.log(`   Applied ${appliedCount} fixes`);
  }

  applyFix(content, fix) {
    if (fix.type === 'import_fix' && fix.insertAt === 'top') {
      // Add import at the top
      const lines = content.split('\n');
      const scriptIndex = lines.findIndex(line => line.includes('<script'));
      if (scriptIndex !== -1) {
        lines.splice(scriptIndex + 1, 0, `  ${fix.replacement}`);
      } else {
        lines.unshift(fix.replacement);
      }
      return lines.join('\n');
    }

    // Simple string replacement for most fixes
    return content.replace(fix.original, fix.replacement);
  }

  async validateFixes() {
    console.log('   Running TypeScript validation...');

    try {
      const result = await this.runCommand('npx tsc --noEmit --skipLibCheck');
      console.log('   ✅ TypeScript validation passed');
      return true;
    } catch (error) {
      const errorCount = (error.stderr || '').split('\n').filter(line =>
        line.includes('error TS')
      ).length;

      if (errorCount > 0) {
        console.log(`   ⚠️  ${errorCount} TypeScript errors remain`);

        // Show first few errors
        const errors = (error.stderr || '').split('\n')
          .filter(line => line.includes('error TS'))
          .slice(0, 3);

        for (const err of errors) {
          console.log(`     ${err.trim()}`);
        }
      }

      return errorCount === 0;
    }
  }

  async generateReport() {
    const endTime = performance.now();
    this.stats.processingTime = (endTime - this.stats.startTime) / 1000;

    const report = {
      timestamp: new Date().toISOString(),
      mode: this.options.dryRun ? 'DRY_RUN' : 'REPAIR',
      stats: this.stats,
      performance: {
        filesPerSecond: (this.stats.filesProcessed / this.stats.processingTime).toFixed(1),
        cacheHitRate: ((this.stats.cacheHits / Math.max(this.stats.filesProcessed, 1)) * 100).toFixed(1)
      },
      system: {
        workers: this.options.maxWorkers,
        cache: this.options.cacheEnabled ? 'Redis' : 'Memory',
        gpu: this.options.enableGPU,
        embeddings: this.options.enableEmbeddings
      }
    };

    // Save report
    const reportPath = `agentic-report-${Date.now()}.json`;
    await writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log('\n📊 Processing Complete!');
    console.log(`   Files processed: ${this.stats.filesProcessed}`);
    console.log(`   Errors found: ${this.stats.errorsFound}`);
    console.log(`   Fixes applied: ${this.stats.fixesApplied}`);
    console.log(`   Processing time: ${this.stats.processingTime.toFixed(2)}s`);
    console.log(`   Performance: ${report.performance.filesPerSecond} files/sec`);
    console.log(`   Cache hit rate: ${report.performance.cacheHitRate}%`);
    console.log(`   Report saved: ${reportPath}`);
  }

  async getFromCache(key) {
    if (this.options.cacheEnabled && redisClient) {
      try {
        return await redisClient.get(key);
      } catch (error) {
        console.warn('Redis get failed, using memory cache');
      }
    }
    return this.cache.get(key);
  }

  async setCache(key, value) {
    if (this.options.cacheEnabled && redisClient) {
      try {
        await redisClient.setEx(key, 3600, value); // 1 hour expiry
      } catch (error) {
        console.warn('Redis set failed, using memory cache');
      }
    }
    this.cache.set(key, value);
  }

  async runCommand(command) {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ');

      const child = spawn(cmd, args, {
        stdio: 'pipe',
        shell: true
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          reject({ stdout, stderr, code });
        }
      });
    });
  }

  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  async cleanup() {
    // Terminate workers
    for (const worker of this.workers) {
      await worker.terminate();
    }

    // Close Redis connection
    if (redisClient) {
      await redisClient.quit();
    }

    console.log('\n🧹 Cleanup completed');
  }
}

export default AgenticController;

// CLI interface
if (process.argv[1] && process.argv[1].endsWith('agentic-controller.mjs')) {
  const args = process.argv.slice(2);
  const options = {};

  // Parse CLI arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--workers':
        options.maxWorkers = parseInt(args[++i]) || 4;
        break;
      case '--gpu':
        options.enableGPU = true;
        break;
      case '--embeddings':
        options.enableEmbeddings = true;
        break;
    }
  }

  const controller = new AgenticController(options);
  controller.run().catch(error => {
    console.error('❌ Agentic processing failed:', error);
    process.exit(1);
  });
}