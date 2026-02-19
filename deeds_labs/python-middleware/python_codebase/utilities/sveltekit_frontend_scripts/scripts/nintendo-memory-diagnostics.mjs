#!/usr/bin/env node
/**
 * Nintendo Memory Manager Diagnostics
 * Monitors Redis usage and detects memory budget violations
 */

import { Redis } from 'ioredis';
import chalk from 'chalk';
import { performance } from 'perf_hooks';

// Nintendo-style memory constraints
const MEMORY_LIMITS = {
  L3_REDIS_BUDGET: 1 * 1024 * 1024, // 1MB of 8GB Redis
  REDIS_MAX_MEMORY: 8 * 1024 * 1024 * 1024, // 8GB total Redis
  WARNING_THRESHOLD: 0.8, // 80% usage warning
  CRITICAL_THRESHOLD: 0.95, // 95% usage critical
};

class NintendoMemoryDiagnostics {
  constructor() {
    this.redis = new Redis({
      host: '127.0.0.1',
      port: 6379,
      db: 0,
      retryDelayOnFailure: 1000,
      maxRetriesPerRequest: 3,
    });

    this.stats = {
      redisErrors: 0,
      memoryViolations: 0,
      budgetExceeded: 0,
      successfulChecks: 0,
    };
  }

  /**
   * Run comprehensive diagnostics
   */
  async runDiagnostics() {
    console.log(chalk.cyan('🎮 Nintendo Memory Manager Diagnostics\n'));

    try {
      await this.testRedisConnection();
      await this.checkMemoryUsage();
      await this.analyzeMemoryPatterns();
      await this.testCacheHierarchy();
      await this.identifyMemoryLeaks();
      await this.generateReport();
    } catch (error) {
      console.error(chalk.red('❌ Diagnostics failed:'), error.message);
      this.stats.redisErrors++;
    } finally {
      await this.redis.quit();
    }
  }

  /**
   * Test Redis connection and basic operations
   */
  async testRedisConnection() {
    console.log(chalk.blue('📡 Testing Redis Connection...'));

    try {
      const start = performance.now();
      const pong = await this.redis.ping();
      const latency = performance.now() - start;

      if (pong === 'PONG') {
        console.log(chalk.green(`✅ Redis connected (${latency.toFixed(2)}ms)`));
        this.stats.successfulChecks++;
      } else {
        throw new Error('Invalid ping response');
      }
    } catch (error) {
      console.log(chalk.red('❌ Redis connection failed:'), error.message);
      this.stats.redisErrors++;
      throw error;
    }
  }

  /**
   * Check current memory usage against Nintendo-style budgets
   */
  async checkMemoryUsage() {
    console.log(chalk.blue('🧠 Analyzing Memory Usage...'));

    try {
      const memInfo = await this.getMemoryInfo();

      // Check total Redis memory
      const usedMemory = memInfo.used_memory || 0;
      const maxMemory = memInfo.maxmemory || MEMORY_LIMITS.REDIS_MAX_MEMORY;
      const usagePercent = (usedMemory / maxMemory) * 100;

      console.log(
        `📊 Redis Memory: ${this.formatBytes(usedMemory)} / ${this.formatBytes(maxMemory)} (${usagePercent.toFixed(1)}%)`
      );

      // Check against Nintendo budget
      const budgetUsage = (usedMemory / MEMORY_LIMITS.L3_REDIS_BUDGET) * 100;

      if (usedMemory > MEMORY_LIMITS.L3_REDIS_BUDGET) {
        console.log(
          chalk.red(`🚨 NINTENDO BUDGET EXCEEDED: ${budgetUsage.toFixed(1)}% of 1MB budget`)
        );
        this.stats.budgetExceeded++;
      } else if (budgetUsage > 80) {
        console.log(
          chalk.yellow(`⚠️  Nintendo budget warning: ${budgetUsage.toFixed(1)}% of 1MB budget`)
        );
      } else {
        console.log(chalk.green(`✅ Nintendo budget OK: ${budgetUsage.toFixed(1)}% of 1MB budget`));
      }

      // Memory fragmentation
      const fragRatio = memInfo.mem_fragmentation_ratio || 1;
      if (fragRatio > 1.5) {
        console.log(chalk.yellow(`⚠️  High memory fragmentation: ${fragRatio.toFixed(2)}`));
      }

      this.stats.successfulChecks++;
    } catch (error) {
      console.log(chalk.red('❌ Memory analysis failed:'), error.message);
      this.stats.redisErrors++;
    }
  }

  /**
   * Analyze memory usage patterns
   */
  async analyzeMemoryPatterns() {
    console.log(chalk.blue('🔍 Analyzing Memory Patterns...'));

    try {
      // Check key patterns
      const patterns = [
        'llm:*', // LLM generations
        'embed:*', // Embeddings
        'memory:*', // Memory manager metadata
        'chat:*', // Chat sessions
        'vector:*', // Vector data
      ];

      for (const pattern of patterns) {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          const sampleKey = keys[0];
          const ttl = await this.redis.ttl(sampleKey);
          const memUsage = await this.getKeyMemoryUsage(sampleKey);

          console.log(
            `🔑 ${pattern}: ${keys.length} keys, ~${this.formatBytes(memUsage)} each, TTL: ${ttl}s`
          );

          // Check for keys without TTL (potential memory leaks)
          if (ttl === -1 && keys.length > 100) {
            console.log(
              chalk.yellow(`⚠️  Pattern ${pattern} has ${keys.length} keys without expiration`)
            );
          }
        }
      }

      this.stats.successfulChecks++;
    } catch (error) {
      console.log(chalk.red('❌ Pattern analysis failed:'), error.message);
      this.stats.redisErrors++;
    }
  }

  /**
   * Test Nintendo-style cache hierarchy
   */
  async testCacheHierarchy() {
    console.log(chalk.blue('🏗️  Testing Cache Hierarchy...'));

    try {
      const testKey = `test:hierarchy:${Date.now()}`;
      const testData = { test: 'nintendo-cache-test', size: 1024 };

      // Test L3 (Redis) storage
      const start = performance.now();
      await this.redis.setex(testKey, 60, JSON.stringify(testData));
      const writeTime = performance.now() - start;

      // Test retrieval
      const retrieveStart = performance.now();
      const retrieved = await this.redis.get(testKey);
      const retrieveTime = performance.now() - retrieveStart;

      if (retrieved && JSON.parse(retrieved).test === 'nintendo-cache-test') {
        console.log(
          chalk.green(
            `✅ L3 Cache: Write ${writeTime.toFixed(2)}ms, Read ${retrieveTime.toFixed(2)}ms`
          )
        );
      } else {
        throw new Error('Cache test failed');
      }

      // Cleanup
      await this.redis.del(testKey);
      this.stats.successfulChecks++;
    } catch (error) {
      console.log(chalk.red('❌ Cache hierarchy test failed:'), error.message);
      this.stats.redisErrors++;
    }
  }

  /**
   * Identify potential memory leaks
   */
  async identifyMemoryLeaks() {
    console.log(chalk.blue('🔍 Identifying Memory Leaks...'));

    try {
      // Check for keys without expiration
      const allKeys = await this.redis.keys('*');
      let noTTLCount = 0;
      let largeKeyCount = 0;

      for (const key of allKeys.slice(0, 100)) {
        // Sample first 100 keys
        const ttl = await this.redis.ttl(key);
        if (ttl === -1) {
          noTTLCount++;
        }

        const memUsage = await this.getKeyMemoryUsage(key);
        if (memUsage > 10000) {
          // Keys larger than 10KB
          largeKeyCount++;
          if (largeKeyCount <= 5) {
            // Show first 5 large keys
            console.log(chalk.yellow(`🔍 Large key: ${key} (${this.formatBytes(memUsage)})`));
          }
        }
      }

      const noTTLPercent = (noTTLCount / Math.min(allKeys.length, 100)) * 100;

      if (noTTLPercent > 50) {
        console.log(
          chalk.red(`🚨 Memory leak risk: ${noTTLPercent.toFixed(1)}% of keys have no expiration`)
        );
        this.stats.memoryViolations++;
      } else if (noTTLPercent > 20) {
        console.log(
          chalk.yellow(
            `⚠️  Potential issue: ${noTTLPercent.toFixed(1)}% of keys have no expiration`
          )
        );
      } else {
        console.log(
          chalk.green(`✅ TTL hygiene OK: ${noTTLPercent.toFixed(1)}% keys without expiration`)
        );
      }

      console.log(`📊 Large keys (>10KB): ${largeKeyCount} found`);
      this.stats.successfulChecks++;
    } catch (error) {
      console.log(chalk.red('❌ Memory leak detection failed:'), error.message);
      this.stats.redisErrors++;
    }
  }

  /**
   * Generate comprehensive report
   */
  async generateReport() {
    console.log(chalk.cyan('\n📋 DIAGNOSTIC REPORT\n'));

    const memInfo = await this.getMemoryInfo();
    const usedMemory = memInfo.used_memory || 0;
    const budgetUsage = (usedMemory / MEMORY_LIMITS.L3_REDIS_BUDGET) * 100;

    // Overall health assessment
    let healthStatus = 'HEALTHY';
    let healthColor = chalk.green;

    if (this.stats.redisErrors > 0 || this.stats.budgetExceeded > 0) {
      healthStatus = 'CRITICAL';
      healthColor = chalk.red;
    } else if (budgetUsage > 80) {
      healthStatus = 'WARNING';
      healthColor = chalk.yellow;
    }

    console.log(healthColor(`🎮 Nintendo Memory System: ${healthStatus}\n`));

    // Statistics
    console.log('📊 Statistics:');
    console.log(`  ✅ Successful checks: ${this.stats.successfulChecks}`);
    console.log(`  ❌ Redis errors: ${this.stats.redisErrors}`);
    console.log(`  🚨 Budget violations: ${this.stats.budgetExceeded}`);
    console.log(`  ⚠️  Memory violations: ${this.stats.memoryViolations}`);

    console.log('\n💾 Memory Status:');
    console.log(`  Redis usage: ${this.formatBytes(usedMemory)}`);
    console.log(`  Nintendo budget: ${budgetUsage.toFixed(1)}% of 1MB`);
    console.log(`  Fragmentation: ${(memInfo.mem_fragmentation_ratio || 1).toFixed(2)}`);

    // Recommendations
    console.log('\n💡 Recommendations:');

    if (budgetUsage > 100) {
      console.log(chalk.red('  🚨 IMMEDIATE ACTION REQUIRED:'));
      console.log('     - Redis usage exceeds Nintendo 1MB budget');
      console.log('     - Enable aggressive eviction in memory manager');
      console.log('     - Review caching strategies');
    } else if (budgetUsage > 80) {
      console.log(chalk.yellow('  ⚠️  Monitor closely:'));
      console.log('     - Nintendo budget approaching limit');
      console.log('     - Consider cache optimization');
    } else {
      console.log(chalk.green('  ✅ System operating within Nintendo constraints'));
    }

    if (this.stats.redisErrors > 0) {
      console.log(chalk.red('  🔧 Fix Redis connectivity issues'));
      console.log('     - Check Redis server status');
      console.log('     - Review connection pool settings');
      console.log('     - Monitor network latency');
    }
  }

  /**
   * Get Redis memory information
   */
  async getMemoryInfo() {
    const info = await this.redis.info('memory');
    const lines = info.split('\r\n');
    const memInfo = {};

    for (const line of lines) {
      const [key, value] = line.split(':');
      if (key && value) {
        memInfo[key] = isNaN(Number(value)) ? value : Number(value);
      }
    }

    return memInfo;
  }

  /**
   * Get approximate memory usage of a key
   */
  async getKeyMemoryUsage(key) {
    try {
      const memory = await this.redis.memory('usage', key);
      return memory || 0;
    } catch (error) {
      // Fallback: estimate based on serialized size
      const value = await this.redis.get(key);
      return value ? value.length * 2 : 0;
    }
  }

  /**
   * Format bytes for human readability
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Run diagnostics if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const diagnostics = new NintendoMemoryDiagnostics();

  console.log(chalk.cyan('Starting Nintendo Memory Diagnostics...\n'));

  diagnostics
    .runDiagnostics()
    .then(() => {
      console.log(chalk.cyan('\n🎮 Diagnostics complete!'));
      process.exit(0);
    })
    .catch((error) => {
      console.error(chalk.red('\n💥 Diagnostics failed:'), error);
      process.exit(1);
    });
}

export { NintendoMemoryDiagnostics };
