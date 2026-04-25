#!/usr/bin/env node

/**
 * Legal AI Development Environment Status Checker
 * Checks all services and provides comprehensive status report
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const services = [
  {
    name: 'PostgreSQL',
    port: 5432,
    check: () => {
      try {
        execSync('pg_isready -h localhost -p 5432 -U legal_admin', { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    }
  },
  {
    name: 'Redis',
    port: 6379,
    check: () => {
      try {
        execSync('redis-cli ping', { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    }
  },
  {
    name: 'Ollama',
    port: 11434,
    check: () => {
      try {
        execSync('curl -f http://localhost:11434/api/version', { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    }
  },
  {
    name: 'Qdrant',
    port: 6333,
    check: () => {
      try {
        execSync('curl -f http://localhost:6333/collections', { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    }
  },
  {
    name: 'MinIO',
    port: 9000,
    check: () => {
      try {
        execSync('curl -f http://localhost:9000/minio/health/live', { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    }
  },
  {
    name: 'SvelteKit Dev',
    port: 5173,
    check: () => {
      try {
        execSync('curl -f http://localhost:5173/', { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    }
  },
  {
    name: 'GPU Server',
    port: 8097,
    check: () => {
      try {
        execSync('curl -f http://localhost:8097/health', { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    }
  }
];

function checkService(service) {
  try {
    const isRunning = service.check();
    return {
      name: service.name,
      port: service.port,
      status: isRunning ? '✅ RUNNING' : '❌ DOWN',
      running: isRunning
    };
  } catch (error) {
    return {
      name: service.name,
      port: service.port,
      status: '❌ ERROR',
      running: false
    };
  }
}

function getDockerStatus() {
  try {
    const output = execSync('docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"', { encoding: 'utf8' });
    return output;
  } catch {
    return 'Docker not available or no containers running';
  }
}

function getTypeScriptErrors() {
  try {
    const output = execSync('npm run check:ultra-fast 2>&1 || echo "Check failed"', { encoding: 'utf8' });
    const errorCount = (output.match(/error TS\d+/g) || []).length;
    return errorCount;
  } catch {
    return 'Unable to check';
  }
}

function main() {
  console.log('🚀 Legal AI Development Environment Status');
  console.log('=' .repeat(50));
  console.log('');

  // Check individual services
  console.log('📊 Service Status:');
  const results = services.map(checkService);

  results.forEach(result => {
    console.log(`  ${result.name} (port ${result.port}): ${result.status}`);
  });

  console.log('');

  // Docker status
  console.log('🐳 Docker Containers:');
  const dockerStatus = getDockerStatus();
  console.log(dockerStatus);

  // TypeScript errors
  console.log('🔧 TypeScript Status:');
  const tsErrors = getTypeScriptErrors();
  if (typeof tsErrors === 'number') {
    console.log(`  Errors: ${tsErrors}`);
  } else {
    console.log(`  Status: ${tsErrors}`);
  }

  console.log('');

  // Summary
  const runningCount = results.filter(r => r.running).length;
  const totalCount = results.length;

  console.log('📈 Summary:');
  console.log(`  Services: ${runningCount}/${totalCount} running`);
  console.log(`  Overall: ${runningCount === totalCount ? '✅ All systems operational' : '⚠️ Some services down'}`);

  console.log('');
  console.log('🌐 Access Points:');
  console.log('  Frontend: http://localhost:5173');
  console.log('  GPU Demo: http://localhost:5173/demo/gpu-inference');
  console.log('  MinIO Console: http://localhost:9001');
  console.log('  Ollama API: http://localhost:11434');

  // Exit with appropriate code
  process.exit(runningCount === totalCount ? 0 : 1);
}

main().catch(error => {
  console.error('❌ Status check failed:', error.message);
  process.exit(1);
});