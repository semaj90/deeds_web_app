#!/usr/bin/env node
/**
 * Unified Agentic Auto-Solve System
 * Combines GPU acceleration + Gemma3 LLM + pgvector semantic analysis
 * Full autonomous TypeScript/Svelte error detection and repair
 */
import { AgenticCodeRepairController } from './controller.mjs';
import { GPUAutoSolveSystem } from './gpu-autosolve-integrated.mjs';
import { createClient as createRedisClient } from 'redis';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

class UnifiedAgenticAutoSolve {
  constructor(mode = 'full') {
    this.mode = mode; // 'full', 'gpu-only', 'agentic-only', 'analyze'
    this.stats = {
      phase1GPUFixes: 0,
      phase2AgenticFixes: 0,
      totalErrorsResolved: 0,
      embeddingsGenerated: 0,
      duration: 0
    };
  }

  async initialize() {
    console.log('🚀 Unified Agentic Auto-Solve System Initializing...');
    console.log(`🎯 Mode: ${this.mode.toUpperCase()}`);
    console.log(`🤖 Gemma3 + GPU + pgvector + Redis integration`);

    // Test all connections
    await this.testConnections();
  }

  async testConnections() {
    console.log('🔍 Testing system connections...');

    // Test Redis
    try {
      const redis = createRedisClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        password: process.env.REDIS_PASSWORD || 'redis'
      });
      await redis.connect();
      console.log('✅ Redis connected');
      await redis.disconnect();
    } catch (error) {
      console.log('⚠️  Redis not available, using memory cache');
    }

    // Test Ollama/Gemma3
    try {
      // Prefer project-configured endpoint if available
      let base = process.env.OLLAMA_URL || process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';

      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getOllamaBaseUrl } = require('../src/lib/utils/ollama-endpoint');
        if (getOllamaBaseUrl && typeof getOllamaBaseUrl === 'function') {
          base = getOllamaBaseUrl();
        }
      } catch (e) {
        // best-effort only
      }

      const response = await fetch(`${base}/api/tags`);
      const models = await response.json();

      const hasGemma = models.models?.some(m => m.name.includes('gemma3'));
      const hasEmbeddings = models.models?.some(m => m.name.includes('embeddinggemma'));

      console.log(`✅ Ollama connected: Gemma3=${hasGemma}, Embeddings=${hasEmbeddings}`);
    } catch (error) {
      console.log('⚠️  Ollama not available, using fallback patterns');
    }

    // Test PostgreSQL
    try {
      await execAsync('npm run check:ultra-fast');
      console.log('✅ TypeScript compilation working');
    } catch (error) {
      console.log('⚠️  TypeScript has errors - this is what we\'ll fix!');
    }
  }

  async runPhase1_GPUAccelerated() {
    console.log('\n🔥 Phase 1: GPU-Accelerated Syntax Fixing');
    console.log('⚡ Using RTX 3060 Ti + 30GB RAM + 32 workers for parallel processing');

    const gpuSolver = new GPUAutoSolveSystem('syntax-format-check');

    try {
      const results = await gpuSolver.run();

      this.stats.phase1GPUFixes = results.syntaxFixes + results.formatChanges;

      console.log(`✅ Phase 1 Complete: ${this.stats.phase1GPUFixes} GPU fixes applied`);
      return results;
    } catch (error) {
      console.warn('⚠️  Phase 1 GPU fixing failed:', error.message);
      return { syntaxFixes: 0, formatChanges: 0 };
    }
  }

  async runPhase2_AgenticRepair() {
    console.log('\n🤖 Phase 2: Agentic Repair with Gemma3 LLM');
    console.log('🧠 Semantic analysis + pgvector similarity + autonomous repair');

    const agenticController = new AgenticCodeRepairController('apply');

    try {
      await agenticController.run();

      this.stats.phase2AgenticFixes = agenticController.stats.repairsApplied;
      this.stats.embeddingsGenerated = agenticController.stats.embeddingsGenerated;

      console.log(`✅ Phase 2 Complete: ${this.stats.phase2AgenticFixes} agentic repairs applied`);
      console.log(`📊 Embeddings: ${this.stats.embeddingsGenerated} code patterns indexed`);

    } catch (error) {
      console.warn('⚠️  Phase 2 agentic repair failed:', error.message);
    }
  }

  async runAnalysisOnly() {
    console.log('\n📊 Analysis Mode: Error Detection + Semantic Indexing');

    // Run GPU analysis
    const gpuSolver = new GPUAutoSolveSystem('analyze-only');
    await gpuSolver.run();

    // Run agentic analysis
    const agenticController = new AgenticCodeRepairController('dry');
    await agenticController.run();

    console.log('✅ Analysis complete - no changes applied');
  }

  async validateResults() {
    console.log('\n🔍 Validating repair results...');

    try {
      const { stdout } = await execAsync('npm run check:ultra-fast 2>&1');
      console.log('✅ TypeScript validation passed!');
      return true;
    } catch (error) {
      const remainingErrors = (error.stderr?.match(/error TS/g) || []).length;
      console.log(`📊 Remaining errors: ${remainingErrors}`);

      if (remainingErrors < 10) {
        console.log('Errors:', error.stderr);
      }

      return remainingErrors === 0;
    }
  }

  async run() {
    const startTime = Date.now();

    try {
      await this.initialize();

      switch (this.mode) {
        case 'full':
          // Two-phase autonomous repair
          await this.runPhase1_GPUAccelerated();
          await this.runPhase2_AgenticRepair();
          break;

        case 'gpu-only':
          await this.runPhase1_GPUAccelerated();
          break;

        case 'agentic-only':
          await this.runPhase2_AgenticRepair();
          break;

        case 'analyze':
          await this.runAnalysisOnly();
          break;

        default:
          throw new Error(`Unknown mode: ${this.mode}`);
      }

      // Validate results
      const isValid = await this.validateResults();

      this.stats.duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.stats.totalErrorsResolved = this.stats.phase1GPUFixes + this.stats.phase2AgenticFixes;

      // Final summary
      console.log('\n🎉 Unified Agentic Auto-Solve Complete!');
      console.log('📊 Final Statistics:');
      console.log(`   • Phase 1 (GPU): ${this.stats.phase1GPUFixes} fixes`);
      console.log(`   • Phase 2 (Agentic): ${this.stats.phase2AgenticFixes} fixes`);
      console.log(`   • Total fixes: ${this.stats.totalErrorsResolved}`);
      console.log(`   • Embeddings: ${this.stats.embeddingsGenerated} indexed`);
      console.log(`   • Duration: ${this.stats.duration}s`);
      console.log(`   • Validation: ${isValid ? 'PASSED ✅' : 'NEEDS MORE WORK ⚠️'}`);

      if (isValid) {
        console.log('\n🚀 Your legal AI platform is error-free and optimized!');
      } else {
        console.log('\n🔄 Some complex errors remain - consider running in loop mode');
      }

    } catch (error) {
      console.error('❌ Unified auto-solve failed:', error);
      throw error;
    }
  }
}

// CLI execution
async function main() {
  const mode = process.argv[2] || 'full';

  if (!['full', 'gpu-only', 'agentic-only', 'analyze'].includes(mode)) {
    console.error('❌ Invalid mode. Use: full, gpu-only, agentic-only, or analyze');
    process.exit(1);
  }

  const unifiedSolver = new UnifiedAgenticAutoSolve(mode);

  try {
    await unifiedSolver.run();
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Execute if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { UnifiedAgenticAutoSolve };