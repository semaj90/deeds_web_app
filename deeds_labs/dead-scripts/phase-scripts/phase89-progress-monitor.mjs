#!/usr/bin/env node
/**
 * Phase 89: Progress Monitor
 * Context7 MCP Pattern - Real-time monitoring of indexing progress across all workers
 */

import chalk from 'chalk';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const PROGRESS_KEY = 'phase89:indexing:progress';
const MONITOR_INTERVAL = parseInt(process.env.MONITOR_INTERVAL || '5000');

const redis = new Redis(REDIS_URL);

/**
 * Clear console and move cursor to top
 */
function clearScreen() {
  process.stdout.write('\x1B[2J\x1B[0f');
}

/**
 * Display progress for all workers
 */
async function displayProgress() {
  clearScreen();

  console.log(chalk.cyan.bold('═'.repeat(80)));
  console.log(chalk.cyan.bold('📊 Phase 89: Indexing Progress Monitor (Context7 MCP)'));
  console.log(chalk.cyan.bold('═'.repeat(80)));
  console.log('');

  try {
    // Get all worker progress
    const workerData = await redis.hgetall(PROGRESS_KEY);

    if (Object.keys(workerData).length === 0) {
      console.log(chalk.yellow('⏳ No workers active yet...'));
      console.log('');
      return;
    }

    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;
    let maxTotal = 0;

    // Parse and aggregate
    const workers = Object.entries(workerData).map(([workerId, data]) => {
      const progress = JSON.parse(data);
      totalProcessed += progress.processed;
      totalSuccess += progress.success;
      totalFailed += progress.failed;
      if (progress.total > maxTotal) maxTotal = progress.total;
      return { workerId, ...progress };
    });

    // Sort by workerId
    workers.sort((a, b) => a.workerId.localeCompare(b.workerId));

    // Display per-worker stats
    console.log(chalk.yellow.bold('Worker Statistics:'));
    console.log(chalk.gray('─'.repeat(80)));
    console.log(
      chalk.gray('Worker ID'.padEnd(15)) +
      chalk.gray('Processed'.padEnd(12)) +
      chalk.gray('Success'.padEnd(12)) +
      chalk.gray('Failed'.padEnd(12)) +
      chalk.gray('Progress'.padEnd(12)) +
      chalk.gray('Last Update')
    );
    console.log(chalk.gray('─'.repeat(80)));

    for (const worker of workers) {
      const progressBar = createProgressBar(worker.percentage, 20);
      const timestamp = new Date(worker.timestamp).toLocaleTimeString();

      console.log(
        worker.workerId.padEnd(15) +
        String(worker.processed).padEnd(12) +
        chalk.green(String(worker.success).padEnd(12)) +
        chalk.red(String(worker.failed).padEnd(12)) +
        progressBar.padEnd(25) +
        chalk.gray(timestamp)
      );
    }

    console.log('');
    console.log(chalk.cyan.bold('Overall Statistics:'));
    console.log(chalk.gray('─'.repeat(80)));

    const overallPercentage = maxTotal > 0 ? Math.round((totalProcessed / maxTotal) * 100) : 0;
    const overallProgressBar = createProgressBar(overallPercentage, 40);

    console.log(chalk.white.bold('Total Processed: ') + chalk.yellow(totalProcessed));
    console.log(chalk.white.bold('Total Success:   ') + chalk.green(totalSuccess));
    console.log(chalk.white.bold('Total Failed:    ') + chalk.red(totalFailed));
    console.log(chalk.white.bold('Active Workers:  ') + chalk.cyan(workers.length));
    console.log('');
    console.log(chalk.white.bold('Overall Progress:'));
    console.log(overallProgressBar + ' ' + chalk.yellow(`${overallPercentage}%`));

    // Performance metrics
    const elapsed = workers.reduce((max, w) => {
      const workerElapsed = new Date() - new Date(w.timestamp);
      return Math.max(max, workerElapsed);
    }, 0);

    const filesPerSecond = elapsed > 0 ? (totalProcessed / (elapsed / 1000)).toFixed(2) : '0.00';

    console.log('');
    console.log(chalk.white.bold('Performance:     ') + chalk.cyan(`${filesPerSecond} files/sec`));

    // ETA calculation
    if (overallPercentage > 0 && overallPercentage < 100) {
      const remaining = maxTotal - totalProcessed;
      const eta = remaining / parseFloat(filesPerSecond);
      const etaMinutes = Math.round(eta / 60);
      console.log(chalk.white.bold('ETA:             ') + chalk.magenta(`~${etaMinutes} minutes`));
    }

  } catch (error) {
    console.error(chalk.red('❌ Error fetching progress:'), error.message);
  }

  console.log('');
  console.log(chalk.gray('─'.repeat(80)));
  console.log(chalk.gray(`Last updated: ${new Date().toLocaleString()}`));
  console.log(chalk.gray('Press Ctrl+C to exit'));
}

/**
 * Create ASCII progress bar
 */
function createProgressBar(percentage, width) {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;

  let bar = '[';
  bar += chalk.green('█'.repeat(filled));
  bar += chalk.gray('░'.repeat(empty));
  bar += ']';

  return bar;
}

/**
 * Start monitoring loop
 */
async function monitor() {
  console.log(chalk.cyan.bold('🚀 Starting Progress Monitor...'));
  console.log('');

  // Initial display
  await displayProgress();

  // Update every MONITOR_INTERVAL ms
  setInterval(async () => {
    await displayProgress();
  }, MONITOR_INTERVAL);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  clearScreen();
  console.log(chalk.yellow('\n⏹️  Monitor shutting down gracefully...'));
  await redis.quit();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  clearScreen();
  console.log(chalk.yellow('\n⏹️  Monitor shutting down gracefully...'));
  await redis.quit();
  process.exit(0);
});

// Start monitor
monitor().catch(error => {
  console.error(chalk.red('💥 Monitor fatal error:'), error);
  process.exit(1);
});
