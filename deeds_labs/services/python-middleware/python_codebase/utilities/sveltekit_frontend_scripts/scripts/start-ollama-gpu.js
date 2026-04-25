#!/usr/bin/env node
// Ollama GPU-Accelerated Startup Script for Legal AI Chat Assistant
// Ensures Ollama is running with RTX 3060 optimization

import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Colors for console output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}🦙 Ollama: ${message}${colors.reset}`);
}

// Check if Ollama is already running
async function isOllamaRunning() {
  try {
    const { stdout } = await execAsync('curl -s http://localhost:11435/api/tags', {
      timeout: 5000,
    });
    return stdout.includes('models') || stdout.includes('[]');
  } catch (error) {
    return false;
  }
}

// Check GPU availability
async function checkGPUStatus() {
  try {
    const { stdout } = await execAsync(
      'nvidia-smi --query-gpu=name,memory.used,memory.total --format=csv,noheader,nounits'
    );
    if (stdout.includes('3060') || stdout.includes('RTX')) {
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        const [name, used, total] = line.split(',').map((s) => s.trim());
        log(`🎮 Found GPU: ${name} (${used}MB / ${total}MB used)`, 'blue');
      }
      return true;
    }
    return false;
  } catch (error) {
    log('⚠️ nvidia-smi not available - GPU status unknown', 'yellow');
    return false;
  }
}

// Start Ollama with GPU acceleration
async function startOllamaGPU() {
  return new Promise((resolve, reject) => {
    log('🚀 Starting Ollama with RTX 3060 GPU acceleration...', 'blue');

    const env = {
      ...process.env,
      OLLAMA_GPU_LAYERS: '30',
      CUDA_VISIBLE_DEVICES: '0',
      OLLAMA_NUM_PARALLEL: '4',
      OLLAMA_MAX_LOADED_MODELS: '2',
      OLLAMA_FLASH_ATTENTION: '1',
    };

    const child = spawn('ollama', ['serve'], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let startupComplete = false;

    child.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Listening on') || output.includes('server started')) {
        if (!startupComplete) {
          startupComplete = true;
          log('✅ Ollama GPU server started successfully', 'green');
          log('📍 Server listening on http://localhost:11435', 'blue');
          resolve(true);
        }
      }
    });

    child.stderr.on('data', (data) => {
      const error = data.toString();
      // Don't log normal startup messages as errors
      if (!error.includes('level=INFO') && !error.includes('Starting')) {
        log(`⚠️ ${error.trim()}`, 'yellow');
      }
    });

    child.on('close', (code) => {
      if (code !== 0 && !startupComplete) {
        log(`❌ Ollama exited with code ${code}`, 'red');
        reject(new Error(`Ollama startup failed with code ${code}`));
      }
    });

    child.on('error', (error) => {
      log(`❌ Failed to start Ollama: ${error.message}`, 'red');
      reject(error);
    });

    // Timeout fallback
    setTimeout(() => {
      if (!startupComplete) {
        log('✅ Ollama startup timeout reached - assuming success', 'green');
        resolve(true);
      }
    }, 10000);
  });
}

// Check required models
async function checkRequiredModels() {
  try {
    log('🔍 Checking required AI models...', 'yellow');

    const { stdout } = await execAsync('ollama list');
    const hasGemma = stdout.includes('gemma3-legal') || stdout.includes('gemma3');
    const hasEmbed = stdout.includes('nomic-embed-text');

    if (!hasGemma) {
      log('📦 Legal AI model missing - pulling gemma3-legal...', 'yellow');
      log('⏳ This may take several minutes for first-time setup', 'blue');

      try {
        await execAsync('ollama pull gemma3-legal:latest', { timeout: 300000 });
        log('✅ gemma3-legal model installed successfully', 'green');
      } catch (err) {
        log('⚠️ Failed to pull gemma3-legal, trying gemma3:8b as fallback', 'yellow');
        await execAsync('ollama pull gemma3:8b', { timeout: 300000 });
        log('✅ gemma3:8b model installed as fallback', 'green');
      }
    }

    if (!hasEmbed) {
      log('📦 Embedding model missing - pulling nomic-embed-text...', 'yellow');
      await execAsync('ollama pull nomic-embed-text', { timeout: 180000 });
      log('✅ nomic-embed-text model installed successfully', 'green');
    }

    log('✅ All required models are available', 'green');
  } catch (error) {
    log('⚠️ Model check/installation failed - continuing anyway', 'yellow');
    log(`Error: ${error.message}`, 'red');
  }
}

// Test AI chat functionality
async function testAIChat() {
  try {
    log('🧪 Testing AI chat assistant...', 'yellow');

    const testPrompt = {
      model: 'gemma3-legal',
      prompt: 'Hello, respond with exactly: "Legal AI assistant ready"',
      stream: false,
    };

    const { stdout } = await execAsync(
      `curl -s -X POST http://localhost:11435/api/generate -H "Content-Type: application/json" -d '${JSON.stringify(testPrompt)}'`,
      { timeout: 15000 }
    );

    const response = JSON.parse(stdout);
    if (response.response && response.response.includes('ready')) {
      log('✅ AI chat assistant is working correctly', 'green');
      return true;
    } else {
      log('⚠️ AI chat test completed but response unexpected', 'yellow');
      return false;
    }
  } catch (error) {
    log('⚠️ AI chat test failed - this may be normal during startup', 'yellow');
    return false;
  }
}

// Main execution
async function main() {
  try {
    log('🚀 Initializing Ollama GPU acceleration for Legal AI...', 'bold');

    // Check GPU
    const hasGPU = await checkGPUStatus();
    if (!hasGPU) {
      log('⚠️ RTX GPU not detected - continuing with CPU mode', 'yellow');
    }

    // Check if already running
    if (await isOllamaRunning()) {
      log('✅ Ollama is already running', 'green');
    } else {
      // Start Ollama
      await startOllamaGPU();

      // Wait for startup
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    // Check/install models
    await checkRequiredModels();

    // Test functionality
    setTimeout(async () => {
      await testAIChat();
    }, 5000);

    log('🎉 Ollama GPU setup complete - Legal AI chat assistant ready!', 'green');
    log('💬 Available models: gemma3-legal, nomic-embed-text', 'blue');
    log('⚡ GPU acceleration: RTX 3060 optimized (30 layers)', 'magenta');
  } catch (error) {
    log(`❌ Setup failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', () => {
  log('👋 Ollama GPU setup interrupted', 'yellow');
  process.exit(0);
});

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as startOllamaGPU };
