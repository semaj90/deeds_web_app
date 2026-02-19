#!/usr/bin/env node
/**
 * Test Services and Run Dry-Run Fix
 * ----------------------------------
 * Tests service connectivity and runs fix-any-types.mjs in dry-run mode
 * 
 * Usage:
 *   node scripts/test-dry-run.mjs
 */

import { config } from 'dotenv';
config();

const services = {
  qdrant: {
    name: 'Qdrant Vector DB',
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    healthPath: '/health',
    required: false
  },
  redis: {
    name: 'Redis Cache',
    url: `http://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
    healthPath: '/',
    required: false
  },
  ollama: {
    name: 'Ollama AI',
    url: process.env.OLLAMA_URL || 'http://localhost:11434',
    healthPath: '/api/tags',
    required: false
  },
  goRag: {
    name: 'Go RAG Service',
    url: process.env.GO_RAG_URL || 'http://localhost:8094',
    healthPath: '/health',
    required: false
  }
};

async function checkService(service) {
  try {
    const response = await fetch(`${service.url}${service.healthPath}`, {
      signal: AbortSignal.timeout(3000)
    });
    
    const status = response.ok ? '✅' : '⚠️';
    console.log(`  ${status} ${service.name}: ${response.ok ? 'Healthy' : `Unhealthy (${response.status})`}`);
    return response.ok;
  } catch (error) {
    console.log(`  ❌ ${service.name}: Offline (${service.url})`);
    return false;
  }
}

async function checkAllServices() {
  console.log('🔍 Checking service availability...\n');
  
  const results = {};
  for (const [key, service] of Object.entries(services)) {
    results[key] = await checkService(service);
  }
  
  console.log('');
  
  const availableCount = Object.values(results).filter(Boolean).length;
  const totalCount = Object.keys(results).length;
  
  console.log(`📊 Service Status: ${availableCount}/${totalCount} available\n`);
  
  if (availableCount === 0) {
    console.log('⚠️  No services available - Running in standalone mode');
    console.log('   (This is OK! The fixer works without services)\n');
  } else if (availableCount === totalCount) {
    console.log('✅ All services available - Enhanced mode enabled!\n');
  } else {
    console.log(`ℹ️  ${availableCount} service(s) available - Partial enhancement enabled\n`);
  }
  
  return results;
}

async function runDryRun() {
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('🧪 Running fix-any-types.mjs in DRY-RUN mode...');
  console.log('   Testing on 100 files (no changes will be made)\n');
  console.log('═══════════════════════════════════════════════════════\n');
  
  const { spawn } = await import('child_process');
  
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['scripts/fix-any-types.mjs', '--dry-run', '--sample', '100'], {
      stdio: 'inherit',
      shell: true
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });
  });
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  Phase 43 Service Test & Dry-Run                      ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');
  
  // Check services
  const serviceStatus = await checkAllServices();
  
  // Run dry-run
  try {
    await runDryRun();
    
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ Dry-run complete!\n');
    console.log('📊 Review the output above to see:');
    console.log('   - How many files would be processed');
    console.log('   - How many :any types would be fixed');
    console.log('   - Sample of proposed changes\n');
    console.log('🚀 To apply fixes for real:');
    console.log('   node scripts/fix-any-types.mjs --apply');
    console.log('   OR');
    console.log('   QUICK-FIX.bat\n');
    console.log('═══════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('\n❌ Dry-run failed:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
