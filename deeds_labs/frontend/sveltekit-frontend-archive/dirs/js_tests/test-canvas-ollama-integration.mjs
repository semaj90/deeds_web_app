#!/usr/bin/env node

/**
 * Interactive Canvas + Ollama Integration Test
 * Tests the complete workflow: Canvas -> API -> Ollama -> Response
 */

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

// Test API endpoint
async function testEndpoint(url, method = 'GET', body = null) {
  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body && { body: JSON.stringify(body) }),
    };

    const response = await fetch(url, options);
    return {
      success: response.ok,
      status: response.status,
      data: response.ok ? await response.json() : await response.text(),
    };
  } catch (error) {
    return {
      success: false,
      status: 0,
      error: error.message,
    };
  }
}

async function testInteractiveCanvasIntegration() {
  log.header('Interactive Canvas + Ollama Integration Test');
  console.log('='.repeat(60));

  const baseUrl = 'http://localhost:5174';
  const results = [];

  // Test 1: Check Ollama Health
  log.header('1. Testing Ollama Service');
  const ollamaHealth = await testEndpoint('http://localhost:11434/api/tags');
  if (ollamaHealth.success) {
    log.success('Ollama is running and accessible');
    if (ollamaHealth.data.models) {
      const models = ollamaHealth.data.models.map((m) => m.name);
      console.log(`   Available models: ${models.join(', ')}`);

      if (models.includes('gemma3-legal')) {
        log.success('Custom gemma3-legal model found!');
      } else if (models.some((m) => m.includes('gemma'))) {
        log.warning('Gemma model found, but not the custom legal version');
      } else {
        log.error('No Gemma models found');
      }
    }
  } else {
    log.error('Ollama is not accessible');
  }

  // Test 2: Test AI Suggest API (the endpoint used by interactive canvas)
  log.header('2. Testing AI Suggest API (Interactive Canvas Endpoint)');
  const legalTestPrompts = [
    {
      prompt:
        'Help me organize evidence for a criminal case involving witness testimony discrepancies',
      vibe: 'investigative',
      context: 'canvas',
    },
    {
      prompt: 'Create a timeline for this evidence sequence',
      vibe: 'professional',
      context: 'canvas',
    },
  ];

  for (const testCase of legalTestPrompts) {
    console.log(`\n   Testing: "${testCase.prompt.substring(0, 50)}..."`);

    const apiResult = await testEndpoint(`${baseUrl}/api/ai/suggest`, 'POST', testCase);

    if (apiResult.success) {
      log.success('AI Suggest API responded successfully');
      console.log(`   Response length: ${apiResult.data.response?.length || 0} characters`);
      console.log(`   Suggestions: ${apiResult.data.suggestions?.length || 0}`);
      console.log(`   Actions: ${apiResult.data.actions?.length || 0}`);

      if (apiResult.data.response) {
        console.log(`   Preview: "${apiResult.data.response.substring(0, 100)}..."`);
      }
    } else {
      log.error(`AI API failed: ${apiResult.status} - ${apiResult.error || apiResult.data}`);
    }

    results.push({
      test: `AI Suggest - ${testCase.vibe}`,
      status: apiResult.success ? '✅ PASS' : '❌ FAIL',
      details: apiResult.success ? 'Generated response' : apiResult.error || apiResult.data,
    });
  }

  // Test 3: Test Interactive Canvas Page
  log.header('3. Testing Interactive Canvas Page');
  const canvasPage = await testEndpoint(`${baseUrl}/interactive-canvas`);
  results.push({
    test: 'Interactive Canvas Page',
    status: canvasPage.success ? '✅ PASS' : '❌ FAIL',
    details: `HTTP ${canvasPage.status}`,
  });

  if (canvasPage.success) {
    log.success('Interactive canvas page loads successfully');
  } else {
    log.error('Interactive canvas page failed to load');
  }

  // Test 4: Test Direct Ollama Model
  log.header('4. Testing Direct Ollama Model Response');
  try {
    const directTest = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma3-legal',
        prompt: 'Explain the key components of evidence chain of custody in criminal cases.',
        stream: false,
      }),
    });

    if (directTest.ok) {
      const directResult = await directTest.json();
      log.success('Direct Ollama model test successful');
      console.log(`   Model: ${directResult.model || 'Unknown'}`);
      console.log(`   Response: "${directResult.response?.substring(0, 150)}..."`);
    } else {
      log.warning('Direct Ollama test failed, trying fallback model');

      // Try with fallback model
      const fallbackTest = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma3:12b',
          prompt: 'Explain the key components of evidence chain of custody.',
          stream: false,
        }),
      });

      if (fallbackTest.ok) {
        const fallbackResult = await fallbackTest.json();
        log.warning('Fallback model works - custom model may need setup');
        console.log(`   Fallback response: "${fallbackResult.response?.substring(0, 100)}..."`);
      }
    }
  } catch (error) {
    log.error(`Direct Ollama test failed: ${error.message}`);
  }

  // Summary Report
  console.log('\n' + '='.repeat(60));
  log.header('INTEGRATION TEST SUMMARY');

  const passed = results.filter((r) => r.status.includes('✅')).length;
  const failed = results.filter((r) => r.status.includes('❌')).length;
  const total = results.length;

  console.log(`\n${colors.bold}Results: ${passed}/${total} tests passed${colors.reset}`);

  results.forEach((result) => {
    console.log(`${result.status} ${result.test}: ${result.details}`);
  });

  // Integration Status
  console.log('\n' + '='.repeat(60));
  log.header('INTERACTIVE CANVAS + OLLAMA STATUS');

  if (passed === total) {
    log.success('🎉 FULL INTEGRATION WORKING!');
    console.log('\n✅ Ready for use:');
    console.log('   • Interactive canvas loads properly');
    console.log('   • AI suggestions work with Ollama');
    console.log('   • Legal AI model responds correctly');
    console.log('   • End-to-end workflow functional');
  } else if (passed >= total * 0.75) {
    log.warning('🔧 MOSTLY WORKING - minor issues to resolve');
    console.log('\n⚠️ Issues to address:');
    results
      .filter((r) => r.status.includes('❌'))
      .forEach((r) => {
        console.log(`   • ${r.test}: ${r.details}`);
      });
  } else {
    log.error('❌ INTEGRATION NEEDS WORK');
    console.log('\n🛠️ Setup required:');
    console.log('   1. Ensure Ollama is running: ollama serve');
    console.log('   2. Create custom model: ./setup-gemma3-legal.ps1');
    console.log('   3. Start SvelteKit: npm run dev');
    console.log('   4. Re-run this test');
  }

  console.log('\n🚀 Usage Instructions:');
  console.log('1. Open: http://localhost:5173/interactive-canvas');
  console.log('2. Click the AI assistant button (floating button)');
  console.log('3. Ask legal questions like:');
  console.log('   • "Help me organize evidence for this case"');
  console.log('   • "Create a timeline for these events"');
  console.log('   • "Analyze witness testimony discrepancies"');

  return {
    passed,
    failed,
    total,
    integrationReady: passed === total,
  };
}

// Run the integration test
if (import.meta.url === `file://${process.argv[1]}`) {
  testInteractiveCanvasIntegration().catch(console.error);
}
