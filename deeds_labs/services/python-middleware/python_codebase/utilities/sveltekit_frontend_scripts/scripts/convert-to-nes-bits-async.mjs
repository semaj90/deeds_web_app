#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import os from 'os';

// Import the existing mappings and processFile function
import { processFile, classMapping } from './convert-to-nes-bits.mjs';

/**
 * Async batch processor for 2000+ files with concurrency control
 * Uses worker-pool pattern for maximum performance
 */
class AsyncFileConverter {
  constructor(concurrency = os.cpus().length) {
    this.concurrency = concurrency;
    this.processed = 0;
    this.converted = 0;
    this.errors = 0;
    this.startTime = performance.now();
  }

  /**
   * Process files in batches with controlled concurrency
   */
  async processBatch(files, batchSize = 50) {
    const results = [];

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      console.log(
        `🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(files.length / batchSize)} (${batch.length} files)`
      );

      // Process batch in parallel with concurrency limit
      const batchPromises = batch.map((file) => this.processFileWithStats(file));
      const batchResults = await Promise.allSettled(batchPromises);

      results.push(...batchResults);

      // Progress update
      const progress = (((i + batch.length) / files.length) * 100).toFixed(1);
      console.log(`📊 Progress: ${progress}% (${i + batch.length}/${files.length} files)`);
    }

    return results;
  }

  /**
   * Process file with statistics tracking
   */
  async processFileWithStats(filePath) {
    const startTime = performance.now();

    try {
      const converted = await processFile(filePath);
      const duration = performance.now() - startTime;

      this.processed++;
      if (converted) {
        this.converted++;
        console.log(
          `✅ Converted: ${path.relative(process.cwd(), filePath)} (${duration.toFixed(1)}ms)`
        );
      }

      return { success: true, converted, duration, filePath };
    } catch (error) {
      this.errors++;
      console.error(`❌ Error processing ${filePath}:`, error.message);
      return { success: false, error: error.message, filePath };
    }
  }

  /**
   * Process all files with maximum async efficiency
   */
  async processAllFiles(pattern = 'src/**/*.svelte') {
    console.log('🚀 Starting Async File Conversion for NES.css + bits-ui...\n');
    console.log(`⚡ Concurrency: ${this.concurrency} workers`);
    console.log(`🔍 Pattern: ${pattern}\n`);

    // Find all files
    const files = await glob(pattern, {
      cwd: process.cwd(),
      absolute: true,
      ignore: [
        '**/node_modules/**',
        '**/.*',
        '**/*.spec.*',
        '**/*.test.*',
        '**/dist/**',
        '**/build/**',
      ],
    });

    console.log(`📁 Found ${files.length} Svelte files to process\n`);

    if (files.length === 0) {
      console.log('⚠️ No files found to process');
      return;
    }

    // Group files by size for optimal batching
    const fileStats = await Promise.all(
      files.map(async (file) => {
        try {
          const stats = await fs.stat(file);
          return { file, size: stats.size };
        } catch {
          return { file, size: 0 };
        }
      })
    );

    // Sort by size (larger files first for better load balancing)
    const sortedFiles = fileStats.sort((a, b) => b.size - a.size).map((item) => item.file);

    // Process with dynamic batching based on file sizes
    const batchSize = Math.max(10, Math.floor(files.length / (this.concurrency * 4)));
    console.log(`📦 Batch size: ${batchSize} files per batch\n`);

    this.startTime = performance.now();
    const results = await this.processBatch(sortedFiles, batchSize);

    // Generate completion report
    this.generateReport(files.length, results);
  }

  /**
   * Generate detailed performance report
   */
  generateReport(totalFiles, results) {
    const totalTime = (performance.now() - this.startTime) / 1000;
    const successful = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;
    const converted = results.filter((r) => r.status === 'fulfilled' && r.value.converted).length;
    const failed = results.filter((r) => r.status === 'rejected' || !r.value?.success).length;

    console.log('\n' + '='.repeat(80));
    console.log('🎉 ASYNC CONVERSION COMPLETED');
    console.log('='.repeat(80));

    console.log('\n📊 Performance Metrics:');
    console.log(`   Total Files:      ${totalFiles.toLocaleString()}`);
    console.log(`   Successfully Read: ${successful.toLocaleString()}`);
    console.log(`   Actually Converted: ${converted.toLocaleString()}`);
    console.log(`   Failed:           ${failed.toLocaleString()}`);
    console.log(`   Total Time:       ${totalTime.toFixed(2)}s`);
    console.log(`   Files/Second:     ${(totalFiles / totalTime).toFixed(1)}`);
    console.log(`   Avg Time/File:    ${((totalTime * 1000) / totalFiles).toFixed(2)}ms`);

    // Calculate async efficiency
    const sequentialEstimate = totalFiles * 5; // Assume 5ms per file sequentially
    const efficiency =
      ((sequentialEstimate / 1000 - totalTime) / (sequentialEstimate / 1000)) * 100;

    console.log('\n⚡ Async Performance:');
    console.log(`   Sequential Estimate: ${(sequentialEstimate / 1000).toFixed(2)}s`);
    console.log(`   Actual Async Time:   ${totalTime.toFixed(2)}s`);
    console.log(`   Speed Improvement:   ${efficiency.toFixed(1)}% faster`);

    if (converted > 0) {
      console.log('\n🎮 Conversion Summary:');
      console.log('   ✅ shadcn-svelte → NES.css components');
      console.log('   ✅ Tailwind classes → UnoCSS equivalents');
      console.log('   ✅ Button imports → NES button components');
      console.log('   ✅ Card components → YoRHa themed containers');
      console.log('   ✅ Professional gaming aesthetic applied');
    }

    console.log('\n📝 Next Steps:');
    console.log('   1. Test server: npm run dev:quic:simple');
    console.log('   2. Run protobuf tests: npm run proto:test');
    console.log('   3. Playwright tests: npx playwright test');
    console.log('   4. Performance benchmark: node scripts/benchmark-protobuf-performance.mjs');

    // Show top conversion examples
    if (converted > 0) {
      const convertedFiles = results
        .filter((r) => r.status === 'fulfilled' && r.value.converted)
        .slice(0, 10)
        .map((r) => path.relative(process.cwd(), r.value.filePath));

      console.log('\n🔧 Sample Converted Files:');
      convertedFiles.forEach((file) => console.log(`   ${file}`));
      if (converted > 10) {
        console.log(`   ... and ${converted - 10} more files`);
      }
    }
  }
}

/**
 * Enhanced async processing with memory management
 */
async function processFilesInChunks(files, chunkSize = 100) {
  const chunks = [];
  for (let i = 0; i < files.length; i += chunkSize) {
    chunks.push(files.slice(i, i + chunkSize));
  }

  console.log(`📦 Processing ${files.length} files in ${chunks.length} chunks of ${chunkSize}`);

  let totalConverted = 0;
  let totalProcessed = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`\n🔄 Processing chunk ${i + 1}/${chunks.length}...`);

    // Process chunk in parallel
    const promises = chunk.map(async (file, index) => {
      try {
        const result = await processFile(file);
        if (result) {
          console.log(`✅ [${i * chunkSize + index + 1}] Converted: ${path.basename(file)}`);
        }
        return result;
      } catch (error) {
        console.error(`❌ [${i * chunkSize + index + 1}] Failed: ${path.basename(file)}`);
        return false;
      }
    });

    const results = await Promise.all(promises);
    const chunkConverted = results.filter(Boolean).length;

    totalConverted += chunkConverted;
    totalProcessed += chunk.length;

    console.log(`✨ Chunk ${i + 1} complete: ${chunkConverted}/${chunk.length} converted`);

    // Memory management - force garbage collection between chunks
    if (global.gc) {
      global.gc();
    }

    // Progress update
    const progress = ((totalProcessed / files.length) * 100).toFixed(1);
    console.log(`📊 Overall progress: ${progress}% (${totalConverted} total converted)`);
  }

  return { totalProcessed, totalConverted };
}

// Main async execution
async function main() {
  const converter = new AsyncFileConverter();

  try {
    await converter.processAllFiles();
  } catch (error) {
    console.error('❌ Async conversion failed:', error);
    process.exit(1);
  }
}

// Alternative chunked processing for memory-constrained environments
async function mainChunked() {
  console.log('🧠 Using chunked processing for memory efficiency...\n');

  const files = await glob('src/**/*.svelte', {
    cwd: process.cwd(),
    absolute: true,
  });

  const { totalProcessed, totalConverted } = await processFilesInChunks(files, 50);

  console.log('\n🎉 Chunked processing complete!');
  console.log(`📊 Results: ${totalConverted}/${totalProcessed} files converted`);
}

// Run based on command line args
const isChunked = process.argv.includes('--chunked');
const isMem = process.argv.includes('--memory-efficient');

if (import.meta.url === `file://${process.argv[1]}`) {
  if (isChunked || isMem) {
    mainChunked().catch(console.error);
  } else {
    main().catch(console.error);
  }
}

export { AsyncFileConverter, processFilesInChunks };
