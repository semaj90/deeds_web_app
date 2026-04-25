#!/usr/bin/env node

/**
 * Interactive Canvas System Validation Test
 * Tests all the components and APIs we've implemented
 */

import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Color codes for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  header: (msg) => console.log(`${colors.bold}${colors.cyan}🔍 ${msg}${colors.reset}`),
};

// Test file existence
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Read file content
async function readFile(filePath) {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

// Main validation function
async function validateSystem() {
  log.header('Interactive Canvas System Validation');
  console.log('='.repeat(60));

  let totalTests = 0;
  let passedTests = 0;

  // Core page files
  log.header('Core Page Structure');
  const coreFiles = [
    {
      path: 'src/routes/interactive-canvas/+page.svelte',
      name: 'Interactive Canvas Page',
    },
    {
      path: 'src/routes/interactive-canvas/+page.server.ts',
      name: 'Interactive Canvas Server',
    },
  ];

  for (const file of coreFiles) {
    totalTests++;
    const fullPath = join(__dirname, file.path);
    if (await fileExists(fullPath)) {
      log.success(`${file.name} - File exists`);
      passedTests++;
    } else {
      log.error(`${file.name} - File missing`);
    }
  }

  // API endpoints
  log.header('API Endpoints');
  const apiEndpoints = [
    { path: 'src/routes/api/ai/suggest/+server.ts', name: 'AI Suggest API' },
    { path: 'src/routes/api/canvas/save/+server.ts', name: 'Canvas Save API' },
    { path: 'src/routes/api/qdrant/tag/+server.ts', name: 'Qdrant Tag API' },
  ];

  for (const endpoint of apiEndpoints) {
    totalTests++;
    const fullPath = join(__dirname, endpoint.path);
    const content = await readFile(fullPath);
    if (
      content &&
      (content.includes('export const GET') || content.includes('export const POST'))
    ) {
      log.success(`${endpoint.name} - API endpoint exists`);
      passedTests++;
    } else {
      log.error(`${endpoint.name} - Missing API handler`);
    }
  }

  // Core components
  log.header('Core Components');
  const components = [
    'Sidebar',
    'Header',
    'SearchInput',
    'InfiniteScrollList',
    'Toolbar',
    'AIFabButton',
    'Dialog',
    'SearchBar',
    'TagList',
    'FileUploadSection',
  ];

  for (const component of components) {
    totalTests++;
    const fullPath = join(__dirname, `src/lib/components/${component}.svelte`);
    if (await fileExists(fullPath)) {
      log.success(`${component} Component - File exists`);
      passedTests++;
    } else {
      log.error(`${component} Component - File missing`);
    }
  }

  // Store files
  log.header('Store Systems');
  const stores = ['canvas.ts', 'lokiStore.ts'];
  for (const store of stores) {
    totalTests++;
    const fullPath = join(__dirname, `src/lib/stores/${store}`);
    if (await fileExists(fullPath)) {
      log.success(`${store} Store - File exists`);
      passedTests++;
    } else {
      log.error(`${store} Store - File missing`);
    }
  }

  // Package.json dependencies
  log.header('Dependencies Check');
  totalTests++;
  const packageJsonPath = join(__dirname, 'package.json');
  const packageContent = await readFile(packageJsonPath);

  if (packageContent) {
    const packageJson = JSON.parse(packageContent);
    const requiredDeps = [
      'phosphor-svelte',
      'fuse.js',
      '@fabric.js/fabric',
      'lokijs',
      '@qdrant/js-client-rest',
    ];

    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    const missingDeps = requiredDeps.filter((dep) => !allDeps[dep]);

    if (missingDeps.length === 0) {
      log.success('All required dependencies present');
      passedTests++;
    } else {
      log.error(`Missing dependencies: ${missingDeps.join(', ')}`);
    }
  } else {
    log.error('package.json not found');
  }

  // LLM Integration Check
  log.header('Local LLM Integration');
  totalTests++;
  const ollamaServicePath = join(__dirname, 'src/lib/services/ollama-service.ts');
  const localLlmConfigPath = join(__dirname, 'src/lib/config/local-llm.ts');

  const ollamaServiceExists = await fileExists(ollamaServicePath);
  const localLlmConfigExists = await fileExists(localLlmConfigPath);

  if (ollamaServiceExists && localLlmConfigExists) {
    log.success('Local LLM service files present');
    passedTests++;

    // Check if Ollama is configured in the AI suggest endpoint
    const suggestEndpointPath = join(__dirname, 'src/routes/api/ai/suggest/+server.ts');
    const suggestContent = await readFile(suggestEndpointPath);
    if (suggestContent && suggestContent.includes('ollamaService')) {
      log.success('AI suggest endpoint integrated with Ollama');
    } else {
      log.warning('AI suggest endpoint may not be using Ollama');
    }
  } else {
    log.error('Local LLM service files missing');
  }

  // Final report
  console.log('\n' + '='.repeat(60));
  log.header('VALIDATION SUMMARY');
  console.log(`${colors.bold}Total Tests: ${totalTests}${colors.reset}`);
  console.log(`${colors.green}Passed: ${passedTests}${colors.reset}`);
  console.log(`${colors.red}Failed: ${totalTests - passedTests}${colors.reset}`);

  const successRate = Math.round((passedTests / totalTests) * 100);
  console.log(`${colors.bold}Success Rate: ${successRate}%${colors.reset}`);

  if (successRate >= 90) {
    log.success('🎉 SYSTEM READY FOR TESTING!');
  } else if (successRate >= 75) {
    log.warning('⚠️  System mostly ready, minor issues to resolve');
  } else {
    log.error('❌ System needs significant work before testing');
  }

  // Usage instructions
  console.log('\n' + '='.repeat(60));
  log.header('NEXT STEPS');
  console.log(`${colors.cyan}1. Start dev server: ${colors.bold}npm run dev${colors.reset}`);
  console.log(
    `${colors.cyan}2. Open browser: ${colors.bold}http://localhost:5173/interactive-canvas${colors.reset}`
  );
  console.log(
    `${colors.cyan}3. Test features: Sidebar, Canvas, AI dialog, File upload${colors.reset}`
  );
  console.log(`${colors.cyan}4. Check browser console for any runtime errors${colors.reset}`);

  return {
    passed,
    authRequired,
    failed,
    total: systemReady, failed: failed === 0,
  };
}

// Run validation
validateSystem().catch(console.error);
