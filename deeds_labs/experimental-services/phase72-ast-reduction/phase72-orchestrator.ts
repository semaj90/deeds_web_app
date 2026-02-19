#!/usr/bin/env node

/**
 * Phase 72: AST Error Reduction Orchestrator
 * Main script to run the complete self-healing pipeline
 */

import { ASTErrorReductionPipeline } from './ast-error-reduction-pipeline.ts';
import { Neo4jErrorGraphService } from './neo4j-error-graph-service.ts';
import { AIPatchGenerationService } from './ai-patch-generation-service.ts';
import { GPUClusteringService } from './gpu-clustering-service.ts';
import { Ollama } from 'ollama';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

interface Phase72Config {
  neo4j: {
    uri: string;
    user: string;
    password: string;
  };
  ollama: {
    url: string;
  };
  qdrant: {
    url: string;
  };
  redis: {
    url: string;
  };
  svelteFrontend: {
    path: string;
  };
  maxIterations: number;
  minImprovement: number;
}

class Phase72Orchestrator {
  private config: Phase72Config;
  private pipeline: ASTErrorReductionPipeline;
  private neo4j: Neo4jErrorGraphService;
  private ai: AIPatchGenerationService;
  private clustering: GPUClusteringService;

  constructor(config: Phase72Config) {
    this.config = config;
    this.pipeline = new ASTErrorReductionPipeline({
      neo4jUrl: config.neo4j.uri,
      ollamaUrl: config.ollama.url,
      qdrantUrl: config.qdrant.url,
      redisUrl: config.redis.url
    });

    this.neo4j = new Neo4jErrorGraphService(
      config.neo4j.uri,
      config.neo4j.user,
      config.neo4j.password
    );

    this.ai = new AIPatchGenerationService(config.ollama.url);
    this.clustering = new GPUClusteringService();
  }

  async initialize(): Promise<void> {
    console.log('🚀 Phase 72: Initializing AST Error Reduction System\n');

    // Initialize Neo4j schema
    await this.neo4j.initializeSchema();

    // Check Ollama connectivity
    await this.checkOllamaConnection();

    // Check GPU clustering
    await this.checkGPUClustering();

    console.log('✅ All services initialized\n');
  }

  async runFullPipeline(): Promise<void> {
    console.log('🔄 Starting Phase 72 Self-Healing Pipeline\n');

    const startTime = Date.now();
    let iteration = 0;
    let previousErrorCount = Infinity;

    while (iteration < this.config.maxIterations) {
      console.log(`\n🔄 Iteration ${iteration + 1}/${this.config.maxIterations}`);
      console.log('=' .repeat(50));

      try {
        // Phase 1: Extract and embed errors
        console.log('\n📊 Phase 1: Error Extraction & Embedding');
        const errors = await this.pipeline.extractAndEmbedErrors();
        const currentErrorCount = errors.length;

        console.log(`📈 Current error count: ${currentErrorCount}`);

        // Check improvement threshold
        if (currentErrorCount >= previousErrorCount * (1 - this.config.minImprovement)) {
          console.log(`🎯 Error reduction stabilized (${((1 - currentErrorCount/previousErrorCount) * 100).toFixed(1)}% improvement)`);
          break;
        }

        // Phase 2: Build error graph
        console.log('\n🕸️ Phase 2: Building Error Relationship Graph');
        await this.pipeline.buildErrorGraph(errors);

        // Phase 3: Cluster errors
        console.log('\n🎯 Phase 3: GPU-Accelerated Error Clustering');
        const clusters = await this.pipeline.clusterErrors();

        // Phase 4: Generate AI patches
        console.log('\n🤖 Phase 4: AI Patch Generation');
        const patches = await this.pipeline.generateAIPatches(clusters);

        // Phase 5: Apply patches with validation
        console.log('\n🔧 Phase 5: Applying Patches with Validation');
        const results = await this.pipeline.applyPatchesWithValidation(patches);

        const successfulPatches = results.filter(r => r.validationPassed).length;
        console.log(`✅ Applied ${successfulPatches}/${results.length} patches successfully`);

        // Update tracking
        previousErrorCount = currentErrorCount;
        iteration++;

        // Save progress
        await this.saveProgress(iteration, currentErrorCount, successfulPatches, previousErrorCount);

      } catch (error) {
        console.error(`❌ Iteration ${iteration + 1} failed:`, error);
        iteration++;
        continue;
      }
    }

    const totalTime = (Date.now() - startTime) / 1000;
    console.log(`\n🎉 Pipeline completed in ${totalTime.toFixed(1)}s`);
    console.log(`📊 Final error count: ${await this.getCurrentErrorCount()}`);
  }

  private async checkOllamaConnection(): Promise<void> {
    try {
      const ollama = new Ollama({ host: this.config.ollama.url });
      const models = await ollama.list();
      const hasGemma3 = models.models.some(m => m.name.includes('gemma3-legal'));

      if (!hasGemma3) {
        console.warn('⚠️ gemma3-legal model not found in Ollama');
        console.warn('Run: ollama pull gemma3-legal:latest');
      } else {
        console.log('✅ Ollama connection OK (gemma3-legal available)');
      }
    } catch (error) {
      console.error('❌ Ollama connection failed:', error);
      throw error;
    }
  }

  private async checkGPUClustering(): Promise<void> {
    try {
      const stats = await this.clustering.getClusteringStats();
      console.log(`✅ GPU Clustering: ${stats.cudaAvailable ? 'CUDA enabled' : 'CPU fallback'}`);
      if (stats.cudaAvailable) {
        console.log(`💾 GPU Memory: ${(stats.gpuMemory / 1024**3).toFixed(1)}GB`);
      }
    } catch (error) {
      console.warn('⚠️ GPU clustering check failed');
    }
  }

  private async getCurrentErrorCount(): Promise<number> {
    try {
      const output = execSync('cd sveltekit-frontend && npm run check 2>&1 | grep -c "error"', {
        encoding: 'utf8',
        cwd: this.config.svelteFrontend.path
      });
      return parseInt(output.trim()) || 0;
    } catch {
      return 0;
    }
  }

  private async saveProgress(iteration: number, errorCount: number, successfulPatches: number, previousErrorCount: number): Promise<void> {
    const progress = {
      timestamp: new Date().toISOString(),
      iteration,
      errorCount,
      successfulPatches,
      improvement: previousErrorCount - errorCount
    };

    const progressFile = path.join(__dirname, 'phase72-progress.json');
    let history = [];

    if (fs.existsSync(progressFile)) {
      history = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
    }

    history.push(progress);
    fs.writeFileSync(progressFile, JSON.stringify(history, null, 2));
  }

  async getProgressReport(): Promise<void> {
    const progressFile = path.join(__dirname, 'phase72-progress.json');

    if (!fs.existsSync(progressFile)) {
      console.log('📊 No progress data available');
      return;
    }

    const history = JSON.parse(fs.readFileSync(progressFile, 'utf8'));

    console.log('📊 Phase 72 Progress Report');
    console.log('=' .repeat(40));

    history.forEach((entry: any, i: number) => {
      console.log(`Iteration ${entry.iteration}:`);
      console.log(`  Errors: ${entry.errorCount}`);
      console.log(`  Successful patches: ${entry.successfulPatches}`);
      console.log(`  Improvement: ${entry.improvement}`);
      console.log(`  Time: ${entry.timestamp}`);
      console.log();
    });

    const final = history[history.length - 1];
    const initial = history[0];
    const totalImprovement = initial.errorCount - final.errorCount;
    const improvementPercent = ((totalImprovement / initial.errorCount) * 100).toFixed(1);

    console.log(`🎯 Total Results:`);
    console.log(`  Initial errors: ${initial.errorCount}`);
    console.log(`  Final errors: ${final.errorCount}`);
    console.log(`  Total improvement: ${totalImprovement} (${improvementPercent}%)`);
  }

  async cleanup(): Promise<void> {
    await this.neo4j.close();
    console.log('🧹 Cleanup completed');
  }
}

// Default configuration
const defaultConfig: Phase72Config = {
  neo4j: {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    user: process.env.NEO4J_USER || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password'
  },
  ollama: {
    url: process.env.OLLAMA_URL || 'http://localhost:11434'
  },
  qdrant: {
    url: process.env.QDRANT_URL || 'http://localhost:6333'
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  },
  svelteFrontend: {
    path: process.env.SVELTE_FRONTEND_PATH || '../sveltekit-frontend'
  },
  maxIterations: parseInt(process.env.PHASE72_MAX_ITERATIONS || '10'),
  minImprovement: parseFloat(process.env.PHASE72_MIN_IMPROVEMENT || '0.05')
};

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'run';

  const orchestrator = new Phase72Orchestrator(defaultConfig);

  try {
    switch (command) {
      case 'init':
        await orchestrator.initialize();
        break;

      case 'run':
        await orchestrator.initialize();
        await orchestrator.runFullPipeline();
        break;

      case 'progress':
        await orchestrator.getProgressReport();
        break;

      case 'test':
        console.log('🧪 Testing Phase 72 components...');
        await orchestrator.initialize();
        console.log('✅ All components initialized successfully');
        break;

      default:
        console.log('Usage: phase72-orchestrator.js [init|run|progress|test]');
        console.log('  init    - Initialize services and check connectivity');
        console.log('  run     - Run the complete self-healing pipeline');
        console.log('  progress- Show progress report');
        console.log('  test    - Test component initialization');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Phase 72 failed:', error);
    process.exit(1);
  } finally {
    await orchestrator.cleanup();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { Phase72Orchestrator, Phase72Config };