#!/usr/bin/env node

/**
 * GPU Memory Initialization Script for RTX 3060 Ti
 * Optimizes memory allocation for legal AI workloads
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

// RTX 3060 Ti specifications
const GPU_CONFIG = {
  totalVRAM: 8 * 1024, // 8GB in MB
  reservedSystem: 1 * 1024, // Reserve 1GB for system
  maxUtilization: 0.85, // Use max 85% of available VRAM
  targetTemp: 70, // Target GPU temperature in Celsius
  memoryClockMHz: 1750,
  coreClock: 1665,
};

class GPUMemoryManager {
  constructor() {
    this.isWindows = os.platform() === 'win32';
    this.gpuInfo = null;
    this.memoryProfile = 'balanced';
  }

  async checkGPUStatus() {
    try {
      console.log('🔍 Checking GPU status...');

      const { stdout } = await execAsync(
        'nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free,temperature.gpu,utilization.gpu --format=csv,noheader,nounits'
      );

      const lines = stdout.trim().split('\n');
      const gpuData = lines[0].split(', ');

      this.gpuInfo = {
        name: gpuData[0].trim(),
        totalMemoryMB: parseInt(gpuData[1]),
        usedMemoryMB: parseInt(gpuData[2]),
        freeMemoryMB: parseInt(gpuData[3]),
        temperature: parseInt(gpuData[4]),
        utilization: parseInt(gpuData[5]),
      };

      console.log(`📊 GPU: ${this.gpuInfo.name}`);
      console.log(
        `💾 Memory: ${this.gpuInfo.usedMemoryMB}MB used / ${this.gpuInfo.totalMemoryMB}MB total`
      );
      console.log(`🌡️  Temperature: ${this.gpuInfo.temperature}°C`);
      console.log(`⚡ Utilization: ${this.gpuInfo.utilization}%`);

      return this.gpuInfo;
    } catch (error) {
      console.error('❌ Failed to check GPU status:', error.message);
      return null;
    }
  }

  determineMemoryProfile() {
    if (!this.gpuInfo) return 'conservative';

    const usedPercentage = (this.gpuInfo.usedMemoryMB / this.gpuInfo.totalMemoryMB) * 100;
    const temperature = this.gpuInfo.temperature;

    if (usedPercentage > 70 || temperature > 75) {
      this.memoryProfile = 'conservative';
      console.log('🔒 Using conservative memory profile (high usage/temp detected)');
    } else if (usedPercentage < 20 && temperature < 60) {
      this.memoryProfile = 'aggressive';
      console.log('🚀 Using aggressive memory profile (optimal conditions)');
    } else {
      this.memoryProfile = 'balanced';
      console.log('⚖️  Using balanced memory profile');
    }

    return this.memoryProfile;
  }

  getOptimalSettings() {
    const profiles = {
      conservative: {
        nodeMemoryMB: 2048,
        ollamaGPULayers: 10, // Reduced for 270M model
        batchSize: 8,
        contextSize: 2048,
        maxConcurrent: 3, // Can handle more concurrent with smaller model
        gemmaModel: 'gemma3:270m',
      },
      balanced: {
        nodeMemoryMB: 3072,
        ollamaGPULayers: 15, // Optimized for 270M model
        batchSize: 16,
        contextSize: 4096,
        maxConcurrent: 4,
        gemmaModel: 'gemma3:270m',
      },
      aggressive: {
        nodeMemoryMB: 4096,
        ollamaGPULayers: 20, // Max layers for 270M model
        batchSize: 32,
        contextSize: 8192,
        maxConcurrent: 6, // Much higher concurrent with 270M
        gemmaModel: 'gemma3:270m',
      },
    };

    return profiles[this.memoryProfile] || profiles.balanced;
  }

  generateEnvironmentVars(settings) {
    return {
      // Node.js memory optimization
      NODE_OPTIONS: `--max-old-space-size=${settings.nodeMemoryMB}`,

      // GPU acceleration flags
      ENABLE_GPU: 'true',
      RTX_3060_OPTIMIZATION: 'true',
      CUDA_VISIBLE_DEVICES: '0',

      // Ollama GPU optimization
      OLLAMA_GPU_LAYERS: settings.ollamaGPULayers.toString(),
      OLLAMA_HOST: '0.0.0.0:11434',
      OLLAMA_ORIGINS: '*',
      OLLAMA_NUM_PARALLEL: settings.maxConcurrent.toString(),

      // Legal AI specific optimizations
      LEGAL_AI_BATCH_SIZE: settings.batchSize.toString(),
      LEGAL_AI_CONTEXT_SIZE: settings.contextSize.toString(),
      VECTOR_CACHE_SIZE: Math.floor(settings.nodeMemoryMB * 0.2).toString(),

      // System optimization
      CONTEXT7_MULTICORE: 'true',
      WEBGPU_ACCELERATION: 'true',
      PGVECTOR_OPTIMIZATION: 'true',

      // Memory monitoring
      GPU_MEMORY_PROFILE: this.memoryProfile,
      GPU_MEMORY_LIMIT_MB: Math.floor(
        this.gpuInfo?.totalMemoryMB * GPU_CONFIG.maxUtilization || 6800
      ).toString(),
    };
  }

  async initializeGPUMemory() {
    console.log('🚀 Initializing GPU memory for Legal AI platform...\n');

    // Check GPU status
    await this.checkGPUStatus();

    if (!this.gpuInfo) {
      console.log('⚠️  No GPU detected, falling back to CPU mode');
      return {
        NODE_OPTIONS: '--max-old-space-size=2048',
        ENABLE_GPU: 'false',
      };
    }

    // Determine optimal memory profile
    this.determineMemoryProfile();

    // Get optimal settings
    const settings = this.getOptimalSettings();
    console.log('\n📋 Optimal settings:');
    console.log(`   Node.js memory: ${settings.nodeMemoryMB}MB`);
    console.log(`   Ollama GPU layers: ${settings.ollamaGPULayers}`);
    console.log(`   Batch size: ${settings.batchSize}`);
    console.log(`   Context size: ${settings.contextSize}`);
    console.log(`   Max concurrent: ${settings.maxConcurrent}`);

    // Generate environment variables
    const envVars = this.generateEnvironmentVars(settings);

    console.log('\n✅ GPU memory initialization complete!\n');

    return envVars;
  }

  async warmupGPU() {
    console.log('🔥 Warming up GPU for optimal performance...');

    try {
      // Pre-initialize CUDA context
      const warmupProcess = spawn('nvidia-smi', ['-i', '0', '-q'], {
        stdio: 'pipe',
      });

      warmupProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ GPU warmup complete');
        }
      });

      // Wait a moment for warmup
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.log('⚠️  GPU warmup failed, continuing anyway');
    }
  }

  async monitorMemoryUsage() {
    setInterval(async () => {
      try {
        const { stdout } = await execAsync(
          'nvidia-smi --query-gpu=memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits'
        );
        const [used, total, temp] = stdout
          .trim()
          .split(', ')
          .map((v) => parseInt(v));

        const usagePercent = Math.round((used / total) * 100);

        if (usagePercent > 90) {
          console.log(
            `⚠️  High GPU memory usage: ${usagePercent}% (${used}MB/${total}MB) - Temp: ${temp}°C`
          );
        }

        if (temp > 80) {
          console.log(`🌡️  High GPU temperature: ${temp}°C - Consider reducing workload`);
        }
      } catch (error) {
        // Silent fail for monitoring
      }
    }, 30000); // Check every 30 seconds
  }
}

// Main execution when run directly
const isMainModule = process.argv[1] && process.argv[1].endsWith('init-gpu-memory.js');
if (isMainModule) {
  const gpuManager = new GPUMemoryManager();

  gpuManager.initializeGPU = async () => {
    const envVars = await gpuManager.initializeGPUMemory();
    await gpuManager.warmupGPU();

    // Start monitoring in background
    gpuManager.monitorMemoryUsage();

    return envVars;
  };

  // Export environment variables for the calling process
  gpuManager.initializeGPU().then((envVars) => {
    // Output environment variables in a format that can be sourced
    for (const [key, value] of Object.entries(envVars)) {
      console.log(`export ${key}="${value}"`);
    }
  });
}

export default GPUMemoryManager;
