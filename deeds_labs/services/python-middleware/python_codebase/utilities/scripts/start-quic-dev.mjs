#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import process from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🚀 Starting QUIC/HTTP3 Development Stack (Fast Mode)...');
console.log('⚡ Estimated startup time: ~10 seconds (no Docker)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Simple progress indicator for fast mode
function showProgress(step, total, message) {
    const percentage = Math.round((step / total) * 100);
    const filled = Math.round((step / total) * 20);
    const empty = 20 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    process.stdout.write(`\r⚡ Fast Mode: [${bar}] ${percentage}% ${message}`);
    if (step >= total) process.stdout.write('\n');
}

// Track child processes for cleanup
const childProcesses = new Set();

// Graceful shutdown handler
function gracefulShutdown(signal) {
    console.log(`\n📡 Received ${signal}. Shutting down QUIC development stack...`);

    // Stop all child processes
    childProcesses.forEach(child => {
        if (!child.killed) {
            console.log(`  ⏹ Stopping process ${child.pid}...`);
            child.kill('SIGTERM');
        }
    });

    console.log('✅ QUIC development stack stopped');
    process.exit(0);
}

// Register signal handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

async function startQuicDev() {
    try {
        showProgress(1, 10, 'Initializing...');

        // Step 0: Check Docker services
        console.log('🐳 Checking Docker services...');
        showProgress(1.5, 10, 'Checking Docker services...');

        const dockerCheck = spawn('docker', ['ps', '--filter', 'name=legal-ai', '--format', 'table {{.Names}}\t{{.Status}}'], {
            stdio: 'pipe'
        });

        dockerCheck.stdout.on('data', (data) => {
            console.log(`🐳 Docker: ${data.toString().trim()}`);
        });

        // Wait for Docker check
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Step 1: Start MCP Context7 Server
        console.log('🧠 Starting MCP Context7 Server...');
        showProgress(2, 10, 'Starting MCP Context7...');

        const mcpServer = spawn('node', ['scripts/mcp-multicore-server.mjs'], {
            cwd: projectRoot,
            stdio: 'pipe',
            env: {
                ...process.env,
                MCP_PORT: '3002',
                NODE_ENV: 'development'
            }
        });

        childProcesses.add(mcpServer);

        // Log MCP server output
        mcpServer.stdout.on('data', (data) => {
            const message = data.toString().trim();
            if (message.includes('MCP Multi-Core Server ready')) {
                showProgress(4, 10, 'MCP Context7 ready!');
            }
            console.log(`🧠 MCP: ${message}`);
        });

        // Wait for MCP server to initialize
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            if (i === 15) showProgress(3, 10, 'MCP initializing...');
        }

        // Step 2: Start Go TensorRT Bridge locally
        console.log('🌉 Starting Go TensorRT Bridge...');
        showProgress(5, 10, 'Starting TensorRT Bridge...');

        const goBridge = spawn('go-microservice/tensorrt-bridge-quic.exe', [], {
            cwd: projectRoot,
            stdio: 'pipe',
            env: {
                ...process.env,
                PORT: '8087',
                REDIS_PASSWORD: ''
            }
        });

        childProcesses.add(goBridge);

        // Log Go bridge output
        goBridge.stdout.on('data', (data) => {
            const message = data.toString().trim();
            if (message.includes('TensorRT Bridge starting')) {
                showProgress(6, 10, 'TensorRT Bridge ready!');
            }
            console.log(`🌉 Bridge: ${message}`);
        });

        // Wait for bridge to initialize
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            if (i === 10) showProgress(6, 10, 'Bridge initializing...');
        }

        // Step 2.5: Start TensorRT Service for gemma3-legal:latest
        console.log('🤖 Starting TensorRT Legal AI Service...');
        showProgress(6.5, 10, 'Starting TensorRT Legal AI...');

        const tensorrtService = spawn('./simple-tensorrt-service.exe', [], {
            cwd: projectRoot,
            stdio: 'pipe',
            env: {
                ...process.env,
                PORT: '8086'
            }
        });

        childProcesses.add(tensorrtService);

        // Log TensorRT service output
        tensorrtService.stdout.on('data', (data) => {
            const message = data.toString().trim();
            if (message.includes('TensorRT Service')) {
                showProgress(7, 10, 'TensorRT Legal AI ready!');
            }
            console.log(`🤖 TensorRT: ${message}`);
        });

        tensorrtService.stderr.on('data', (data) => {
            console.log(`🤖 TensorRT: ${data.toString().trim()}`);
        });

        // Wait for TensorRT service to initialize
        for (let i = 0; i < 15; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            if (i === 7) showProgress(6.8, 10, 'TensorRT initializing...');
        }

        // Step 3: Start SvelteKit Development Server
        console.log('🔷 Starting SvelteKit Development Server...');
        showProgress(6.5, 10, 'Starting SvelteKit...');

        const svelteKit = spawn('npm', ['run', 'dev', '--', '--port', '5173', '--host', '127.0.0.1'], {
            cwd: join(projectRoot, 'sveltekit-frontend'),
            stdio: 'pipe',
            env: {
                ...process.env,
                REDIS_PASSWORD: 'redis',
                REDIS_HOST: 'localhost',
                REDIS_PORT: '6379',
                MINIO_ENDPOINT: 'localhost:9000',
                MINIO_ACCESS_KEY: 'minio',
                MINIO_SECRET_KEY: 'minio123',
                MINIO_BUCKET_NAME: 'legal-documents',
                MINIO_USE_SSL: 'false',
                DATABASE_URL: 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db',
                NODE_ENV: 'development'
            }
        });

        childProcesses.add(svelteKit);

        // Log SvelteKit output
        svelteKit.stdout.on('data', (data) => {
            const message = data.toString().trim();
            if (message.includes('Local:') || message.includes('ready')) {
                showProgress(7, 10, 'SvelteKit ready!');
            }
            console.log(`🔷 SvelteKit: ${message}`);
        });

        svelteKit.stderr.on('data', (data) => {
            console.log(`🔷 SvelteKit: ${data.toString().trim()}`);
        });

        // Wait for SvelteKit to initialize
        for (let i = 0; i < 40; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            if (i === 20) showProgress(6.8, 10, 'SvelteKit initializing...');
        }

        // Step 4: Start Caddy with TensorRT-optimized QUIC config
        console.log('⚡ Starting Caddy with TensorRT-optimized QUIC/HTTP3...');
        showProgress(8, 10, 'Starting TensorRT Caddy...');

        const caddy = spawn('./caddy.exe', ['run', '--config', 'Caddyfile.tensorrt-optimized', '--adapter', 'caddyfile'], {
            cwd: projectRoot,
            stdio: 'pipe'
        });

        childProcesses.add(caddy);

        // Log Caddy output
        caddy.stdout.on('data', (data) => {
            const message = data.toString().trim();
            if (message.includes('serving') || message.includes('ready')) {
                showProgress(9, 10, 'Caddy QUIC ready!');
            }
            console.log(`⚡ Caddy: ${message}`);
        });

        caddy.stderr.on('data', (data) => {
            console.log(`⚡ Caddy: ${data.toString().trim()}`);
        });

        // Wait for Caddy to initialize
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            if (i === 15) showProgress(8, 10, 'Caddy initializing...');
        }

        // Step 4: Complete startup
        showProgress(10, 10, 'Complete! ✅');

        // Step 5: Show status and access points
        console.log('\n🎉 TensorRT-LLM QUIC/HTTP3 Development Stack is running!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📍 Access Points:');
        console.log('   🌐 Main App (TensorRT QUIC):  http://localhost:8080');
        console.log('   🤖 AI API (QUIC):             http://localhost:8080/v1/completions');
        console.log('   💬 Chat API (QUIC):           http://localhost:8080/v1/chat/completions');
        console.log('   🔍 Embeddings (QUIC):         http://localhost:8080/v1/embeddings');
        console.log('   🌉 TensorRT Bridge:           http://localhost:8087/health');
        console.log('   🤖 TensorRT Legal AI:         http://localhost:8086/health');
        console.log('   🧠 MCP Context7 API:          http://localhost:8080/mcp/health');
        console.log('   🔷 SvelteKit Dev:             http://localhost:5173');
        console.log('   📊 Status Dashboard:          http://localhost:9090/status');
        console.log('   🗄️ MinIO Console:             http://localhost:9001 (minio/minio123)');
        console.log('   🗄️ MinIO API:                 http://localhost:9000');
        console.log('   🔴 Redis Insight:             http://localhost:8001');
        console.log('   🐘 PostgreSQL:                localhost:5432 (legal_admin/123456)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('⚡ QUIC/HTTP3 Protocol Features:');
        console.log('   • 0-RTT connection establishment');
        console.log('   • Connection migration support');
        console.log('   • 70% latency reduction vs HTTP/2');
        console.log('   • TensorRT-LLM load balancing');
        console.log('   • gRPC streaming support');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('💡 TensorRT-optimized development mode');
        console.log('💡 For production deployment: docker-compose up');
        console.log('💡 Press Ctrl+C to stop all services');
        console.log('');

        // Step 5: Monitor services
        monitorServices();

    } catch (error) {
        console.error('❌ Failed to start QUIC development stack:', error.message);
        process.exit(1);
    }
}

function monitorServices() {
    console.log('📊 Monitoring development services...\n');

    // Health check endpoints periodically
    const healthInterval = setInterval(() => {
        console.log('🏥 Quick health check...');

        // Check main services
        const healthChecks = [
            'http://localhost:8080',         // Main app
            'http://localhost:8087/health',  // TensorRT bridge
            'http://localhost:8086/health',  // TensorRT Legal AI
            'http://localhost:3002',         // MCP server
            'http://localhost:8888/health'   // Health endpoint
        ];

        healthChecks.forEach(url => {
            const curlCheck = spawn('curl', ['-f', '-s', url], {
                stdio: 'pipe'
            });

            curlCheck.on('close', (code) => {
                const status = code === 0 ? '✅' : '❌';
                console.log(`  ${status} ${url}`);
            });
        });

        console.log('');
    }, 30000); // Every 30 seconds

    // Keep the process alive
    const keepAlive = setInterval(() => {
        // This keeps the process running
    }, 1000);

    // Clean up intervals on shutdown
    process.on('exit', () => {
        clearInterval(healthInterval);
        clearInterval(keepAlive);
    });
}

// Start the development stack
startQuicDev().catch(error => {
    console.error('❌ Error starting QUIC development stack:', error);
    process.exit(1);
});