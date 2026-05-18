#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const rootDir = process.cwd();

async function runPipeline() {
  console.log('🚀 Initiating Unified Consecutive Agentic Docs Pipeline...');
  const tStart = performance.now();

  const steps = [
    {
      name: 'Markdown Normalization',
      script: 'scripts/docs-atlas/normalize-doc-markdown.mjs'
    },
    {
      name: 'Semantic Paragraph Chunking',
      script: 'scripts/docs-atlas/chunk-programming-docs.mjs'
    },
    {
      name: 'Master llms.txt Context Index Compilation',
      script: 'scripts/docs-atlas/build-llms-txt.mjs'
    },
    {
      name: 'Autoencoding SOM Topological Manifold Clustering',
      script: 'scripts/docs-atlas/autoencode-som-clustering.mjs'
    },
    {
      name: 'TurboVec Query Latency & VRAM Telemetry Benchmark',
      script: 'scripts/docs-atlas/turbovec-benchmark-sidecar.mjs'
    },
    {
      name: 'Qdrant Vector Indexing',
      script: 'scripts/docs-atlas/index-programming-docs-qdrant.mjs',
      args: ['--write']
    },
    {
      name: 'Neo4j Graph Projection',
      script: 'scripts/docs-atlas/project-programming-docs-neo4j.mjs',
      args: ['--write']
    },
    {
      name: 'Comparative Gap Analysis',
      script: 'scripts/docs-atlas/compare-external-docs-to-features.mjs'
    }
  ];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    console.log(`\n======================================================`);
    console.log(` [Step ${i + 1}/${steps.length}] Running: ${step.name}`);
    console.log(`======================================================`);
    
    const t0 = performance.now();
    try {
      const argsStr = step.args ? ' ' + step.args.join(' ') : '';
      execSync(`node ${resolve(rootDir, step.script)}${argsStr}`, {
        stdio: 'inherit',
        env: { ...process.env, FORCE_COLOR: '1' }
      });
      const duration = (performance.now() - t0) / 1000;
      console.log(`✅ Completed: ${step.name} in ${duration.toFixed(2)} seconds.`);
    } catch (error) {
      console.error(`❌ Failed: ${step.name} during pipeline execution.`);
      process.exit(1);
    }
  }

  const totalDuration = (performance.now() - tStart) / 1000;
  console.log(`\n======================================================`);
  console.log(`🎉 Pipeline completed successfully in ${totalDuration.toFixed(2)} seconds!`);
  console.log(`======================================================`);
}

runPipeline().catch(console.error);
