#!/usr/bin/env node
/**
 * Test Citation Collections API Endpoints
 * Tests all 5 CRUD operations for citation collections
 */

const BASE_URL = 'http://localhost:5173/api';
let collectionId = null;
let citationId = null;

// Helper to make authenticated requests (using dev bypass)
async function apiCall(method, path, body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${path}`, options);
  const data = await response.json();

  return { status: response.status, data };
}

async function runTests() {
  console.log('\n🧪 Testing Citation Collections API\n');

  // Test 1: GET /api/citations/collections (should be empty initially)
  console.log('1️⃣  GET /api/citations/collections');
  const list1 = await apiCall('GET', '/citations/collections');
  console.log(`   Status: ${list1.status}`);
  console.log(`   Collections: ${list1.data.collections?.length || 0}`);
  console.log(`   ✅ ${list1.status === 200 ? 'PASS' : 'FAIL'}\n`);

  // Test 2: POST /api/citations/collections (create collection)
  console.log('2️⃣  POST /api/citations/collections');
  const create = await apiCall('POST', '/citations/collections', {
    name: 'Test Collection',
    description: 'Auto-generated test collection',
    color: '#FF5733',
    isPublic: false,
  });
  console.log(`   Status: ${create.status}`);
  collectionId = create.data.id;
  console.log(`   Collection ID: ${collectionId}`);
  console.log(`   ✅ ${create.status === 201 ? 'PASS' : 'FAIL'}\n`);

  // Test 3: GET /api/citations/collections/[id] (get specific collection)
  console.log('3️⃣  GET /api/citations/collections/[id]');
  const get = await apiCall('GET', `/citations/collections/${collectionId}`);
  console.log(`   Status: ${get.status}`);
  console.log(`   Name: ${get.data.name}`);
  console.log(`   Citations: ${get.data.citations?.length || 0}`);
  console.log(`   ✅ ${get.status === 200 ? 'PASS' : 'FAIL'}\n`);

  // Test 4: PATCH /api/citations/collections/[id] (update collection)
  console.log('4️⃣  PATCH /api/citations/collections/[id]');
  const update = await apiCall('PATCH', `/citations/collections/${collectionId}`, {
    name: 'Updated Test Collection',
    description: 'Updated description',
  });
  console.log(`   Status: ${update.status}`);
  console.log(`   New name: ${update.data.name}`);
  console.log(`   ✅ ${update.status === 200 ? 'PASS' : 'FAIL'}\n`);

  // Test 5: GET /api/citations/collections/[id]/export?format=json
  console.log('5️⃣  GET /api/citations/collections/[id]/export?format=json');
  const exportRes = await fetch(`${BASE_URL}/citations/collections/${collectionId}/export?format=json`);
  const exportData = await exportRes.json();
  console.log(`   Status: ${exportRes.status}`);
  console.log(`   Cache: ${exportRes.headers.get('X-Cache-Status')}`);
  console.log(`   Citations: ${exportData.citations?.length || 0}`);
  console.log(`   ✅ ${exportRes.status === 200 ? 'PASS' : 'FAIL'}\n`);

  // Test 6: DELETE /api/citations/collections/[id] (delete collection)
  console.log('6️⃣  DELETE /api/citations/collections/[id]');
  const del = await apiCall('DELETE', `/citations/collections/${collectionId}`);
  console.log(`   Status: ${del.status}`);
  console.log(`   Success: ${del.data.success}`);
  console.log(`   ✅ ${del.status === 200 ? 'PASS' : 'FAIL'}\n`);

  // Verify deletion
  console.log('7️⃣  Verify deletion (should return 404)');
  const verify = await apiCall('GET', `/citations/collections/${collectionId}`);
  console.log(`   Status: ${verify.status}`);
  console.log(`   ✅ ${verify.status === 404 ? 'PASS' : 'FAIL'}\n`);

  console.log('✅ All tests complete!\n');
}

runTests().catch(console.error);
