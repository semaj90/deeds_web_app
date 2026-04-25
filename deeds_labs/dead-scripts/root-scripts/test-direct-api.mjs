import { config } from 'dotenv';

// Load environment variables
config();

// Mock the SvelteKit request/response for testing
async function testPersonsOfInterestAPI() {
  console.log('🧪 Testing Persons of Interest API directly...');

  // Set the DATABASE_URL if not set
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
  }

  console.log('🔗 Database URL:', process.env.DATABASE_URL);

  try {
    // Import the API handler dynamically
    const { GET } = await import('./src/routes/api/persons-of-interest/+server.ts');

    // Mock SvelteKit request
    const mockUrl = new URL('http://localhost:5174/api/persons-of-interest');
    const mockRequest = new Request(mockUrl);

    // Create mock event object
    const mockEvent = {
      url: mockUrl,
      request: mockRequest,
      params: {},
      locals: {},
    };

    console.log('📡 Calling API handler...');
    const response = await GET(mockEvent);

    console.log('📋 Response status:', response.status);

    if (response.ok) {
      const data = await response.json();
      console.log('✅ SUCCESS - API returned data:');
      console.log('📊 Data preview:', JSON.stringify(data, null, 2));

      if (data.success && data.data && Array.isArray(data.data)) {
        console.log(`👥 Found ${data.data.length} persons of interest`);
        if (data.data.length > 0) {
          console.log('📝 Sample person:', data.data[0].name);
        }
      }

      return true;
    } else {
      const errorData = await response.json();
      console.log('❌ FAILED - API returned error:');
      console.log('📋 Error data:', JSON.stringify(errorData, null, 2));
      return false;
    }
  } catch (error) {
    console.error('❌ ERROR testing API:', error);

    // Try to get more specific error info
    if (error.code) {
      console.error('📋 Error code:', error.code);
    }
    if (error.message) {
      console.error('📋 Error message:', error.message);
    }

    return false;
  }
}

// Test database connection separately
async function testDatabaseConnection() {
  console.log('\n🔍 Testing database connection...');

  try {
    const { db } = await import('./src/lib/server/db.ts');

    if (!db) {
      console.log('❌ Database connection is null - check DATABASE_URL');
      return false;
    }

    console.log('✅ Database connection initialized');

    // Try a simple query
    const { sql } = await import('drizzle-orm');
    const result = await db.execute(sql`SELECT 1 as test`);
    console.log('✅ Database query successful:', result);

    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

// Run tests
async function runTests() {
  console.log('🚀 Starting direct API tests...\n');

  const dbTest = await testDatabaseConnection();
  const apiTest = await testPersonsOfInterestAPI();

  console.log('\n' + '='.repeat(50));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(50));
  console.log(`Database Connection: ${dbTest ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`API Handler: ${apiTest ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Overall Status: ${dbTest && apiTest ? '✅ ALL TESTS PASSED' : '❌ TESTS FAILED'}`);
}

runTests().catch(console.error);
