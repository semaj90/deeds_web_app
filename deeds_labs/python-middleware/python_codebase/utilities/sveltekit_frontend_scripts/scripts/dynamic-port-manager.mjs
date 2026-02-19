#!/usr/bin/env node
/**
 * Dynamic Port Manager for Legal AI Platform
 * Automatically finds available ports and manages service coordination
 */

import { createServer } from 'net';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';

class DynamicPortManager {
  constructor() {
    this.portRange = {
      vite: { start: 5173, end: 5200 },
      hmr: { start: 5201, end: 5230 },
      api: { start: 8080, end: 8100 },
      gpu: { start: 8101, end: 8120 },
      ollama: { start: 11434, end: 11450 },
    };

    this.configFile = path.join(process.cwd(), '.port-allocation.json');
    this.loadPortCache();
  }

  loadPortCache() {
    try {
      if (existsSync(this.configFile)) {
        this.portCache = JSON.parse(readFileSync(this.configFile, 'utf8'));
        console.log('📋 Loaded existing port allocations:', this.portCache);
      } else {
        this.portCache = {};
      }
    } catch (error) {
      console.warn('⚠️ Failed to load port cache, starting fresh');
      this.portCache = {};
    }
  }

  savePortCache() {
    try {
      writeFileSync(this.configFile, JSON.stringify(this.portCache, null, 2));
      console.log('💾 Saved port allocations to', this.configFile);
    } catch (error) {
      console.warn('⚠️ Failed to save port cache:', error.message);
    }
  }

  async isPortAvailable(port) {
    return new Promise((resolve) => {
      const server = createServer();

      server.listen(port, () => {
        server.once('close', () => resolve(true));
        server.close();
      });

      server.on('error', () => resolve(false));
    });
  }

  async findAvailablePort(service, preferredPort = null) {
    console.log(`🔍 Finding available port for ${service}...`);

    // Try cached port first
    if (this.portCache[service] && (await this.isPortAvailable(this.portCache[service]))) {
      console.log(`✅ Using cached port ${this.portCache[service]} for ${service}`);
      return this.portCache[service];
    }

    // Try preferred port
    if (preferredPort && (await this.isPortAvailable(preferredPort))) {
      this.portCache[service] = preferredPort;
      console.log(`✅ Using preferred port ${preferredPort} for ${service}`);
      return preferredPort;
    }

    // Find in range
    const range = this.portRange[service] || { start: 3000, end: 3100 };
    for (let port = range.start; port <= range.end; port++) {
      if (await this.isPortAvailable(port)) {
        this.portCache[service] = port;
        console.log(`✅ Allocated port ${port} for ${service}`);
        return port;
      }
    }

    throw new Error(
      `❌ No available ports found for ${service} in range ${range.start}-${range.end}`
    );
  }

  async getPortAllocation() {
    const allocation = {
      vite: await this.findAvailablePort('vite', 5173),
      hmr: await this.findAvailablePort('hmr', null),
      api: await this.findAvailablePort('api', 8080),
      gpu: await this.findAvailablePort('gpu', 8095),
      ollama: await this.findAvailablePort('ollama', 11435),
    };

    // Ensure HMR port is different from Vite port
    if (allocation.hmr === allocation.vite) {
      allocation.hmr = await this.findAvailablePort('hmr', allocation.vite + 1);
    }

    this.savePortCache();
    return allocation;
  }

  async generateEnvFile(allocation) {
    const envContent = `# Auto-generated dynamic port allocation
# Generated: ${new Date().toISOString()}

# Vite Development Server
PORT=${allocation.vite}
VITE_PORT=${allocation.vite}

# HMR (Hot Module Reload)
HMR_PORT=${allocation.hmr}
HMR_HOST=localhost

# API Services
API_PORT=${allocation.api}
GPU_SERVICE_PORT=${allocation.gpu}
OLLAMA_PORT=${allocation.ollama}

# Service URLs
VITE_APP_URL=http://localhost:${allocation.vite}
VITE_API_URL=http://localhost:${allocation.api}
VITE_GPU_SERVICE_URL=http://localhost:${allocation.gpu}
OLLAMA_URL=http://localhost:${allocation.ollama}

# Coordination
SERVICES_COORDINATED=true
DYNAMIC_PORTS=true
`;

    const envPath = path.join(process.cwd(), '.env.local');
    writeFileSync(envPath, envContent);
    console.log('📝 Generated .env.local with dynamic ports');
    console.table(allocation);
  }

  async updateViteConfig(allocation) {
    const viteConfigPath = path.join(process.cwd(), 'vite.config.js');

    try {
      let content = readFileSync(viteConfigPath, 'utf8');

      // Update server config dynamically
      const newServerConfig = `	server: {
		port: ${allocation.vite},
		strictPort: false,
		host: '0.0.0.0',
		hmr: {
			port: ${allocation.hmr},
			host: 'localhost'
		}
	},`;

      content = content.replace(/server:\s*{[\s\S]*?},/, newServerConfig);

      writeFileSync(viteConfigPath, content);
      console.log(
        `🔧 Updated vite.config.js with ports: Vite=${allocation.vite}, HMR=${allocation.hmr}`
      );
    } catch (error) {
      console.warn('⚠️ Failed to update vite.config.js:', error.message);
    }
  }

  async checkConflicts() {
    console.log('🔍 Checking for port conflicts...');
    const conflicts = [];

    for (const [service, port] of Object.entries(this.portCache)) {
      if (!(await this.isPortAvailable(port))) {
        conflicts.push({ service, port });
      }
    }

    if (conflicts.length > 0) {
      console.warn('⚠️ Port conflicts detected:', conflicts);
      return conflicts;
    }

    console.log('✅ No port conflicts detected');
    return [];
  }

  async run() {
    try {
      console.log('🚀 Dynamic Port Manager - Legal AI Platform');
      console.log('=' * 50);

      // Check existing conflicts
      await this.checkConflicts();

      // Get fresh allocation
      const allocation = await this.getPortAllocation();

      // Generate environment file
      await this.generateEnvFile(allocation);

      // Update Vite config
      await this.updateViteConfig(allocation);

      console.log('\n🎯 Dynamic Port Allocation Complete!');
      console.log(`Vite Dev Server: http://localhost:${allocation.vite}`);
      console.log(`HMR WebSocket: ws://localhost:${allocation.hmr}`);
      console.log(`API Services: http://localhost:${allocation.api}`);
      console.log(`GPU Service: http://localhost:${allocation.gpu}`);
      console.log(`Ollama Service: http://localhost:${allocation.ollama}`);

      return allocation;
    } catch (error) {
      console.error('❌ Dynamic port allocation failed:', error.message);
      process.exit(1);
    }
  }
}

// Run if called directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const manager = new DynamicPortManager();
  manager.run();
}

export default DynamicPortManager;
