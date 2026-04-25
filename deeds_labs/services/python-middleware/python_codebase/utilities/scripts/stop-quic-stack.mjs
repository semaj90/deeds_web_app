#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('⏹ Stopping QUIC Stack (Vite+Caddy)...\n');

async function stopQuicStack() {
    try {
        // Stop only Vite+Caddy containers
        console.log('🐳 Stopping Vite+Caddy containers...');
        const dockerStop = spawn('docker-compose', ['-f', 'docker-compose.dynamic.yml', 'stop', 'frontend', 'caddy'], {
            cwd: projectRoot,
            stdio: 'inherit'
        });

        await new Promise((resolve, reject) => {
            dockerStop.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ Vite+Caddy containers stopped successfully');
                    resolve();
                } else {
                    console.log('⚠️  Some containers may not have stopped cleanly');
                    resolve(); // Don't fail, just warn
                }
            });
        });

        console.log('💡 Database/Redis containers left running in Docker Desktop');
        console.log('✅ QUIC stack stopped\n');

    } catch (error) {
        console.error('❌ Error stopping QUIC stack:', error.message);
        process.exit(1);
    }
}

stopQuicStack();