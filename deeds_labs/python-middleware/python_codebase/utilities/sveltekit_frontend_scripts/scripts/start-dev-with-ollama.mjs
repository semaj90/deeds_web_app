#!/usr/bin/env node
/**
 * Enhanced Dev Starter with Ollama Model Management
 *
 * Features:
 * 1. Start Ollama if not running
 * 2. Detect available models
 * 3. Pull required models if missing
 * 4. Configure environment
 * 5. Start dev server (regular or QUIC)
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { platform } from 'os';

const execAsync = promisify(exec);

// Configuration
const REQUIRED_MODELS = [
  'embeddinggemma:latest',  // Primary embedding model
  'gemma3:legal-latest',    // Legal AI model (if available)
  'nomic-embed-text',       // Fallback embedding model
];

const OLLAMA_URLS = [
  'http://localhost:11434',
  'http://localhost:11435',
  'http://localhost:11436',
];

/**
 * Build a prioritized list of Ollama URL candidates.
 * Attempts to read from a project helper first (if available), then env vars, then defaults.
 */
async function getPreferredOllamaUrls() {
  const urls = [];

  // Try to dynamically import the project's centralized helper if present (best-effort)
  try {
    // The helper may not be compiled to JS in this environment; fail silently if not importable
    const mod = await import('../src/lib/utils/ollama-endpoint.js').catch(() => null);
    if (mod) {
      if (typeof mod.getOllamaBaseUrl === 'function') {
        const base = mod.getOllamaBaseUrl();
        if (base) urls.push(base.replace(/\/$/, ''));
      } else if (typeof mod.default === 'function') {
        try {
          const base = mod.default();
          if (base) urls.push(base.replace(/\/$/, ''));
        } catch (e) {
          // ignore
        }
      }
    }
  } catch (e) {
    // ignore - this is best-effort only
  }

  // Environment overrides
  const envCandidates = [
    process.env.OLLAMA_URL,
    process.env.OLLAMA_ENDPOINT,
    process.env.VITE_OLLAMA_URL,
    process.env.VITE_OLLAMA_ENDPOINT,
  ].filter(Boolean);

  for (const e of envCandidates) {
    const normalized = String(e).replace(/\/$/, '');
    if (!urls.includes(normalized)) urls.push(normalized);
  }

  // Finally, append known local defaults
  for (const u of OLLAMA_URLS) {
    const normalized = u.replace(/\/$/, '');
    if (!urls.includes(normalized)) urls.push(normalized);
  }

  return urls;
}

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

/**
 * Check if Ollama is running
 */
async function checkOllamaRunning(url = OLLAMA_URLS[0]) {
  try {
    const response = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Find running Ollama instance
 */
async function findOllamaInstance() {
  const candidates = await getPreferredOllamaUrls();
  for (const url of candidates) {
    if (await checkOllamaRunning(url)) {
      log(`✅ Found Ollama running at ${url}`, colors.green);
      return url;
    }
  }
  return null;
}

/**
 * Start Ollama service
 */
async function startOllama() {
  log('🚀 Starting Ollama...', colors.cyan);

  const isWindows = platform() === 'win32';

  try {
    if (isWindows) {
      // Windows: Check if Ollama is installed
      try {
        await execAsync('where ollama');
      } catch {
        log('❌ Ollama not found in PATH', colors.red);
        log('Please install Ollama from: https://ollama.com/download', colors.yellow);
        return false;
      }

      // Start Ollama service
      exec('start ollama serve', { shell: true });
    } else {
      // Linux/Mac
      spawn('ollama', ['serve'], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    }

    // Wait for Ollama to start
    log('⏳ Waiting for Ollama to start...', colors.yellow);

    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const ollamaUrl = await findOllamaInstance();
      if (ollamaUrl) {
        log(`✅ Ollama started successfully at ${ollamaUrl}`, colors.green);
        return ollamaUrl;
      }
    }

    log('❌ Ollama failed to start within 30 seconds', colors.red);
    return false;
  } catch (error) {
    log(`❌ Error starting Ollama: ${error.message}`, colors.red);
    return false;
  }
}

/**
 * Get list of available models
 */
async function getAvailableModels(ollamaUrl) {
  try {
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    return data.models?.map(m => m.name) || [];
  } catch (error) {
    log(`⚠️  Could not fetch models: ${error.message}`, colors.yellow);
    return [];
  }
}

/**
 * Pull missing model
 */
async function pullModel(modelName, ollamaUrl) {
  log(`📥 Pulling model: ${modelName}...`, colors.cyan);

  try {
    const response = await fetch(`${ollamaUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let lastProgress = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const json = JSON.parse(line);

          if (json.status === 'success') {
            log(`✅ Model ${modelName} pulled successfully`, colors.green);
            return true;
          }

          if (json.total && json.completed) {
            const progress = Math.floor((json.completed / json.total) * 100);
            if (progress > lastProgress + 10 || progress === 100) {
              process.stdout.write(`\r  Progress: ${progress}%`);
              lastProgress = progress;
            }
          }
        } catch {
          // Ignore invalid JSON lines
        }
      }
    }

    console.log(); // New line after progress
    return true;
  } catch (error) {
    log(`❌ Failed to pull ${modelName}: ${error.message}`, colors.red);
    return false;
  }
}

/**
 * Ensure required models are available
 */
async function ensureModels(ollamaUrl) {
  log('\n📋 Checking available models...', colors.cyan);

  const availableModels = await getAvailableModels(ollamaUrl);

  if (availableModels.length > 0) {
    log(`✅ Found ${availableModels.length} model(s):`, colors.green);
    availableModels.forEach(model => log(`   • ${model}`, colors.cyan));
  } else {
    log('⚠️  No models found', colors.yellow);
  }

  // Check for required models
  const missingModels = [];

  for (const required of REQUIRED_MODELS) {
    // Check if any available model matches (exact or prefix match)
    const found = availableModels.some(
      model => model === required || model.startsWith(required.split(':')[0])
    );

    if (!found) {
      missingModels.push(required);
    } else {
      log(`✅ ${required} available`, colors.green);
    }
  }

  // Pull missing models
  if (missingModels.length > 0) {
    log(`\n📥 Pulling ${missingModels.length} missing model(s)...`, colors.yellow);

    for (const model of missingModels) {
      const success = await pullModel(model, ollamaUrl);

      if (!success) {
        log(`⚠️  Continuing without ${model}`, colors.yellow);
      }
    }
  } else {
    log('\n✅ All required models are available', colors.green);
  }
}

/**
 * Start development server
 */
function startDevServer(isQuic = false, ollamaUrl = OLLAMA_URLS[0]) {
  log('\n🚀 Starting development server...', colors.cyan);

  const env = {
    ...process.env,
    OLLAMA_URL: ollamaUrl,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD || 'redis',
  };

  if (isQuic) {
    env.QUIC_ENABLED = 'true';
    env.CADDY_QUIC = 'true';
  }

  const npmCmd = platform() === 'win32' ? 'npm.cmd' : 'npm';
  const devScript = isQuic ? 'dev:quic' : 'dev';

  log(`Running: npm run ${devScript}`, colors.cyan);
  log(`Ollama URL: ${ollamaUrl}`, colors.cyan);

  const devServer = spawn(npmCmd, ['run', devScript], {
    env,
    stdio: 'inherit',
    shell: true,
  });

  devServer.on('error', (error) => {
    log(`❌ Failed to start dev server: ${error.message}`, colors.red);
    process.exit(1);
  });

  devServer.on('exit', (code) => {
    if (code !== 0) {
      log(`❌ Dev server exited with code ${code}`, colors.red);
    }
    process.exit(code);
  });
}

/**
 * Main startup sequence
 */
async function main() {
  log('═══════════════════════════════════════════', colors.bright);
  log('   Legal AI Platform - Dev Environment     ', colors.bright);
  log('═══════════════════════════════════════════\n', colors.bright);

  const args = process.argv.slice(2);
  const isQuic = args.includes('--quic') || args.includes('-q');

  // Step 1: Check if Ollama is running
  log('1️⃣  Checking Ollama status...', colors.cyan);
  let ollamaUrl = await findOllamaInstance();

  // Step 2: Start Ollama if needed
  if (!ollamaUrl) {
    log('⚠️  Ollama not running', colors.yellow);

    const started = await startOllama();
    if (!started) {
      log('\n❌ Cannot continue without Ollama', colors.red);
      log('Options:', colors.yellow);
      log('  1. Install Ollama: https://ollama.com/download', colors.cyan);
      log('  2. Start Ollama manually: ollama serve', colors.cyan);
      process.exit(1);
    }

    ollamaUrl = await findOllamaInstance();
  }

  // Step 3: Ensure models are available
  log('\n2️⃣  Checking and pulling models...', colors.cyan);
  await ensureModels(ollamaUrl);

  // Step 4: Start dev server
  log('\n3️⃣  Starting development server...', colors.cyan);
  startDevServer(isQuic, ollamaUrl);
}

// Run main function
main().catch((error) => {
  log(`\n❌ Fatal error: ${error.message}`, colors.red);
  console.error(error.stack);
  process.exit(1);
});
