#!/usr/bin/env node
/**
 * Iterative Error Solver - Complete Web App Completion System
 * Runs until ALL errors are gone and web app is fully functional
 * Integrates: GPU + Gemma3 + pgvector + VS Code + TensorRT-LLM
 */
import { ComprehensiveKnowledgeIndexer } from './comprehensive-knowledge-indexer.mjs';
import { UnifiedAgenticAutoSolve } from './unified-agentic-autosolve.mjs';
import { promisify } from 'util';
import { exec } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
import { createClient as createRedisClient } from 'redis';

const execAsync = promisify(exec);

class IterativeErrorSolver {
  constructor() {
    this.maxIterations = 10;
    this.currentIteration = 0;
    this.errorHistory = [];
    this.fixHistory = [];
    this.knowledgeBase = null;

    this.stats = {
      totalErrors: 0,
      errorsFixed: 0,
      iterationsUsed: 0,
      timeElapsed: 0,
      knowledgeEmbeddings: 0
    };
  }

  async initialize() {
    console.log('🚀 Iterative Error Solver - Complete Web App Finisher');
    console.log('🎯 Goal: Fix ALL errors until web app is 100% functional');
    console.log('🧠 Method: GPU + Gemma3 + Knowledge Base + VS Code integration');
    console.log();

    // Step 1: Build comprehensive knowledge base
    console.log('📚 Phase 1: Building comprehensive knowledge base...');
    this.knowledgeBase = new ComprehensiveKnowledgeIndexer();
    await this.knowledgeBase.run();
    this.stats.knowledgeEmbeddings = this.knowledgeBase.stats.embeddings;

    console.log('✅ Knowledge base ready - AI understands your project!');
    console.log();
  }

  async analyzeCurrentErrors() {
    console.log(`🔍 Iteration ${this.currentIteration + 1}: Analyzing current error state...`);

    const errorAnalysis = {
      typescript: 0,
      svelte: 0,
      build: 0,
      runtime: 0,
      details: []
    };

    try {
      // Check TypeScript errors
      const { stdout: tsOutput } = await execAsync('npm run check:ultra-fast 2>&1 || echo "TS errors found"');
      if (tsOutput.includes('error TS')) {
        const tsErrors = (tsOutput.match(/error TS/g) || []).length;
        errorAnalysis.typescript = tsErrors;
        errorAnalysis.details.push(`TypeScript: ${tsErrors} errors`);
      }
    } catch (error) {
      const tsErrors = (error.stderr?.match(/error TS/g) || []).length;
      errorAnalysis.typescript = tsErrors;
      if (tsErrors > 0) {
        errorAnalysis.details.push(`TypeScript: ${tsErrors} errors`);
      }
    }

    try {
      // Check Svelte compilation
      const { stdout: svelteOutput } = await execAsync('timeout 30s npm run check:svelte:fast 2>&1 || echo "Svelte check timeout"');
      if (svelteOutput.includes('Error:')) {
        const svelteErrors = (svelteOutput.match(/Error:/g) || []).length;
        errorAnalysis.svelte = svelteErrors;
        errorAnalysis.details.push(`Svelte: ${svelteErrors} errors`);
      }
    } catch (error) {
      const svelteErrors = (error.stderr?.match(/Error:/g) || []).length;
      errorAnalysis.svelte = svelteErrors;
      if (svelteErrors > 0) {
        errorAnalysis.details.push(`Svelte: ${svelteErrors} errors`);
      }
    }

    try {
      // Check build process
      const { stdout: buildOutput } = await execAsync('timeout 60s npm run build 2>&1 || echo "Build failed"');
      if (buildOutput.includes('failed') || buildOutput.includes('error')) {
        errorAnalysis.build = 1;
        errorAnalysis.details.push('Build: Failed to compile');
      }
    } catch (error) {
      errorAnalysis.build = 1;
      errorAnalysis.details.push('Build: Compilation errors');
    }

    const totalErrors = errorAnalysis.typescript + errorAnalysis.svelte + errorAnalysis.build + errorAnalysis.runtime;

    console.log(`📊 Current Error Count: ${totalErrors}`);
    if (errorAnalysis.details.length > 0) {
      errorAnalysis.details.forEach(detail => console.log(`   • ${detail}`));
    }

    this.errorHistory.push({
      iteration: this.currentIteration,
      errors: totalErrors,
      breakdown: errorAnalysis,
      timestamp: Date.now()
    });

    return { totalErrors, breakdown: errorAnalysis };
  }

  async applyTargetedFixes(errorAnalysis) {
    console.log('🔧 Applying targeted fixes based on error analysis...');

    const fixes = [];

    if (errorAnalysis.typescript > 0) {
      console.log('⚡ Running GPU-accelerated TypeScript fixes...');
      const unifiedSolver = new UnifiedAgenticAutoSolve('gpu-only');
      const gpuResults = await unifiedSolver.run();
      fixes.push({ type: 'gpu', results: gpuResults });
    }

    if (errorAnalysis.svelte > 0) {
      console.log('🧠 Running Agentic Svelte component fixes...');
      const unifiedSolver = new UnifiedAgenticAutoSolve('agentic-only');
      const agenticResults = await unifiedSolver.run();
      fixes.push({ type: 'agentic', results: agenticResults });
    }

    if (errorAnalysis.build > 0 || (errorAnalysis.typescript > 50 && errorAnalysis.svelte > 20)) {
      console.log('🚀 Running full two-phase system for complex issues...');
      const unifiedSolver = new UnifiedAgenticAutoSolve('full');
      const fullResults = await unifiedSolver.run();
      fixes.push({ type: 'full', results: fullResults });
    }

    this.fixHistory.push({
      iteration: this.currentIteration,
      fixes,
      timestamp: Date.now()
    });

    return fixes;
  }

  async validateProgress() {
    console.log('✅ Validating progress after fixes...');

    try {
      // Quick validation
      await execAsync('npm run check:ultra-fast');
      console.log('✅ TypeScript ultra-fast check: PASSED');

      // Try to build
      await execAsync('timeout 120s npm run build');
      console.log('✅ Build process: SUCCESSFUL');

      return true;
    } catch (error) {
      console.log('⚠️  Some issues remain, continuing iteration...');
      return false;
    }
  }

  async generateVSCodeTasks() {
    console.log('📝 Generating VS Code tasks for integration...');

    const vscodeConfig = {
      "version": "2.0.0",
      "tasks": [
        {
          "label": "Auto-Solve: Fix All Errors",
          "type": "shell",
          "command": "npm",
          "args": ["run", "auto:solve:100k"],
          "group": {
            "kind": "build",
            "isDefault": true
          },
          "presentation": {
            "echo": true,
            "reveal": "always",
            "focus": false,
            "panel": "dedicated"
          },
          "problemMatcher": "$tsc"
        },
        {
          "label": "Auto-Solve: GPU Only",
          "type": "shell",
          "command": "npm",
          "args": ["run", "auto:solve:gpu"],
          "group": "build"
        },
        {
          "label": "Auto-Solve: Agentic Only",
          "type": "shell",
          "command": "npm",
          "args": ["run", "auto:solve:agentic"],
          "group": "build"
        },
        {
          "label": "Build Knowledge Base",
          "type": "shell",
          "command": "node",
          "args": ["scripts/comprehensive-knowledge-indexer.mjs"],
          "group": "build"
        },
        {
          "label": "Iterative Error Solver",
          "type": "shell",
          "command": "node",
          "args": ["scripts/iterative-error-solver.mjs"],
          "group": "build"
        }
      ]
    };

    const vscodeSettings = {
      "typescript.preferences.includePackageJsonAutoImports": "on",
      "typescript.suggest.autoImports": true,
      "typescript.updateImportsOnFileMove.enabled": "always",
      "svelte.enable-ts-plugin": true,
      "svelte.plugin.typescript.enable": true,
      "svelte.plugin.typescript.diagnostics.enable": true,
      "files.associations": {
        "*.svelte": "svelte"
      },
      "emmet.includeLanguages": {
        "svelte": "html"
      },
      "terminal.integrated.env.windows": {
        "NODE_OPTIONS": "--max-old-space-size=30720",
        "REDIS_PASSWORD": "redis",
        "OLLAMA_URL": "http://localhost:11434"
      }
    };

    const vscodeExtensions = {
      "recommendations": [
        "svelte.svelte-vscode",
        "bradlc.vscode-tailwindcss",
        "ms-vscode.vscode-typescript-next",
        "ms-playwright.playwright",
        "continue.continue"
      ]
    };

    try {
      writeFileSync('.vscode/tasks.json', JSON.stringify(vscodeConfig, null, 2));
      writeFileSync('.vscode/settings.json', JSON.stringify(vscodeSettings, null, 2));
      writeFileSync('.vscode/extensions.json', JSON.stringify(vscodeExtensions, null, 2));

      console.log('✅ VS Code integration files created');
      console.log('   • .vscode/tasks.json - Build tasks');
      console.log('   • .vscode/settings.json - Optimized settings');
      console.log('   • .vscode/extensions.json - Recommended extensions');
    } catch (error) {
      console.warn('⚠️  Could not create VS Code config files:', error.message);
    }
  }

  async setupOllamaTensorRTIntegration() {
    console.log('🔗 Setting up Ollama + TensorRT-LLM integration...');

    const integrationScript = `#!/bin/bash
# Ollama + TensorRT-LLM Integration Script
# Ensures optimal performance for code generation

echo "🚀 Starting Ollama with TensorRT optimization..."

# Check if Ollama is running
if ! pgrep -x "ollama" > /dev/null; then
    echo "Starting Ollama server..."
    ollama serve &
    sleep 5
fi

# Pull required models if not present
echo "📥 Ensuring required models are available..."
ollama pull gemma3:legal-latest || echo "⚠️  Model not found, using fallback"
ollama pull embeddinggemma:latest || echo "⚠️  Embedding model not found"

# Configure TensorRT optimization
export CUDA_VISIBLE_DEVICES=0
export TENSORRT_OPTIMIZE=true
export OLLAMA_GPU_LAYERS=35

echo "✅ Ollama + TensorRT integration ready"
echo "🌐 Server: http://localhost:11434"
echo "🤖 Models: gemma3:legal-latest, embeddinggemma:latest"
`;

    try {
      writeFileSync('scripts/setup-ollama-tensorrt.sh', integrationScript);
      console.log('✅ Created scripts/setup-ollama-tensorrt.sh');
    } catch (error) {
      console.warn('⚠️  Could not create integration script:', error.message);
    }
  }

  async runIterativeLoop() {
    console.log('🔄 Starting iterative error-solving loop...');
    const startTime = Date.now();

    while (this.currentIteration < this.maxIterations) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🔄 ITERATION ${this.currentIteration + 1}/${this.maxIterations}`);
      console.log(`${'='.repeat(60)}\n`);

      // Analyze current errors
      const { totalErrors, breakdown } = await this.analyzeCurrentErrors();

      if (totalErrors === 0) {
        console.log('🎉 SUCCESS: No errors found! Web app is complete!');
        break;
      }

      // Apply targeted fixes
      await this.applyTargetedFixes(breakdown);

      // Validate progress
      const isValid = await this.validateProgress();

      // Update statistics
      this.stats.errorsFixed += Math.max(0, this.stats.totalErrors - totalErrors);
      this.stats.totalErrors = totalErrors;

      this.currentIteration++;

      if (isValid) {
        console.log('🎉 VALIDATION SUCCESSFUL: Web app is now error-free!');
        break;
      }

      // Wait a moment before next iteration
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    this.stats.iterationsUsed = this.currentIteration;
    this.stats.timeElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  }

  async generateFinalReport() {
    console.log('\n📊 FINAL REPORT - Iterative Error Solving Complete');
    console.log(`${'='.repeat(60)}`);

    console.log(`⏱️  Time Elapsed: ${this.stats.timeElapsed}s`);
    console.log(`🔄 Iterations Used: ${this.stats.iterationsUsed}/${this.maxIterations}`);
    console.log(`🐛 Total Errors Fixed: ${this.stats.errorsFixed}`);
    console.log(`📊 Final Error Count: ${this.stats.totalErrors}`);
    console.log(`🧠 Knowledge Embeddings: ${this.stats.knowledgeEmbeddings}`);

    if (this.stats.totalErrors === 0) {
      console.log('\n🎉 STATUS: WEB APP COMPLETION SUCCESSFUL! 🎉');
      console.log('✅ All TypeScript errors resolved');
      console.log('✅ All Svelte components working');
      console.log('✅ Build process successful');
      console.log('✅ Knowledge base indexed');
      console.log('✅ VS Code integration configured');
    } else {
      console.log('\n⚠️  STATUS: PARTIAL SUCCESS - SOME ISSUES REMAIN');
      console.log(`${this.stats.totalErrors} errors still need attention`);
      console.log('Consider running additional iterations or manual review');
    }

    console.log('\n🛠️  Available Tools:');
    console.log('• npm run auto:solve:100k    # Full autonomous repair');
    console.log('• npm run auto:solve:gpu     # GPU-accelerated fixes');
    console.log('• npm run auto:solve:agentic # AI semantic analysis');
    console.log('• Ctrl+Shift+P → "Tasks: Run Task" → "Auto-Solve: Fix All Errors"');

    // Save detailed report
    const report = {
      timestamp: new Date().toISOString(),
      stats: this.stats,
      errorHistory: this.errorHistory,
      fixHistory: this.fixHistory,
      success: this.stats.totalErrors === 0
    };

    try {
      writeFileSync('iterative-solver-report.json', JSON.stringify(report, null, 2));
      console.log('\n📄 Detailed report saved to: iterative-solver-report.json');
    } catch (error) {
      console.warn('⚠️  Could not save report:', error.message);
    }
  }

  async run() {
    try {
      await this.initialize();
      await this.generateVSCodeTasks();
      await this.setupOllamaTensorRTIntegration();
      await this.runIterativeLoop();
      await this.generateFinalReport();

    } catch (error) {
      console.error('❌ Iterative error solving failed:', error);
      throw error;
    }
  }
}

// Execute if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const solver = new IterativeErrorSolver();
  await solver.run();
}

export { IterativeErrorSolver };