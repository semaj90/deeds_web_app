#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import process from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🚀 Starting QUIC/HTTP3 Stack with MCP Context7 Server...');
console.log('⏱️  Estimated startup time: 60-90 seconds (includes Docker build)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Progress bar utilities
function createProgressBar(total, title) {
    let current = 0;

    function update(step, message = '') {
        current = step;
        const percentage = Math.round((current / total) * 100);
        const filled = Math.round((current / total) * 30);
        const empty = 30 - filled;

        const bar = '█'.repeat(filled) + '░'.repeat(empty);
        const progress = `[${bar}] ${percentage}% ${message}`;

        process.stdout.write(`\r${title}: ${progress}`);

        if (current >= total) {
            process.stdout.write('\n');
        }
    }

    return { update };
}

// Overall startup progress
const startupProgress = createProgressBar(100, '🚀 Startup Progress');

// Track child processes for cleanup
const childProcesses = new Set();

// Graceful shutdown handler
function gracefulShutdown(signal) {
    console.log(`\n📡 Received ${signal}. Gracefully shutting down QUIC stack...`);

    // Stop all child processes
    childProcesses.forEach(child => {
        if (!child.killed) {
            console.log(`  ⏹ Stopping process ${child.pid}...`);
            child.kill('SIGTERM');
        }
    });

    // Stop QUIC containers and MCP server
    console.log('  🐳 Stopping QUIC containers...');
    const dockerStop = spawn('docker-compose', ['-f', 'docker-compose.quic.yml', 'stop'], {
        cwd: projectRoot,
        stdio: 'inherit'
    });

    dockerStop.on('close', () => {
        console.log('✅ QUIC stack stopped successfully');
        process.exit(0);
    });

    // Force exit after 10 seconds if graceful shutdown fails
    setTimeout(() => {
        console.log('⚠️  Force exiting...');
        process.exit(1);
    }, 10000);
}

// Register signal handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

async function startQuicStack() {
    try {
        startupProgress.update(5, 'Initializing...');

        // Step 1: Start MCP Context7 Server
        console.log('🧠 Starting MCP Context7 Server...');
        startupProgress.update(10, 'Starting MCP Context7 Server...');

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
                startupProgress.update(20, 'MCP Context7 ready!');
            }
            console.log(`🧠 MCP: ${message}`);
        });

        mcpServer.stderr.on('data', (data) => {
            console.log(`🧠 MCP Error: ${data.toString().trim()}`);
        });

        // Wait for MCP server to initialize with progress updates
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            if (i % 10 === 0) {
                startupProgress.update(15 + (i / 30) * 5, 'MCP Context7 initializing...');
            }
        }

        // Step 2: Start Go TensorRT Bridge
        console.log('🌉 Starting Go TensorRT Bridge...');
        startupProgress.update(25, 'Starting TensorRT Bridge...');

        const goBridge = spawn('go-microservice/tensorrt-bridge-quic.exe', [], {
            cwd: projectRoot,
            stdio: 'pipe',
            env: {
                ...process.env,
                PORT: '8087',
                REDIS_PASSWORD: 'redis'
            }
        });

        childProcesses.add(goBridge);

        // Log Go bridge output
        goBridge.stdout.on('data', (data) => {
            const message = data.toString().trim();
            if (message.includes('TensorRT Bridge starting')) {
                startupProgress.update(30, 'TensorRT Bridge initializing...');
            }
            console.log(`🌉 Bridge: ${message}`);
        });

        goBridge.stderr.on('data', (data) => {
            console.log(`🌉 Bridge Error: ${data.toString().trim()}`);
        });

        // Wait for bridge to initialize with progress
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            if (i % 5 === 0) {
                startupProgress.update(30 + (i / 20) * 5, 'TensorRT Bridge loading...');
            }
        }

        // Step 3: Start QUIC Docker containers
        console.log('🐳 Starting QUIC/HTTP3 containers...');
        startupProgress.update(35, 'Pulling Docker images...');

        const dockerUp = spawn('docker-compose', ['-f', 'docker-compose.quic.yml', 'up', '-d', 'caddy-quic', 'sveltekit-1', 'sveltekit-2', 'postgres', 'redis'], {
            cwd: projectRoot,
            stdio: 'pipe'
        });

        childProcesses.add(dockerUp);

        // Track Docker progress
        let dockerProgress = 35;
        const dockerProgressInterval = setInterval(() => {
            dockerProgress += 2;
            if (dockerProgress <= 75) {
                startupProgress.update(dockerProgress, 'Building containers...');
            }
        }, 3000); // Update every 3 seconds

        dockerUp.stdout.on('data', (data) => {
            const message = data.toString();
            if (message.includes('Pulling')) {
                startupProgress.update(Math.min(dockerProgress + 5, 60), 'Pulling images...');
            } else if (message.includes('Building')) {
                startupProgress.update(Math.min(dockerProgress + 10, 70), 'Building images...');
            } else if (message.includes('Created') || message.includes('Started')) {
                startupProgress.update(Math.min(dockerProgress + 15, 75), 'Starting containers...');
            }
            console.log(`🐳 Docker: ${message.trim()}`);
        });

        dockerUp.stderr.on('data', (data) => {
            console.log(`🐳 Docker: ${data.toString().trim()}`);
        });

        await new Promise((resolve, reject) => {
            dockerUp.on('close', (code) => {
                clearInterval(dockerProgressInterval);
                if (code === 0) {
                    startupProgress.update(80, 'QUIC containers ready!');
                    console.log('✅ QUIC containers started');
                    resolve();
                } else {
                    reject(new Error(`Docker failed with exit code ${code}`));
                }
            });
        });

        // Step 4: Start Caddy with QUIC locally
        console.log('⚡ Starting Caddy with QUIC/HTTP3...');
        startupProgress.update(85, 'Starting Caddy QUIC/HTTP3...');

        const caddy = spawn('./caddy.exe', ['run', '--config', 'Caddyfile.quic-simple'], {
            cwd: projectRoot,
            stdio: 'pipe'
        });

        childProcesses.add(caddy);

        // Log Caddy output
        caddy.stdout.on('data', (data) => {
            const message = data.toString().trim();
            if (message.includes('serving') || message.includes('ready')) {
                startupProgress.update(90, 'Caddy QUIC ready!');
            }
            console.log(`⚡ Caddy: ${message}`);
        });

        caddy.stderr.on('data', (data) => {
            console.log(`⚡ Caddy: ${data.toString().trim()}`);
        });

        // Step 5: Wait for all services to initialize with progress
        console.log('⏳ Waiting for all services to initialize...');
        for (let i = 0; i < 80; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            if (i % 20 === 0) {
                const progress = 90 + (i / 80) * 10;
                startupProgress.update(progress, 'Finalizing startup...');
            }
        }

        // Step 6: Complete startup
        startupProgress.update(100, 'Complete! ✅');

        // Step 7: Show status and access points
        console.log('\n🎉 QUIC/HTTP3 Stack with MCP Context7 is running!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📍 Access Points:');
        console.log('   🌐 Main App (QUIC):           http://localhost:8080');
        console.log('   🔗 API Gateway (QUIC):        http://localhost:8090');
        console.log('   🏥 Health Check:              http://localhost:8888/health');
        console.log('   🌉 TensorRT Bridge:           http://localhost:8087/health');
        console.log('   🧠 MCP Context7 Server:       http://localhost:3002');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 Development Services:');
        console.log('   🎨 SvelteKit Instance 1:      http://localhost:5170 → 5173');
        console.log('   🎨 SvelteKit Instance 2:      http://localhost:5171 → 5174');
        console.log('   🗄️  PostgreSQL:                localhost:5433');
        console.log('   💾 Redis:                     localhost:6379');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('💡 QUIC/HTTP3 enabled with enterprise-grade load balancing');
        console.log('💡 MCP Context7 server provides multi-core AI processing');
        console.log('💡 Press Ctrl+C to stop all services gracefully');
        console.log('');

        // Step 7: Monitor container health
        monitorContainers();

    } catch (error) {
        console.error('❌ Failed to start QUIC stack:', error.message);
        process.exit(1);
    }
}

function monitorContainers() {
    console.log('📊 Monitoring QUIC/HTTP3 stack status...\n');

    const showStatus = () => {
        console.log('🔍 Service Status Check:');

        // Check QUIC containers
        const ps = spawn('docker-compose', ['-f', 'docker-compose.quic.yml', 'ps', '--format', 'table'], {
            cwd: projectRoot,
            stdio: 'inherit'
        });

        ps.on('close', () => {
            console.log('\n⚡ QUIC/HTTP3 stack with MCP Context7 running. Press Ctrl+C to stop.\n');
        });
    };

    // Show initial status
    showStatus();

    // Show status every 45 seconds
    const statusInterval = setInterval(showStatus, 45000);

    // Health check endpoints periodically
    const healthInterval = setInterval(() => {
        console.log('🏥 Quick health check...');

        // Check main services
        const healthChecks = [
            'http://localhost:8080',      // Main app
            'http://localhost:8087/health', // TensorRT bridge
            'http://localhost:3002',      // MCP server
            'http://localhost:8888/health' // Health endpoint
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
    }, 60000); // Every minute

    // Keep the process alive
    const keepAlive = setInterval(() => {
        // This keeps the process running
    }, 1000);

    // Clean up intervals on shutdown
    process.on('exit', () => {
        clearInterval(statusInterval);
        clearInterval(healthInterval);
        clearInterval(keepAlive);
    });
}

// Start the stack
startQuicStack().catch(error => {
    console.error('❌ Error starting QUIC stack:', error);
    process.exit(1);
});