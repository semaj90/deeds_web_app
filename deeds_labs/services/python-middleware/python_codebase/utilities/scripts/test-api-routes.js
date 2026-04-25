/**
 * API Routes Health Check
 * Tests critical API endpoints to ensure database connectivity works
 * Run: node scripts/test-api-routes.js
 *
 * Prerequisites:
 * - SvelteKit dev server running (npm run dev)
 * - PostgreSQL database running
 */

const API_BASE = process.env.API_BASE || 'http://localhost:5173';

console.log('🔍 Testing API Routes...\n');
console.log(`📦 API Base URL: ${API_BASE}\n`);

async function testRoute(name, options) {
  const { method = 'GET', path, body, expectedStatus = 200, skipBodyCheck = false } = options;

  try {
    console.log(`Testing: ${name}`);
    console.log(`  ${method} ${path}`);

    const fetchOptions = {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
    };

    if (body) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${path}`, fetchOptions);

    if (response.status === expectedStatus) {
      console.log(`  ✅ Status: ${response.status}`);

      if (!skipBodyCheck) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          console.log(`  ✅ Response: JSON (${Object.keys(data).length} keys)`);

          // Show sample of response
          if (data.results && Array.isArray(data.results)) {
            console.log(`     Results: ${data.results.length} items`);
          }
          if (data.status) {
            console.log(`     Status: ${data.status}`);
          }
        } else {
          const text = await response.text();
          console.log(`  ✅ Response: ${text.substring(0, 100)}...`);
        }
      }

      console.log('');
      return true;
    } else {
      console.log(`  ❌ Expected ${expectedStatus}, got ${response.status}`);
      const text = await response.text();
      console.log(`     Error: ${text.substring(0, 200)}`);
      console.log('');
      return false;
    }
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    console.log('');
    return false;
  }
}

async function runTests() {
  const results = [];

  console.log('=== CORE API TESTS ===\n');

  // Test 1: Health check
  results.push(await testRoute('Health Check', {
    path: '/api/health',
    expectedStatus: 200
  }));

  // Test 2: Database health
  results.push(await testRoute('Database Health', {
    path: '/api/health/database',
    expectedStatus: 200
  }));

  console.log('=== DATABASE API TESTS ===\n');

  // Test 3: Legal documents list
  results.push(await testRoute('Legal Documents List', {
    path: '/api/legal-documents',
    expectedStatus: 200
  }));

  // Test 4: Cases list
  results.push(await testRoute('Cases List', {
    path: '/api/cases',
    expectedStatus: 200
  }));

  console.log('=== VECTOR SEARCH TESTS ===\n');

  // Test 5: Vector search (might need data)
  results.push(await testRoute('Vector Search', {
    method: 'POST',
    path: '/api/v1/vector/search',
    body: {
      query: 'contract dispute',
      limit: 5,
      threshold: 0.7
    },
    expectedStatus: 200
  }));

  console.log('=== AI SERVICE TESTS ===\n');

  // Test 6: Ollama status
  results.push(await testRoute('Ollama Status', {
    path: '/api/ollama/status',
    expectedStatus: 200
  }));

  // Test 7: AI chat (might need auth)
  results.push(await testRoute('AI Chat Health', {
    path: '/api/ai/chat',
    method: 'OPTIONS',
    expectedStatus: 200,
    skipBodyCheck: true
  }));

  console.log('=== SERVICE STATUS TESTS ===\n');

  // Test 8: Go microservices status
  results.push(await testRoute('Go Services Status', {
    path: '/api/go/health',
    expectedStatus: 200
  }));

  // Test 9: XState status
  results.push(await testRoute('XState Status', {
    path: '/api/v1/xstate',
    expectedStatus: 200
  }));

  // Summary
  console.log('=== TEST SUMMARY ===\n');
  const passed = results.filter(r => r).length;
  const total = results.length;
  const percentage = ((passed / total) * 100).toFixed(1);

  console.log(`✅ Passed: ${passed}/${total} (${percentage}%)`);
  console.log(`❌ Failed: ${total - passed}/${total}`);

  if (passed === total) {
    console.log('\n🎉 All API routes are working correctly!');
    console.log('   Database connectivity: ✅');
    console.log('   Vector search: ✅');
    console.log('   AI services: ✅\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some routes failed. Check the errors above.');
    console.log('\nTroubleshooting:');
    console.log('1. Ensure dev server is running: npm run dev');
    console.log('2. Check PostgreSQL is running: docker ps');
    console.log('3. Verify DATABASE_URL in .env.development');
    console.log('4. Check for migration errors in logs\n');
    process.exit(1);
  }
}

// Check if server is running first
async function checkServer() {
  try {
    const response = await fetch(`${API_BASE}/`);
    if (response.ok) {
      console.log('✅ SvelteKit dev server is running\n');
      return true;
    }
  } catch (error) {
    console.error('❌ Cannot connect to SvelteKit dev server');
    console.error(`   URL: ${API_BASE}`);
    console.error(`   Error: ${error.message}`);
    console.error('\nPlease start the dev server: npm run dev\n');
    process.exit(1);
  }
}

checkServer().then(runTests);
