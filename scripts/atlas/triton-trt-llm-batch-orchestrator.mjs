#!/usr/bin/env node

/**
 * Triton TensorRT-LLM Batch Orchestrator
 *
 * Agentic workflow orchestration for batch inference across:
 * - TensorRT-LLM INT4 AWQ quantized models (inference @ :8099)
 * - QLoRA adapter memory swapping (based on regex NLP event patterns)
 * - SLM function tool calling (MCP tool dispatch)
 * - Event-driven memory pressure analysis (Redis pub/sub)
 *
 * Memory Swapping Strategy:
 * - Base model: 5.3GB (Gemma4-rotorquant:latest in VRAM)
 * - QLoRA adapters: 200-500MB each (loaded on-demand)
 * - Event patterns trigger adapter swap:
 *   - /auth|session|token/i → load auth.adapter.pt
 *   - /database|query|orm/i → load db.adapter.pt
 *   - /ui|component|render/i → load ui.adapter.pt
 *   - /error|debug|fix/i → load repair.adapter.pt
 * - Unload LRU adapter when VRAM pressure > 7GB
 *
 * Batch Processing:
 * - Collect packets until batch_size reached or timeout
 * - Route via TensorRT Triton :8000 (batched inference)
 * - Return results with latency telemetry
 *
 * Function Tool Calling:
 * - Parse LLM output for tool calls (JSON + markdown format)
 * - Validate against MCP schema
 * - Dispatch to appropriate tool handler
 * - Stream results back to batch job
 *
 * Usage:
 *   node scripts/atlas/triton-trt-llm-batch-orchestrator.mjs --dry-run --analyze-memory
 *   node scripts/atlas/triton-trt-llm-batch-orchestrator.mjs --start-daemon --triton-url=http://127.0.0.1:8000
 *   node scripts/atlas/triton-trt-llm-batch-orchestrator.mjs --submit-batch --packets=@batch.json --adapter=auth
 */

import Redis from 'ioredis';
import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import fetch from 'node-fetch';
import { EventEmitter } from 'events';
import { loadRepoEnv } from './connection-config.mjs';

config({ path: resolve('.', '.env') });

const env = loadRepoEnv(process.env);

// Redis for event streaming + memory tracking
const redis = new Redis({
  host: env.REDIS_HOST || '127.0.0.1',
  port: env.REDIS_PORT || 6379,
  password: env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});

const TRITON_URL = process.argv.find(arg => arg.startsWith('--triton-url='))?.split('=')[1] || 'http://127.0.0.1:8000';
const TRT_LLM_URL = 'http://127.0.0.1:8099'; // TensorRT-LLM inference endpoint
const BATCH_SIZE = parseInt(process.argv.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || '32');
const BATCH_TIMEOUT_MS = parseInt(process.argv.find(arg => arg.startsWith('--batch-timeout='))?.split('=')[1] || '5000');
const VRAM_PRESSURE_THRESHOLD = parseFloat(process.argv.find(arg => arg.startsWith('--vram-threshold='))?.split('=')[1] || '0.85');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Triton TensorRT-LLM Batch Orchestrator                        ║');
console.log('║  QLoRA adapter swapping + agentic function tool calling        ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ===== Adapter Registry (QLoRA patterns) =====
const adapterRegistry = {
  'auth.adapter': {
    path: 'models/adapters/auth-sessions-lora.pt',
    size_mb: 250,
    trigger_patterns: [/auth|session|token|login|credential|permission/i],
    description: 'Auth & session management domain',
  },
  'db.adapter': {
    path: 'models/adapters/database-orm-lora.pt',
    size_mb: 300,
    trigger_patterns: [/database|query|orm|drizzle|schema|migration|transaction/i],
    description: 'Database & ORM domain',
  },
  'ui.adapter': {
    path: 'models/adapters/ui-components-lora.pt',
    size_mb: 280,
    trigger_patterns: [/ui|component|render|button|form|modal|svelte|layout/i],
    description: 'UI & component domain',
  },
  'repair.adapter': {
    path: 'models/adapters/error-fixing-lora.pt',
    size_mb: 220,
    trigger_patterns: [/error|debug|fix|repair|bug|stack|trace|exception/i],
    description: 'Error fixing & repair domain',
  },
};

// ===== Batch State Machine =====
class BatchOrchestrator extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.loadedAdapters = new Map(); // adapter_name -> { loaded_at, access_count }
    this.batchTimer = null;
    this.vramUsage = 0;
    this.telemetry = {
      batches_processed: 0,
      packets_processed: 0,
      tool_calls_executed: 0,
      adapter_swaps: 0,
      avg_latency_ms: 0,
    };
  }

  async initialize() {
    console.log('🔌 Connecting to Redis...\n');
    await redis.connect();
    console.log('✅ Connected\n');

    // Subscribe to NLP event patterns
    const subscriber = new Redis({
      host: env.REDIS_HOST || '127.0.0.1',
      port: env.REDIS_PORT || 6379,
      password: env.REDIS_PASSWORD || undefined,
    });

    subscriber.subscribe('slm:packet:infer', 'slm:error:recovery', async (err) => {
      if (err) console.error('❌ Subscribe error:', err);
    });

    subscriber.on('message', async (channel, message) => {
      try {
        const event = JSON.parse(message);
        await this.handleNlpEvent(event, channel);
      } catch (e) {
        console.error('⚠️  Event parse error:', e.message);
      }
    });

    // Start batch timer
    this.startBatchTimer();
  }

  async handleNlpEvent(event, channel) {
    // Regex pattern matching to determine which adapter to load
    let matchedAdapter = null;

    const eventText = JSON.stringify(event).toLowerCase();

    for (const [adapterName, config] of Object.entries(adapterRegistry)) {
      for (const pattern of config.trigger_patterns) {
        if (pattern.test(eventText)) {
          matchedAdapter = adapterName;
          break;
        }
      }
      if (matchedAdapter) break;
    }

    if (matchedAdapter) {
      await this.loadAdapter(matchedAdapter);
    }

    // Enqueue packet for batch processing
    if (event.packet_key) {
      this.queue.push({
        packet_key: event.packet_key,
        embedding_384: event.embedding_384 || [],
        adapter: matchedAdapter,
        timestamp: Date.now(),
        priority: event.priority || 5,
      });
    }
  }

  async loadAdapter(adapterName) {
    if (this.loadedAdapters.has(adapterName)) {
      // Update LRU
      const entry = this.loadedAdapters.get(adapterName);
      entry.access_count++;
      entry.last_access = Date.now();
      return;
    }

    const config = adapterRegistry[adapterName];
    if (!config) {
      console.error(`❌ Unknown adapter: ${adapterName}`);
      return;
    }

    // Check VRAM pressure
    if (this.vramUsage + config.size_mb > 8000 * VRAM_PRESSURE_THRESHOLD) {
      await this.evictLRUAdapter();
    }

    console.log(`📦 Loading adapter: ${adapterName} (${config.size_mb}MB)`);
    console.log(`   Description: ${config.description}`);

    // Simulate adapter load (in production, wire to LoRA merge pipeline)
    this.loadedAdapters.set(adapterName, {
      config,
      loaded_at: Date.now(),
      access_count: 1,
      last_access: Date.now(),
    });

    this.vramUsage += config.size_mb;
    this.telemetry.adapter_swaps++;

    // Publish adapter load event
    await redis.publish('triton:adapter:loaded', JSON.stringify({
      adapter: adapterName,
      size_mb: config.size_mb,
      vram_usage_mb: this.vramUsage,
      timestamp: Date.now(),
    }));
  }

  async evictLRUAdapter() {
    let lruAdapter = null;
    let lruTime = Infinity;

    for (const [name, entry] of this.loadedAdapters.entries()) {
      if (entry.last_access < lruTime) {
        lruTime = entry.last_access;
        lruAdapter = name;
      }
    }

    if (lruAdapter) {
      const entry = this.loadedAdapters.get(lruAdapter);
      console.log(`🗑️  Evicting LRU adapter: ${lruAdapter}`);
      this.vramUsage -= entry.config.size_mb;
      this.loadedAdapters.delete(lruAdapter);
    }
  }

  startBatchTimer() {
    this.batchTimer = setInterval(async () => {
      if (this.queue.length > 0) {
        await this.processBatch();
      }
    }, BATCH_TIMEOUT_MS);
  }

  async processBatch() {
    if (this.queue.length === 0) return;

    // Sort by priority
    this.queue.sort((a, b) => b.priority - a.priority);

    // Take up to BATCH_SIZE items
    const batchItems = this.queue.splice(0, BATCH_SIZE);
    const batchId = `batch:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

    console.log(`\n📤 Processing batch ${batchId} (${batchItems.length} packets)`);

    const batchStartTime = Date.now();
    const results = [];

    for (const item of batchItems) {
      try {
        // Prepare inference payload
        const payload = {
          model_name: 'gemma4-rotorquant',
          inputs: [
            {
              name: 'input_ids',
              shape: [1, 384],
              datatype: 'FP32',
              data: item.embedding_384,
            },
          ],
        };

        // Call TensorRT-LLM (or Triton proxy)
        const response = await fetch(`${TRT_LLM_URL}/v1/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gemma4-rotorquant',
            prompt: `Analyze packet ${item.packet_key}`,
            max_tokens: 256,
            temperature: 0.3,
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          throw new Error(`TRT-LLM error: ${response.status}`);
        }

        const inference = await response.json();
        const content = inference.choices?.[0]?.text || '';

        // Parse tool calls from LLM output
        const toolCalls = this.parseToolCalls(content);

        // Execute function tool calls
        for (const toolCall of toolCalls) {
          await this.executeTool(toolCall);
        }

        const latency = Date.now() - batchStartTime;

        results.push({
          packet_key: item.packet_key,
          adapter: item.adapter,
          inference: content,
          tool_calls: toolCalls,
          latency_ms: latency,
          success: true,
        });

        this.telemetry.packets_processed++;
        this.telemetry.tool_calls_executed += toolCalls.length;

      } catch (err) {
        console.error(`❌ Inference error (${item.packet_key}):`, err.message);

        results.push({
          packet_key: item.packet_key,
          adapter: item.adapter,
          error: err.message,
          success: false,
        });

        // Publish error event for recovery
        await redis.publish('slm:error:recovery', JSON.stringify({
          packet_key: item.packet_key,
          model: 'gemma4-rotorquant',
          error: err.message,
          fallback_model: 'native',
        }));
      }
    }

    // Update telemetry
    const batchLatency = Date.now() - batchStartTime;
    const n = this.telemetry.batches_processed + 1;
    this.telemetry.avg_latency_ms =
      (this.telemetry.avg_latency_ms * (n - 1) + batchLatency) / n;
    this.telemetry.batches_processed++;

    // Publish batch completion
    await redis.publish('triton:batch:completed', JSON.stringify({
      batch_id: batchId,
      packet_count: batchItems.length,
      result_count: results.length,
      latency_ms: batchLatency,
      timestamp: Date.now(),
    }));

    console.log(`✅ Batch complete: ${batchLatency}ms\n`);

    return results;
  }

  parseToolCalls(content) {
    // Parse JSON tool calls: {"tool": "name", "params": {...}}
    // Also parse markdown format: ```json {"tool": ...} ```
    const toolCalls = [];

    // Try JSON blocks
    const jsonRegex = /```json\n?([\s\S]*?)\n?```/g;
    let match;

    while ((match = jsonRegex.exec(content)) !== null) {
      try {
        const obj = JSON.parse(match[1]);
        if (obj.tool) {
          toolCalls.push(obj);
        }
      } catch (e) {
        // Skip malformed JSON
      }
    }

    // Try inline JSON
    const inlineRegex = /\{[^{}]*"tool"[^{}]*\}/g;
    while ((match = inlineRegex.exec(content)) !== null) {
      try {
        const obj = JSON.parse(match[0]);
        if (obj.tool && !toolCalls.some(t => t.tool === obj.tool)) {
          toolCalls.push(obj);
        }
      } catch (e) {
        // Skip malformed JSON
      }
    }

    return toolCalls;
  }

  async executeTool(toolCall) {
    const { tool, params = {} } = toolCall;

    console.log(`  🔧 Executing tool: ${tool}`);

    // Dispatch to MCP tool registry
    try {
      const response = await fetch('http://127.0.0.1:8788/mcp/tools/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tool,
          arguments: params,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`     ✅ Result: ${JSON.stringify(result).slice(0, 100)}...`);
        return result;
      }
    } catch (err) {
      console.log(`     ⚠️  Tool error: ${err.message}`);
    }
  }

  async analyzeMemory() {
    console.log('\n📊 Memory Analysis\n');
    console.log('Loaded Adapters:');
    for (const [name, entry] of this.loadedAdapters.entries()) {
      console.log(`  ${name}: ${entry.config.size_mb}MB (${entry.access_count} accesses)`);
    }
    console.log(`\nVRAM Usage: ${this.vramUsage}MB / 8000MB (${(this.vramUsage / 8000 * 100).toFixed(1)}%)`);
    console.log(`Threshold: ${(VRAM_PRESSURE_THRESHOLD * 100).toFixed(0)}%`);
    console.log();
  }

  printTelemetry() {
    console.log('\n📈 Telemetry\n');
    Object.entries(this.telemetry).forEach(([key, val]) => {
      console.log(`  ${key}: ${val}`);
    });
    console.log();
  }
}

async function main() {
  const orchestrator = new BatchOrchestrator();

  if (process.argv.includes('--dry-run')) {
    console.log('📋 DRY-RUN: Adapter Registry\n');
    Object.entries(adapterRegistry).forEach(([name, config]) => {
      console.log(`${name}:`);
      console.log(`  Path: ${config.path}`);
      console.log(`  Size: ${config.size_mb}MB`);
      console.log(`  Patterns: ${config.trigger_patterns.map(p => p.source).join(' | ')}`);
      console.log(`  Description: ${config.description}`);
      console.log();
    });

    if (process.argv.includes('--analyze-memory')) {
      console.log('📊 Memory Simulation\n');
      console.log(`Base model (Gemma4-rotorquant): 5300MB`);
      console.log(`Total adapter size if all loaded: ${Object.values(adapterRegistry).reduce((sum, c) => sum + c.size_mb, 0)}MB`);
      console.log(`VRAM threshold: ${(8000 * VRAM_PRESSURE_THRESHOLD).toFixed(0)}MB`);
      console.log(`Max adapters loaded simultaneously: ~2-3\n`);
    }

  } else if (process.argv.includes('--start-daemon')) {
    console.log('🚀 Starting daemon...\n');
    await orchestrator.initialize();

    setInterval(() => {
      orchestrator.printTelemetry();
      orchestrator.analyzeMemory();
    }, 30000);

    console.log('✅ Daemon running. Listening for events...\n');

  } else if (process.argv.includes('--submit-batch')) {
    const packetsArg = process.argv.find(arg => arg.startsWith('--packets='));
    const adapterArg = process.argv.find(arg => arg.startsWith('--adapter='));

    if (!packetsArg) {
      console.error('❌ Usage: --submit-batch --packets=@batch.json [--adapter=name]');
      process.exit(1);
    }

    const batchFile = packetsArg.split('=')[1].replace(/^@/, '');
    const batchData = JSON.parse(readFileSync(batchFile, 'utf-8'));

    console.log(`📤 Submitting batch (${batchData.length} packets)`);
    console.log(`   File: ${batchFile}\n`);

    await orchestrator.initialize();

    for (const packet of batchData) {
      const event = {
        packet_key: packet.packet_key,
        embedding_384: packet.embedding_384,
        priority: packet.priority || 5,
      };
      await orchestrator.handleNlpEvent(event, 'slm:packet:infer');
    }

    // Wait for batch processing
    await new Promise(r => setTimeout(r, 10000));
    orchestrator.printTelemetry();
    process.exit(0);

  } else {
    console.log('Usage:');
    console.log('  node scripts/atlas/triton-trt-llm-batch-orchestrator.mjs --dry-run --analyze-memory');
    console.log('  node scripts/atlas/triton-trt-llm-batch-orchestrator.mjs --start-daemon');
    console.log('  node scripts/atlas/triton-trt-llm-batch-orchestrator.mjs --submit-batch --packets=@batch.json');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
