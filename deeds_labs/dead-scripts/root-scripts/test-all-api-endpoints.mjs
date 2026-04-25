import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5177';

class APITester {
  constructor() {
    this.testResults = [];
    this.totalTests = 0;
    this.passedTests = 0;
  }

  async test(name, url, expectedConditions = []) {
    this.totalTests++;
    console.log(`\n🧪 Testing: ${name}`);
    console.log(`📍 URL: ${url}`);

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Basic checks
      let passed = true;
      let issues = [];

      // Check if response exists
      if (!data) {
        passed = false;
        issues.push('No data returned');
      }

      // Check if it's not empty mock data
      if (Array.isArray(data)) {
        if (data.length === 0) {
          issues.push('Empty array returned');
        } else {
          // Check for database indicators (UUIDs, proper timestamps, etc.)
          const firstItem = data[0];
          if (firstItem.id && !firstItem.id.includes('mock') && firstItem.id.length > 10) {
            console.log('✅ Database IDs detected');
          } else {
            issues.push('Mock data detected (no proper database IDs)');
          }
        }
      } else if (typeof data === 'object') {
        if (Object.keys(data).length === 0) {
          issues.push('Empty object returned');
        }
      }

      // Custom condition checks
      for (const condition of expectedConditions) {
        try {
          const result = condition(data);
          if (!result.pass) {
            passed = false;
            issues.push(result.message);
          }
        } catch (e) {
          passed = false;
          issues.push(`Condition check failed: ${e.message}`);
        }
      }

      if (passed && issues.length === 0) {
        console.log('✅ PASSED');
        this.passedTests++;
      } else {
        console.log('❌ FAILED');
        console.log(`   Issues: ${issues.join(', ')}`);
      }

      this.testResults.push({
        name,
        url,
        passed,
        issues,
        dataPreview: Array.isArray(data) ? `Array[${data.length}]` : typeof data,
        sampleData: Array.isArray(data) && data.length > 0 ? data[0] : data,
      });
    } catch (error) {
      console.log('❌ FAILED');
      console.log(`   Error: ${error.message}`);

      this.testResults.push({
        name,
        url,
        passed: false,
        issues: [error.message],
        dataPreview: 'Error',
        sampleData: null,
      });
    }
  }

  async testPOST(name, url, payload, expectedConditions = []) {
    this.totalTests++;
    console.log(`\n🧪 Testing POST: ${name}`);
    console.log(`📍 URL: ${url}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      let passed = true;
      let issues = [];

      if (!data) {
        passed = false;
        issues.push('No data returned');
      }

      // Custom condition checks
      for (const condition of expectedConditions) {
        try {
          const result = condition(data);
          if (!result.pass) {
            passed = false;
            issues.push(result.message);
          }
        } catch (e) {
          passed = false;
          issues.push(`Condition check failed: ${e.message}`);
        }
      }

      if (passed && issues.length === 0) {
        console.log('✅ PASSED');
        this.passedTests++;
      } else {
        console.log('❌ FAILED');
        console.log(`   Issues: ${issues.join(', ')}`);
      }

      this.testResults.push({
        name,
        url,
        method: 'POST',
        passed,
        issues,
        dataPreview: Array.isArray(data) ? `Array[${data.length}]` : typeof data,
        sampleData: Array.isArray(data) && data.length > 0 ? data[0] : data,
      });
    } catch (error) {
      console.log('❌ FAILED');
      console.log(`   Error: ${error.message}`);

      this.testResults.push({
        name,
        url,
        method: 'POST',
        passed: false,
        issues: [error.message],
        dataPreview: 'Error',
        sampleData: null,
      });
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 API ENDPOINT TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${this.passedTests}/${this.totalTests}`);
    console.log(`❌ Failed: ${this.totalTests - this.passedTests}/${this.totalTests}`);
    console.log(`📈 Success Rate: ${Math.round((this.passedTests / this.totalTests) * 100)}%`);

    console.log('\n📋 DETAILED RESULTS:');
    this.testResults.forEach((result) => {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${result.name}`);
      if (!result.passed) {
        console.log(`   Issues: ${result.issues.join(', ')}`);
      }
      console.log(`   Preview: ${result.dataPreview}`);
    });

    console.log('\n🗄️  DATABASE INTEGRATION STATUS:');
    const dbIntegratedEndpoints = this.testResults.filter(
      (r) => r.passed && !r.issues.some((i) => i.includes('Mock data detected'))
    ).length;

    console.log(`Database-integrated endpoints: ${dbIntegratedEndpoints}/${this.totalTests}`);

    if (dbIntegratedEndpoints < this.totalTests) {
      console.log('\n⚠️  ENDPOINTS STILL USING MOCK DATA:');
      this.testResults
        .filter((r) => r.issues.some((i) => i.includes('Mock data detected')))
        .forEach((r) => console.log(`   - ${r.name}`));
    }
  }
}

async function runAllTests() {
  const tester = new APITester();

  console.log('🚀 Starting comprehensive API endpoint testing...');
  console.log(`🎯 Target: ${BASE_URL}`);

  // Test all known API endpoints
  await tester.test('Persons of Interest API', `${BASE_URL}/api/persons-of-interest`, [
    (data) => ({
      pass: Array.isArray(data) && data.length > 0,
      message: 'Should return array of persons',
    }),
    (data) => ({
      pass: data.some((p) => p.name && p.threatLevel && p.profileData),
      message: 'Should have proper person structure',
    }),
  ]);

  await tester.test('Cases API', `${BASE_URL}/api/cases`, [
    (data) => ({
      pass: Array.isArray(data) && data.length > 0,
      message: 'Should return array of cases',
    }),
  ]);

  await tester.test('Evidence API', `${BASE_URL}/api/evidence`, [
    (data) => ({
      pass: Array.isArray(data) && data.length > 0,
      message: 'Should return array of evidence',
    }),
  ]);

  await tester.test('Legal Documents API', `${BASE_URL}/api/legal-documents`);

  await tester.test('Activities API', `${BASE_URL}/api/activities`);

  // Test specific case data
  await tester.test(
    'Specific Case API (Test Case)',
    `${BASE_URL}/api/cases/02df1e75-2a9a-40e8-8a1d-b69c86c6b331`
  );

  // Test search endpoints
  await tester.testPOST('Search API', `${BASE_URL}/api/search`, { query: 'test', type: 'persons' });

  // Test chat/AI endpoints
  await tester.testPOST('Chat API', `${BASE_URL}/api/chat`, {
    messages: [{ role: 'user', content: 'Hello' }],
  });

  tester.printSummary();
}

runAllTests().catch(console.error);
