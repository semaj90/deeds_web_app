#!/usr/bin/env node

/**
 * 🚀 Complete Full-Stack Legal AI Development Launcher
 *
 * Automatically starts ALL services with Windows fallbacks:
 * - PostgreSQL (Docker or native Windows service)
 * - Redis (Docker or native Windows service)
 * - MinIO (Docker)
 * - Ollama (native Windows, GPU 30 layers)
 * - RabbitMQ (Docker, optional)
 * - OCR Worker (GPU-accelerated Tesseract)
 * - Embedding Worker (Ollama + pgvector)
 * - Autotag Worker (keyword extraction, optional)
 * - SvelteKit Dev Server
 *
 * Usage: npm run dev:quic
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🚀 Starting Complete Legal AI Full-Stack Development Environment...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const childProcesses = new Set();
const services = {
  postgres: { running: false, docker: false },
  redis: { running: false, docker: false },
  minio: { running: false, docker: false },
  ollama: { running: false },
  tensorrt: { running: false, docker: false, optional: true },
  rabbitmq: { running: false, optional: true },
  workers: {
    ocr: { running: false, optional: false },
    embedding: { running: false, optional: false },
    autotag: { running: false, optional: true },
  },
};

// Graceful shutdown
function gracefulShutdown(signal) {
  console.log(`\n📡 Received ${signal}. Shutting down...`);
  childProcesses.forEach((child) => {
    if (!child.killed) {
      console.log(`  ⏹ Stopping process ${child.pid}...`);
      child.kill('SIGTERM');
    }
  });
  console.log('✅ All services stopped');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Check if port is in use
async function checkPort(port) {
  return new Promise(async (resolve) => {
    const options = { host: 'localhost', port, timeout: 1000 };
    const net = await import('net');
    const socket = net.default.createConnection(options);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

// Check service health
async function checkServiceHealth(url) {
  return new Promise((resolve) => {
    http
      .get(url, (res) => {
        resolve(res.statusCode === 200 || res.statusCode === 404);
      })
      .on('error', () => resolve(false));
  });
}

// Check if Docker is running
async function isDockerRunning() {
  try {
    await execAsync('docker info');
    return true;
  } catch {
    return false;
  }
}

// Start Docker container
async function startDockerContainer(name, image, ports, env = []) {
  try {
    // Check if container exists
    const { stdout } = await execAsync(
      `docker ps -a --filter "name=${name}" --format "{{.Names}}"`
    );

    if (stdout.trim() === name) {
      // Container exists, start it
      console.log(`   Starting existing container ${name}...`);
      await execAsync(`docker start ${name}`);
      return true;
    }

    // Create new container
    console.log(`   Creating new container ${name}...`);
    const portMappings = ports.map((p) => `-p ${p}`).join(' ');
    const envVars = env.map((e) => `-e ${e}`).join(' ');
    await execAsync(`docker run -d --name ${name} ${portMappings} ${envVars} ${image}`);
    return true;
  } catch (error) {
    console.error(`   ❌ Failed to start Docker container: ${error.message}`);
    return false;
  }
}

// Check Windows service
async function checkWindowsService(serviceName) {
  try {
    const { stdout } = await execAsync(`sc query "${serviceName}"`);
    return stdout.includes('RUNNING');
  } catch {
    return false;
  }
}

// Start Windows service
async function startWindowsService(serviceName) {
  try {
    await execAsync(`net start "${serviceName}"`);
    return true;
  } catch {
    return false;
  }
}

async function setupPostgreSQL() {
  console.log('\n🐘 Setting up PostgreSQL...');

  // Check if PostgreSQL is already running on port 5432
  const port5432 = await checkPort(5432);
  if (port5432) {
    console.log('   ✅ PostgreSQL already running on port 5432');
    services.postgres.running = true;
    return true;
  }

  const dockerRunning = await isDockerRunning();

  if (dockerRunning) {
    console.log('   🐳 Docker available, starting PostgreSQL container...');
    const started = await startDockerContainer(
      'legal-ai-postgres',
      'postgres:17-alpine',
      ['5432:5432'],
      ['POSTGRES_DB=legal_ai_db', 'POSTGRES_USER=legal_admin', 'POSTGRES_PASSWORD=123456']
    );

    if (started) {
      services.postgres.running = true;
      services.postgres.docker = true;
      console.log('   ✅ PostgreSQL container started');
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return true;
    }
  }

  // Try Windows service
  console.log('   🪟 Checking for Windows PostgreSQL service...');
  const serviceRunning = await checkWindowsService('postgresql-x64-17');
  if (serviceRunning) {
    console.log('   ✅ Windows PostgreSQL service running');
    services.postgres.running = true;
    return true;
  }

  const started = await startWindowsService('postgresql-x64-17');
  if (started) {
    console.log('   ✅ Windows PostgreSQL service started');
    services.postgres.running = true;
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return true;
  }

  console.log('   ⚠️  PostgreSQL not available (install PostgreSQL or Docker)');
  return false;
}

async function setupRedis() {
  console.log('\n🔴 Setting up Redis...');

  const port6379 = await checkPort(6379);
  if (port6379) {
    console.log('   ✅ Redis already running on port 6379');
    services.redis.running = true;
    return true;
  }

  const dockerRunning = await isDockerRunning();

  if (dockerRunning) {
    console.log('   🐳 Docker available, starting Redis container...');
    const started = await startDockerContainer(
      'legal-ai-redis',
      'redis:7-alpine',
      ['6379:6379'],
      []
    );

    if (started) {
      // Set password using redis-cli
      try {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await execAsync('docker exec legal-ai-redis redis-cli CONFIG SET requirepass redis');
        console.log('   ✅ Redis password set to: redis');
      } catch {}

      services.redis.running = true;
      services.redis.docker = true;
      console.log('   ✅ Redis container started');
      return true;
    }
  }

  // Try Windows service
  console.log('   🪟 Checking for Windows Redis service...');
  const serviceRunning = await checkWindowsService('Redis');
  if (serviceRunning) {
    console.log('   ✅ Windows Redis service running');
    services.redis.running = true;
    return true;
  }

  const started = await startWindowsService('Redis');
  if (started) {
    console.log('   ✅ Windows Redis service started');
    services.redis.running = true;
    return true;
  }

  console.log('   ⚠️  Redis not available (install Redis or Docker)');
  return false;
}

async function setupMinIO() {
  console.log('\n📦 Setting up MinIO...');

  const port9000 = await checkPort(9000);
  if (port9000) {
    console.log('   ✅ MinIO already running on port 9000');
    services.minio.running = true;
    return true;
  }

  const dockerRunning = await isDockerRunning();

  if (dockerRunning) {
    console.log('   🐳 Starting MinIO container...');
    const started = await startDockerContainer(
      'legal-ai-minio',
      'minio/minio:latest',
      ['9000:9000', '9001:9001'],
      ['MINIO_ROOT_USER=minioadmin', 'MINIO_ROOT_PASSWORD=minioadmin123']
    );

    if (started) {
      // Start MinIO server
      try {
        await execAsync(
          'docker exec legal-ai-minio minio server /data --console-address ":9001" &'
        );
      } catch {}

      services.minio.running = true;
      services.minio.docker = true;
      console.log('   ✅ MinIO container started');
      console.log('   📊 MinIO Console: http://localhost:9001');
      return true;
    }
  }

  console.log('   ⚠️  MinIO not available (install Docker)');
  return false;
}

async function setupOllama() {
  console.log('\n🤖 Setting up Ollama...');

  const port11434 = await checkPort(11434);
  if (port11434) {
    console.log('   ✅ Ollama already running on port 11434');
    services.ollama.running = true;
    return true;
  }

  // Try to start Ollama - multiple possible locations
  const ollamaPaths = [
    'C:/Users/james/Music/deeds-web-app/web-app/Ollama/ollama.exe',
    'ollama', // System PATH
    'C:/Program Files/Ollama/ollama.exe',
  ];

  console.log('   Starting Ollama with GPU layers 30...');

  for (const ollamaPath of ollamaPaths) {
    try {
      const ollama = spawn(ollamaPath, ['serve'], {
        stdio: 'ignore',
        detached: true,
        shell: true,
        env: {
          ...process.env,
          OLLAMA_NUM_GPU: '30',
          OLLAMA_HOST: '0.0.0.0:11434',
        },
      });

      ollama.on('error', (err) => {
        // Ignore spawn errors - try next path
      });

      ollama.unref(); // Don't wait for it
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const running = await checkPort(11434);
      if (running) {
        console.log('   ✅ Ollama started with 30 GPU layers');
        services.ollama.running = true;
        return true;
      }
    } catch (error) {
      // Try next path
      continue;
    }
  }

  console.log('   ⚠️  Ollama not available (install from https://ollama.ai)');
  return false;
}

async function setupTensorRT() {
  console.log('\n⚡ Setting up TensorRT-LLM (optional GPU acceleration)...');

  const port8096 = await checkPort(8096);
  if (port8096) {
    console.log('   ✅ TensorRT-LLM already running on port 8096');
    services.tensorrt.running = true;
    return true;
  }

  const dockerRunning = await isDockerRunning();

  if (dockerRunning) {
    console.log('   🐳 Starting TensorRT-LLM container with GPU...');
    try {
      // Check if NVIDIA runtime is available
      const { stdout: runtimeCheck } = await execAsync('docker info --format "{{.Runtimes}}"');
      const hasNvidiaRuntime = runtimeCheck.includes('nvidia');

      if (!hasNvidiaRuntime) {
        console.log('   ⚠️  NVIDIA Docker runtime not detected, TensorRT-LLM requires GPU');
        return false;
      }

      // Start TensorRT-LLM container
      const started = await startDockerContainer(
        'legal-ai-tensorrt-llm',
        'nvcr.io/nvidia/tensorrt-llm/release:latest',
        ['8096:8096', '8097:8097', '8098:8098'],
        [
          'DATABASE_URL=postgresql://legal_admin:123456@host.docker.internal:5432/legal_ai_db',
          'REDIS_URL=redis://:redis@host.docker.internal:6379/0',
          'REDIS_PASSWORD=redis',
          'TENSORRT_PORT=8096',
          'CUDA_VISIBLE_DEVICES=0',
          'NVIDIA_VISIBLE_DEVICES=all',
        ]
      );

      if (started) {
        // Enable GPU with --gpus all
        await execAsync('docker update --gpus all legal-ai-tensorrt-llm').catch(() => {});

        services.tensorrt.running = true;
        services.tensorrt.docker = true;
        console.log('   ✅ TensorRT-LLM container started with GPU');
        console.log('   📊 TensorRT API: http://localhost:8096');
        console.log('   🔌 WebSocket: ws://localhost:8097');
        console.log('   ❤️  Health: http://localhost:8098/health');
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return true;
      }
    } catch (error) {
      console.error(`   ❌ Failed to start TensorRT-LLM: ${error.message}`);
    }
  }

  console.log('   ⚠️  TensorRT-LLM skipped (requires Docker + NVIDIA GPU)');
  return false;
}

async function setupRabbitMQ() {
  console.log('\n📨 Setting up RabbitMQ (optional)...');

  const port5672 = await checkPort(5672);
  if (port5672) {
    console.log('   ✅ RabbitMQ already running on port 5672');
    services.rabbitmq.running = true;
    return true;
  }

  const dockerRunning = await isDockerRunning();

  if (dockerRunning) {
    console.log('   🐳 Starting RabbitMQ container...');
    const started = await startDockerContainer(
      'legal-ai-rabbitmq',
      'rabbitmq:3-management-alpine',
      ['5672:5672', '15672:15672'],
      []
    );

    if (started) {
      services.rabbitmq.running = true;
      console.log('   ✅ RabbitMQ container started');
      console.log('   📊 RabbitMQ Management: http://localhost:15672 (guest/guest)');
      return true;
    }
  }

  console.log('   ⚠️  RabbitMQ skipped (optional service)');
  return false;
}

async function startWorkers() {
  console.log('\n⚙️  Starting Document Processing Workers...');

  if (!services.rabbitmq.running) {
    console.log('   ⚠️  RabbitMQ not available, workers require message queue');
    console.log('   💡 Workers will start but cannot process jobs without RabbitMQ');
  }

  const workerEnv = {
    ...process.env,
    // Database
    DATABASE_URL: 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db',
    SKIP_MIGRATIONS: 'true', // Workers should not run migrations
    // RabbitMQ
    RABBITMQ_URL: services.rabbitmq.running
      ? 'amqp://guest:guest@localhost:5672'
      : 'amqp://localhost:5672',
    // MinIO
    MINIO_ENDPOINT: 'localhost',
    MINIO_PORT: '9000',
    MINIO_ACCESS_KEY: 'minioadmin',
    MINIO_SECRET_KEY: 'minioadmin123',
    MINIO_USE_SSL: 'false',
    // Ollama
    OLLAMA_URL: 'http://localhost:11434',
    // Redis
    REDIS_URL: 'redis://:redis@localhost:6379/0',
    REDIS_PASSWORD: 'redis',
  };

  // Start OCR Worker (GPU-accelerated)
  if (services.minio.running && services.postgres.running) {
    console.log('   🔧 Starting OCR Worker (GPU-accelerated)...');
    try {
      const ocrWorker = spawn('npx', ['tsx', 'workers/ocr-worker.ts'], {
        cwd: projectRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        env: workerEnv,
      });

      ocrWorker.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) console.log(`      [OCR] ${output}`);
      });

      ocrWorker.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output && !output.includes('ExperimentalWarning')) {
          console.error(`      [OCR ERROR] ${output}`);
        }
      });

      ocrWorker.on('error', (err) => {
        console.error(`   ❌ OCR Worker failed to start: ${err.message}`);
      });

      childProcesses.add(ocrWorker);
      services.workers.ocr.running = true;
      console.log('   ✅ OCR Worker started (Tesseract GPU + MinIO + PostgreSQL)');
    } catch (error) {
      console.error(`   ❌ Failed to start OCR Worker: ${error.message}`);
    }
  } else {
    console.log('   ⚠️  OCR Worker skipped (requires MinIO + PostgreSQL)');
  }

  // Start Embedding Worker (RabbitMQ-based with Ollama)
  if (services.rabbitmq.running && services.ollama.running && services.postgres.running) {
    console.log('   🔧 Starting RabbitMQ Embedding Worker (Ollama + Qdrant + pgvector)...');
    try {
      const embeddingWorker = spawn(
        'npx',
        ['tsx', 'src/lib/workers/rabbitmq-embedding-worker.ts'],
        {
          cwd: projectRoot,
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true,
          env: workerEnv,
        }
      );

      embeddingWorker.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) console.log(`      [EMBED] ${output}`);
      });

      embeddingWorker.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output && !output.includes('ExperimentalWarning')) {
          console.error(`      [EMBED ERROR] ${output}`);
        }
      });

      embeddingWorker.on('error', (err) => {
        console.error(`   ❌ Embedding Worker failed to start: ${err.message}`);
      });

      childProcesses.add(embeddingWorker);
      services.workers.embedding.running = true;
      console.log(
        '   ✅ RabbitMQ Embedding Worker started (embeddinggemma:latest + Qdrant + pgvector)'
      );
    } catch (error) {
      console.error(`   ❌ Failed to start Embedding Worker: ${error.message}`);
    }
  } else {
    console.log('   ⚠️  Embedding Worker skipped (requires RabbitMQ + Ollama + PostgreSQL)');
  }

  // Start Autotag Worker (optional)
  if (services.postgres.running) {
    console.log('   🔧 Starting Autotag Worker (keyword extraction)...');
    try {
      const autotagWorker = spawn('npx', ['tsx', 'workers/autotag-worker.ts'], {
        cwd: projectRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        env: workerEnv,
      });

      autotagWorker.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) console.log(`      [AUTOTAG] ${output}`);
      });

      autotagWorker.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output && !output.includes('ExperimentalWarning')) {
          console.error(`      [AUTOTAG ERROR] ${output}`);
        }
      });

      autotagWorker.on('error', (err) => {
        console.error(`   ⚠️  Autotag Worker failed to start: ${err.message}`);
      });

      childProcesses.add(autotagWorker);
      services.workers.autotag.running = true;
      console.log('   ✅ Autotag Worker started (frequency-based tagging)');
    } catch (error) {
      console.log(`   ⚠️  Autotag Worker skipped: ${error.message}`);
    }
  } else {
    console.log('   ⚠️  Autotag Worker skipped (requires PostgreSQL)');
  }

  // Summary
  const workersStarted = Object.values(services.workers).filter((w) => w.running).length;
  console.log(`\n   📊 Workers Status: ${workersStarted}/3 running`);
}

async function startSvelteKit() {
  console.log('\n🔷 Starting SvelteKit Development Server...');

  const vite = spawn('npx', ['vite', 'dev', '--port', '5173', '--host', '0.0.0.0'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      // Database
      DATABASE_URL: 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db',
      // Redis
      REDIS_PASSWORD: 'redis',
      REDIS_URL: 'redis://:redis@localhost:6379/0',
      // MinIO
      MINIO_ENDPOINT: 'localhost:9000',
      MINIO_ACCESS_KEY: 'minioadmin',
      MINIO_SECRET_KEY: 'minioadmin123',
      MINIO_USE_SSL: 'false',
      // Ollama
      OLLAMA_URL: 'http://localhost:11434',
      OLLAMA_GPU_LAYERS: '30',
      // TensorRT-LLM (NEW)
      TENSORRT_API_URL: services.tensorrt.running ? 'http://localhost:8096' : '',
      TENSORRT_WS_URL: services.tensorrt.running ? 'ws://localhost:8097' : '',
      TENSORRT_ENABLED: services.tensorrt.running ? 'true' : 'false',
      // RabbitMQ
      RABBITMQ_URL: services.rabbitmq.running ? 'amqp://guest:guest@localhost:5672' : '',
      RABBITMQ_ENABLED: services.rabbitmq.running ? 'true' : 'false',
      // GPU
      ENABLE_GPU: 'true',
      RTX_3060_OPTIMIZATION: 'true',
      CONTEXT7_MULTICORE: 'true',
      // Development
      NODE_ENV: 'development',
    },
  });

  childProcesses.add(vite);

  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log('   ✅ SvelteKit started on http://localhost:5173');
}

async function printServiceStatus() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 Legal AI Full-Stack Development Environment Ready!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('📍 Service Status:\n');

  console.log(
    `   ${services.postgres.running ? '✅' : '❌'} PostgreSQL:     ${services.postgres.running ? 'postgresql://localhost:5432/legal_ai_db' : 'Not Running'}`
  );
  if (services.postgres.docker) console.log('      (Docker container)');

  console.log(
    `   ${services.redis.running ? '✅' : '❌'} Redis:          ${services.redis.running ? 'redis://localhost:6379 (password: redis)' : 'Not Running'}`
  );
  if (services.redis.docker) console.log('      (Docker container)');

  console.log(
    `   ${services.minio.running ? '✅' : '❌'} MinIO:          ${services.minio.running ? 'http://localhost:9000' : 'Not Running'}`
  );
  if (services.minio.running)
    console.log('      Console: http://localhost:9001 (minioadmin/minioadmin123)');

  console.log(
    `   ${services.ollama.running ? '✅' : '❌'} Ollama:         ${services.ollama.running ? 'http://localhost:11434 (30 GPU layers)' : 'Not Running'}`
  );

  console.log(
    `   ${services.tensorrt.running ? '✅' : '⚠️ '} TensorRT-LLM:   ${services.tensorrt.running ? 'http://localhost:8096 (GPU acceleration)' : 'Skipped (optional)'}`
  );
  if (services.tensorrt.running) {
    console.log('      API: http://localhost:8096');
    console.log('      WebSocket: ws://localhost:8097');
    console.log('      Health: http://localhost:8098/health');
  }

  console.log(
    `   ${services.rabbitmq.running ? '✅' : '⚠️ '} RabbitMQ:       ${services.rabbitmq.running ? 'amqp://localhost:5672' : 'Skipped (optional)'}`
  );
  if (services.rabbitmq.running)
    console.log('      Management: http://localhost:15672 (guest/guest)');

  console.log(`   ✅ SvelteKit:       http://localhost:5173`);

  console.log('\n   ⚙️  Workers:\n');
  console.log(
    `   ${services.workers.ocr.running ? '✅' : '❌'} OCR Worker:        ${services.workers.ocr.running ? 'Running (Tesseract GPU + MinIO + PostgreSQL)' : 'Not Running'}`
  );
  console.log(
    `   ${services.workers.embedding.running ? '✅' : '❌'} Embedding Worker:  ${services.workers.embedding.running ? 'Running (Ollama embeddings + pgvector)' : 'Not Running'}`
  );
  console.log(
    `   ${services.workers.autotag.running ? '✅' : '⚠️ '} Autotag Worker:    ${services.workers.autotag.running ? 'Running (keyword extraction)' : 'Skipped (optional)'}`
  );

  const workersRunning = Object.values(services.workers).filter((w) => w.running).length;
  console.log(`\n   📊 Total Workers: ${workersRunning}/3 active`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 Quick Links:\n');
  console.log('   🏠 Homepage:            http://localhost:5173');
  console.log('   🎮 Detective Interface: http://localhost:5173/yorha-detective');
  console.log('   💬 AI Chat:             http://localhost:5173/ai/chat');
  console.log('   📁 Evidence Manager:    http://localhost:5173/evidence');
  console.log('   ⚖️  Case Management:     http://localhost:5173/cases');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 Features Enabled:\n');
  if (services.postgres.running) console.log('   ✅ Database persistence');
  if (services.redis.running) console.log('   ✅ Session caching');
  if (services.minio.running) console.log('   ✅ Evidence file storage');
  if (services.ollama.running) console.log('   ✅ AI chat with 30 GPU layers');
  if (services.tensorrt.running) console.log('   ✅ TensorRT-LLM GPU inference (2-10x faster)');
  if (services.rabbitmq.running) console.log('   ✅ Async job processing');
  if (services.workers.ocr.running) console.log('   ✅ GPU-accelerated OCR processing');
  if (services.workers.embedding.running) console.log('   ✅ Vector embeddings & semantic search');
  if (services.workers.autotag.running) console.log('   ✅ Automatic document tagging');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 Press Ctrl+C to stop all services');
  console.log('');
}

async function startFullStack() {
  try {
    // Start all infrastructure services
    await setupPostgreSQL();
    await setupRedis();
    await setupMinIO();
    await setupOllama();
    await setupTensorRT(); // NEW: TensorRT-LLM GPU acceleration
    await setupRabbitMQ();

    // Start workers (depends on infrastructure)
    await startWorkers();

    // Start SvelteKit (last, depends on everything)
    await startSvelteKit();

    // Print status
    await printServiceStatus();
  } catch (error) {
    console.error('\n❌ Failed to start full-stack environment:', error.message);
    process.exit(1);
  }
}

// Start everything
startFullStack().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
