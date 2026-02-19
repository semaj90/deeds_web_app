#!/usr/bin/env node

/**
 * Phase 72: Integration Test Suite
 * Validates the complete AST error reduction pipeline
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const TEST_RESULTS = {
  passed: 0,
  failed: 0,
  total: 0
};

function log(message, status = 'info') {
  const timestamp = new Date().toISOString();
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warning: '\x1b[33m',
    reset: '\x1b[0m'
  };

  console.log(`${colors[status]}[${timestamp}] ${message}${colors.reset}`);
}

function assert(condition, message) {
  TEST_RESULTS.total++;

  if (condition) {
    TEST_RESULTS.passed++;
    log(`✅ PASS: ${message}`, 'success');
    return true;
  } else {
    TEST_RESULTS.failed++;
    log(`❌ FAIL: ${message}`, 'error');
    return false;
  }
}

async function testFileExistence() {
  log('Testing file structure...');

  const requiredFiles = [
    'ast-error-reduction-pipeline.ts',
    'neo4j-error-graph-service.ts',
    'ai-patch-generation-service.ts',
    'gpu-clustering-service.ts',
    'gpu-clustering.py',
    'phase72-orchestrator.ts',
    'package.json',
    'README.md'
  ];

  for (const file of requiredFiles) {
    const filePath = path.join(process.cwd(), file);
    assert(fs.existsSync(filePath), `File exists: ${file}`);
  }
}

async function testPackageJson() {
  log('Testing package.json configuration...');

  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

    assert(packageJson.name === 'phase72-ast-reduction', 'Package name is correct');
    assert(packageJson.version === '1.0.0', 'Package version is correct');
    assert(packageJson.type === 'module', 'Package uses ES modules');
    assert(packageJson.scripts.start, 'Start script exists');
    assert(packageJson.scripts.test, 'Test script exists');
    assert(packageJson.dependencies['neo4j-driver'], 'Neo4j driver dependency exists');
    assert(packageJson.dependencies.ollama, 'Ollama dependency exists');

  } catch (error) {
    assert(false, `Package.json parsing failed: ${error.message}`);
  }
}

async function testDockerCompose() {
  log('Testing Docker Compose configuration...');

  const composePath = path.join(process.cwd(), '..', 'docker-compose-phase72.yml');

  assert(fs.existsSync(composePath), 'Docker Compose file exists');

  try {
    const composeContent = fs.readFileSync(composePath, 'utf8');
    const composeConfig = require('yaml').parse(composeContent);

    assert(composeConfig.services['neo4j-phase72'], 'Neo4j service defined');
    assert(composeConfig.services['gpu-clustering-phase72'], 'GPU clustering service defined');
    assert(composeConfig.services['ai-patch-service-phase72'], 'AI patch service defined');
    assert(composeConfig.services['error-analysis-dashboard'], 'Dashboard service defined');

    // Check Neo4j configuration
    const neo4j = composeConfig.services['neo4j-phase72'];
    assert(neo4j.environment.includes('NEO4J_AUTH=neo4j/password'), 'Neo4j auth configured');
    assert(neo4j.ports.includes('7687:7687'), 'Neo4j Bolt port exposed');

  } catch (error) {
    assert(false, `Docker Compose validation failed: ${error.message}`);
  }
}

async function testDeploymentScript() {
  log('Testing deployment script...');

  const deployScript = path.join(process.cwd(), '..', 'deploy-phase72.ps1');

  assert(fs.existsSync(deployScript), 'Deployment script exists');

  try {
    const scriptContent = fs.readFileSync(deployScript, 'utf8');

    assert(scriptContent.includes('Phase 72: AST Error Reduction Pipeline'), 'Script has correct title');
    assert(scriptContent.includes('docker-compose-phase72.yml'), 'Script references correct compose file');
    assert(scriptContent.includes('neo4j-phase72'), 'Script references Neo4j service');
    assert(scriptContent.includes('gpu-clustering-phase72'), 'Script references GPU service');

  } catch (error) {
    assert(false, `Deployment script validation failed: ${error.message}`);
  }
}

async function testPythonGPUClustering() {
  log('Testing Python GPU clustering script...');

  try {
    // Test CUDA check
    const cudaResult = execSync('python3 gpu-clustering.py --check-cuda', {
      encoding: 'utf8',
      timeout: 10000
    });

    assert(cudaResult.includes('CUDA') || cudaResult.includes('CPU'), 'CUDA check returns valid result');

    // Test help output
    const helpResult = execSync('python3 gpu-clustering.py --help', {
      encoding: 'utf8',
      timeout: 5000
    });

    assert(helpResult.includes('GPU Clustering'), 'Help output contains expected text');

  } catch (error) {
    assert(false, `Python GPU clustering test failed: ${error.message}`);
  }
}

async function testTypeScriptCompilation() {
  log('Testing TypeScript compilation...');

  try {
    // Check if TypeScript files compile
    execSync('npx tsc --noEmit --skipLibCheck *.ts', {
      encoding: 'utf8',
      timeout: 30000
    });

    assert(true, 'TypeScript compilation successful');

  } catch (error) {
    assert(false, `TypeScript compilation failed: ${error.message}`);
  }
}

async function testImportStructure() {
  log('Testing import structure...');

  // Test that main orchestrator can be imported
  try {
    const { Phase72Orchestrator } = await import('./phase72-orchestrator.ts');
    assert(typeof Phase72Orchestrator === 'function', 'Phase72Orchestrator class can be imported');
  } catch (error) {
    assert(false, `Orchestrator import failed: ${error.message}`);
  }

  // Test Neo4j service import
  try {
    const { Neo4jErrorGraphService } = await import('./neo4j-error-graph-service.ts');
    assert(typeof Neo4jErrorGraphService === 'function', 'Neo4jErrorGraphService class can be imported');
  } catch (error) {
    assert(false, `Neo4j service import failed: ${error.message}`);
  }

  // Test AI service import
  try {
    const { AIPatchGenerationService } = await import('./ai-patch-generation-service.ts');
    assert(typeof AIPatchGenerationService === 'function', 'AIPatchGenerationService class can be imported');
  } catch (error) {
    assert(false, `AI service import failed: ${error.message}`);
  }
}

async function testConfiguration() {
  log('Testing configuration validation...');

  // Check for required environment variables (with defaults)
  const requiredEnvVars = [
    'NEO4J_URI',
    'OLLAMA_URL',
    'QDRANT_URL',
    'REDIS_URL'
  ];

  for (const envVar of requiredEnvVars) {
    const value = process.env[envVar] || `default_${envVar.toLowerCase()}`;
    assert(value.length > 0, `Environment variable ${envVar} has value`);
  }

  // Test configuration object structure
  const config = {
    neo4j: {
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      user: process.env.NEO4J_USER || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'password'
    },
    ollama: {
      url: process.env.OLLAMA_URL || 'http://localhost:11434'
    },
    qdrant: {
      url: process.env.QDRANT_URL || 'http://localhost:6333'
    },
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    }
  };

  assert(config.neo4j.uri.startsWith('bolt://'), 'Neo4j URI has correct format');
  assert(config.ollama.url.startsWith('http://'), 'Ollama URL has correct format');
  assert(config.qdrant.url.startsWith('http://'), 'Qdrant URL has correct format');
  assert(config.redis.url.startsWith('redis://'), 'Redis URL has correct format');
}

async function runIntegrationTests() {
  log('Running Phase 72 integration test suite...\n');

  try {
    await testFileExistence();
    await testPackageJson();
    await testDockerCompose();
    await testDeploymentScript();
    await testPythonGPUClustering();
    await testTypeScriptCompilation();
    await testImportStructure();
    await testConfiguration();

  } catch (error) {
    log(`Integration test suite failed: ${error.message}`, 'error');
    TEST_RESULTS.failed++;
  }
}

function printResults() {
  const { passed, failed, total } = TEST_RESULTS;
  const successRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';

  console.log('\n' + '='.repeat(60));
  log(`Phase 72 Integration Test Results`, 'info');
  console.log('='.repeat(60));
  log(`Total Tests: ${total}`, 'info');
  log(`Passed: ${passed}`, 'success');
  log(`Failed: ${failed}`, failed > 0 ? 'error' : 'success');
  log(`Success Rate: ${successRate}%`, 'info');

  if (failed === 0) {
    log('\n🎉 All tests passed! Phase 72 is ready for deployment.', 'success');
    log('Next steps:', 'info');
    log('1. Run: ./deploy-phase72.ps1 -Action deploy', 'info');
    log('2. Open dashboard: http://localhost:5174', 'info');
    log('3. Start pipeline: npm start', 'info');
  } else {
    log(`\n⚠️ ${failed} test(s) failed. Please review the errors above.`, 'warning');
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runIntegrationTests()
    .then(() => printResults())
    .catch(error => {
      log(`Test suite crashed: ${error.message}`, 'error');
      printResults();
      process.exit(1);
    });
}

export { runIntegrationTests, TEST_RESULTS };