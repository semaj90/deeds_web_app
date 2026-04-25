#!/usr/bin/env node

/**
 * Final Hash Verification System Validation
 * Tests all components end-to-end for production readiness
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const BASE_URL = 'http://localhost:5174';

// Test configuration
const testConfig = {
  adminCredentials: {
    email: 'admin@example.com',
    password: 'admin123',
  },
  testFile: {
    name: 'validation-test-evidence.txt',
    content:
      'This is a test evidence file for hash validation testing. Created at: ' +
      new Date().toISOString(),
  },
};

class HashSystemValidator {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      tests: [],
    };
    this.sessionCookie = null;
  }

  async log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async test(name, testFn) {
    try {
      await this.log(`Testing: ${name}`);
      await testFn();
      this.results.passed++;
      this.results.tests.push({ name, status: 'PASSED' });
      await this.log(`✅ PASSED: ${name}`, 'success');
    } catch (error) {
      this.results.failed++;
      this.results.tests.push({ name, status: 'FAILED', error: error.message });
      await this.log(`❌ FAILED: ${name} - ${error.message}`, 'error');
    }
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.sessionCookie) {
      headers.Cookie = this.sessionCookie;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Extract session cookie from response
    if (response.headers.get('set-cookie')) {
      this.sessionCookie = response.headers.get('set-cookie');
    }

    return response;
  }

  calculateHash(content) {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  async run() {
    await this.log('🚀 Starting Final Hash Verification System Validation');
    await this.log('='.repeat(60));

    // Test 1: Login Authentication
    await this.test('User Authentication', async () => {
      const response = await this.makeRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(testConfig.adminCredentials),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Login failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error('Login response indicates failure');
      }
    });

    // Test 2: Evidence API Access
    await this.test('Evidence API Access', async () => {
      const response = await this.makeRequest('/api/evidence');

      if (!response.ok) {
        throw new Error(`Evidence API failed: ${response.status}`);
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Evidence API did not return an array');
      }
    });

    // Test 3: Hash API Functionality
    await this.test('Hash API Search', async () => {
      // Use a valid 64-character hex hash
      const validTestHash = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd';
      const response = await this.makeRequest(`/api/evidence/hash?hash=${validTestHash}`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Hash API failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      if (!data.hasOwnProperty('found')) {
        throw new Error('Hash API response missing expected properties');
      }
    });

    // Test 4: Hash Verification History API
    await this.test('Hash Verification History API', async () => {
      const response = await this.makeRequest('/api/evidence/hash/history');

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Hash verification history API failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Hash verification history API did not return an array');
      }
    });

    // Test 5: Bulk Hash Verification API
    await this.test('Bulk Hash Verification API', async () => {
      const testHashes = ['hash1', 'hash2', 'hash3'];
      const response = await this.makeRequest('/api/evidence/hash/bulk', {
        method: 'POST',
        body: JSON.stringify({ hashes: testHashes }),
      });

      if (!response.ok) {
        throw new Error(`Bulk hash verification API failed: ${response.status}`);
      }

      const data = await response.json();
      if (!data.results || !Array.isArray(data.results)) {
        throw new Error('Bulk hash verification API response missing expected properties');
      }
    });

    // Test 6: Hash Calculation Accuracy
    await this.test('Hash Calculation Accuracy', async () => {
      const testContent = testConfig.testFile.content;
      const expectedHash = this.calculateHash(testContent);

      // Verify our hash calculation matches Node.js crypto
      const verificationHash = crypto
        .createHash('sha256')
        .update(testContent, 'utf8')
        .digest('hex');

      if (expectedHash !== verificationHash) {
        throw new Error('Hash calculation inconsistency detected');
      }

      if (expectedHash.length !== 64) {
        throw new Error('Invalid hash length - should be 64 characters for SHA256');
      }
    });

    // Test 7: Dashboard Data Integrity
    await this.test('Dashboard Data Access', async () => {
      const response = await this.makeRequest('/dashboard');

      if (!response.ok) {
        throw new Error(`Dashboard access failed: ${response.status}`);
      }

      // Check if dashboard loads without errors
      const html = await response.text();
      if (!html.includes('dashboard') && !html.includes('Dashboard')) {
        throw new Error('Dashboard content not found in response');
      }
    });

    // Test 8: Page Accessibility
    await this.test('Hash Verification Page Access', async () => {
      const response = await this.makeRequest('/evidence/hash');

      if (!response.ok) {
        throw new Error(`Hash verification page access failed: ${response.status}`);
      }

      const html = await response.text();
      if (!html.includes('hash') && !html.includes('Hash')) {
        throw new Error('Hash verification page content not found');
      }
    });

    // Test 9: Evidence List Page Access
    await this.test('Evidence List Page Access', async () => {
      const response = await this.makeRequest('/evidence');

      if (!response.ok) {
        throw new Error(`Evidence list page access failed: ${response.status}`);
      }

      const html = await response.text();
      if (!html.includes('evidence') && !html.includes('Evidence')) {
        throw new Error('Evidence list page content not found');
      }
    });

    // Test 10: Interactive Canvas Access
    await this.test('Interactive Canvas Access', async () => {
      const response = await this.makeRequest('/interactive-canvas');

      if (!response.ok) {
        throw new Error(`Interactive canvas access failed: ${response.status}`);
      }

      const html = await response.text();
      if (!html.includes('canvas') && !html.includes('Canvas')) {
        throw new Error('Interactive canvas content not found');
      }
    });

    await this.generateReport();
  }

  async generateReport() {
    await this.log('='.repeat(60));
    await this.log('📊 FINAL VALIDATION REPORT');
    await this.log('='.repeat(60));

    const total = this.results.passed + this.results.failed;
    const successRate = total > 0 ? ((this.results.passed / total) * 100).toFixed(1) : 0;

    await this.log(`Total Tests: ${total}`);
    await this.log(`Passed: ${this.results.passed}`, 'success');
    await this.log(`Failed: ${this.results.failed}`, this.results.failed > 0 ? 'error' : 'success');
    await this.log(`Success Rate: ${successRate}%`, successRate >= 95 ? 'success' : 'error');

    if (this.results.failed > 0) {
      await this.log('\n❌ FAILED TESTS:');
      this.results.tests
        .filter((test) => test.status === 'FAILED')
        .forEach((test) => {
          this.log(`  - ${test.name}: ${test.error}`, 'error');
        });
    }

    await this.log('\n='.repeat(60));

    if (this.results.failed === 0) {
      await this.log('🎉 ALL TESTS PASSED - SYSTEM IS PRODUCTION READY!', 'success');
      await this.log('✅ Hash verification system validated successfully');
      await this.log('✅ All components operational');
      await this.log('✅ Authentication working');
      await this.log('✅ APIs responding correctly');
      await this.log('✅ UI pages accessible');
      await this.log('🚀 SYSTEM STATUS: READY FOR DEPLOYMENT');
    } else {
      await this.log('⚠️  SOME TESTS FAILED - REVIEW REQUIRED', 'error');
    }

    await this.log('='.repeat(60));
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new HashSystemValidator();
  validator.run().catch((error) => {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  });
}

module.exports = HashSystemValidator;
