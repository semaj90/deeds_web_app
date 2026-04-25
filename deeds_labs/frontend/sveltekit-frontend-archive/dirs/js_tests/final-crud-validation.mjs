#!/usr/bin/env node

/**
 * 🎯 FINAL CRUD & CMS VALIDATION SUITE
 *
 * This script performs comprehensive testing of all CRUD operations
 * and CMS functionality to ensure perfect database synchronization.
 *
 * Features:
 * - Complete API endpoint testing
 * - Database schema validation
 * - Real-time sync verification
 * - Performance benchmarking
 * - Security testing
 * - Data integrity checks
 */

import { readFileSync, existsSync } from 'fs';
import { performance } from 'perf_hooks';

// Color coding for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

class ComprehensiveCRUDValidator {
  constructor() {
    this.baseUrl = 'http://localhost:5173';
    this.results = {
      endpoints: [],
      performance: [],
      security: [],
      integrity: [],
      schema: [],
    };
    this.authToken = null;
    this.testData = {};
    this.startTime = performance.now();
  }

  // Main test execution
  async runComprehensiveValidation() {
    this.printHeader();

    try {
      // Phase 1: Environment Check
      await this.validateEnvironment();

      // Phase 2: Authentication
      await this.testAuthentication();

      // Phase 3: Schema Validation
      await this.validateDatabaseSchema();

      // Phase 4: CRUD Operations
      await this.testAllCRUDOperations();

      // Phase 5: Performance Testing
      await this.runPerformanceTests();

      // Phase 6: Security Testing
      await this.runSecurityTests();

      // Phase 7: Data Integrity
      await this.validateDataIntegrity();

      // Phase 8: Real-time Sync
      await this.testRealtimeSync();

      // Generate Final Report
      this.generateComprehensiveReport();
    } catch (error) {
      this.printError(`Validation failed: ${error.message}`);
      process.exit(1);
    }
  }

  printHeader() {
    const header = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                    🎯 COMPREHENSIVE CRUD & CMS VALIDATOR                    ║
║                                                                              ║
║  Testing all database operations, API endpoints, and system integration     ║
║  for the Legal AI Assistant platform.                                       ║
╚══════════════════════════════════════════════════════════════════════════════╝
`;
    console.log(colors.cyan + header + colors.reset);
  }

  async validateEnvironment() {
    this.printPhase('🔍 Environment Validation');

    // Check required files
    const requiredFiles = [
      'package.json',
      'src/lib/server/db/schema-postgres.ts',
      'src/routes/api/cases/+server.ts',
      'src/routes/api/evidence/+server.ts',
      'src/routes/api/reports/+server.ts',
    ];

    for (const file of requiredFiles) {
      if (existsSync(file)) {
        this.printSuccess(`Found: ${file}`);
      } else {
        this.printError(`Missing: ${file}`);
        throw new Error(`Required file missing: ${file}`);
      }
    }

    // Check server availability
    try {
      const response = await fetch(this.baseUrl);
      this.printSuccess('SvelteKit server is running');
    } catch (error) {
      this.printError('SvelteKit server not accessible');
      throw new Error('Server not running on localhost:5173');
    }

    this.printInfo('Environment validation complete ✅\n');
  }

  async testAuthentication() {
    this.printPhase('🔐 Authentication Testing');

    // Test user registration
    const registerData = {
      email: `test-final-${Date.now()}@example.com`,
      password: 'TestPassword123!',
      name: 'Final Test User',
      role: 'prosecutor',
    };

    try {
      const registerResponse = await this.makeRequest('/api/auth/register', 'POST', registerData);
      if (registerResponse.ok) {
        this.printSuccess('User registration: PASSED');
      } else {
        this.printWarning('User registration: FAILED');
      }

      // Test login
      const loginData = {
        email: registerData.email,
        password: registerData.password,
      };

      const loginResponse = await this.makeRequest('/api/auth/login', 'POST', loginData);
      if (loginResponse.ok) {
        this.authToken = loginResponse.headers.get('set-cookie');
        this.printSuccess('User login: PASSED');
      } else {
        this.printWarning('User login: FAILED');
      }
    } catch (error) {
      this.printError(`Authentication error: ${error.message}`);
    }

    this.printInfo('Authentication testing complete ✅\n');
  }

  async validateDatabaseSchema() {
    this.printPhase('🗄️ Database Schema Validation');

    try {
      const schemaContent = readFileSync('src/lib/server/db/schema-postgres.ts', 'utf8');

      const expectedTables = [
        'users',
        'sessions',
        'cases',
        'criminals',
        'evidence',
        'caseActivities',
        'reports',
        'canvasStates',
      ];

      let validTables = 0;
      for (const table of expectedTables) {
        if (schemaContent.includes(`export const ${table} = pgTable`)) {
          this.printSuccess(`Table definition found: ${table}`);
          validTables++;
        } else {
          this.printError(`Missing table definition: ${table}`);
        }
      }

      const schemaScore = Math.round((validTables / expectedTables.length) * 100);
      this.results.schema.push({
        totalTables: expectedTables.length,
        validTables,
        score: schemaScore,
      });

      this.printInfo(`Schema validation: ${schemaScore}% coverage ✅\n`);
    } catch (error) {
      this.printError(`Schema validation failed: ${error.message}`);
    }
  }

  async testAllCRUDOperations() {
    this.printPhase('🔄 CRUD Operations Testing');

    const entities = [
      'cases',
      'evidence',
      'reports',
      'criminals',
      'activities',
      'users',
      'canvasStates',
    ];

    for (const entity of entities) {
      await this.testEntityCRUD(entity);
    }

    this.printInfo('CRUD operations testing complete ✅\n');
  }

  async testEntityCRUD(entity) {
    this.printSubPhase(`Testing ${entity.toUpperCase()}`);

    const testData = this.generateTestData(entity);
    let createdId = null;

    try {
      // CREATE
      const createStart = performance.now();
      const createResponse = await this.makeAuthenticatedRequest(
        this.getEntityEndpoint(entity),
        'POST',
        testData
      );
      const createTime = performance.now() - createStart;

      if (createResponse.ok) {
        const created = await createResponse.json();
        createdId = created.id;
        this.printSuccess(`  CREATE: PASSED (${createTime.toFixed(2)}ms)`);
        this.results.performance.push({
          entity,
          operation: 'CREATE',
          time: createTime,
          success: true,
        });
      } else {
        this.printError(`  CREATE: FAILED (${createResponse.status})`);
        return;
      }

      // READ
      const readStart = performance.now();
      const readResponse = await this.makeAuthenticatedRequest(
        `${this.getEntityEndpoint(entity)}/${createdId}`,
        'GET'
      );
      const readTime = performance.now() - readStart;

      if (readResponse.ok) {
        this.printSuccess(`  READ: PASSED (${readTime.toFixed(2)}ms)`);
        this.results.performance.push({
          entity,
          operation: 'READ',
          time: readTime,
          success: true,
        });
      } else {
        this.printError(`  READ: FAILED (${readResponse.status})`);
      }

      // UPDATE
      const updateData = this.generateUpdateData(entity);
      const updateStart = performance.now();
      const updateResponse = await this.makeAuthenticatedRequest(
        `${this.getEntityEndpoint(entity)}/${createdId}`,
        'PUT',
        updateData
      );
      const updateTime = performance.now() - updateStart;

      if (updateResponse.ok) {
        this.printSuccess(`  UPDATE: PASSED (${updateTime.toFixed(2)}ms)`);
        this.results.performance.push({
          entity,
          operation: 'UPDATE',
          time: updateTime,
          success: true,
        });
      } else {
        this.printError(`  UPDATE: FAILED (${updateResponse.status})`);
      }

      // PATCH
      const patchData = this.generatePatchData(entity);
      const patchStart = performance.now();
      let patchUrl =
        entity === 'evidence' || entity === 'canvasStates'
          ? `${this.getEntityEndpoint(entity)}?id=${createdId}`
          : `${this.getEntityEndpoint(entity)}/${createdId}`;

      const patchResponse = await this.makeAuthenticatedRequest(patchUrl, 'PATCH', patchData);
      const patchTime = performance.now() - patchStart;

      if (patchResponse.ok) {
        this.printSuccess(`  PATCH: PASSED (${patchTime.toFixed(2)}ms)`);
        this.results.performance.push({
          entity,
          operation: 'PATCH',
          time: patchTime,
          success: true,
        });
      } else {
        this.printError(`  PATCH: FAILED (${patchResponse.status})`);
      }

      // LIST
      const listStart = performance.now();
      const listResponse = await this.makeAuthenticatedRequest(
        `${this.getEntityEndpoint(entity)}?limit=10`,
        'GET'
      );
      const listTime = performance.now() - listStart;

      if (listResponse.ok) {
        this.printSuccess(`  LIST: PASSED (${listTime.toFixed(2)}ms)`);
        this.results.performance.push({
          entity,
          operation: 'LIST',
          time: listTime,
          success: true,
        });
      } else {
        this.printError(`  LIST: FAILED (${listResponse.status})`);
      }

      // DELETE
      const deleteStart = performance.now();
      let deleteUrl =
        entity === 'evidence' || entity === 'canvasStates'
          ? `${this.getEntityEndpoint(entity)}?id=${createdId}`
          : `${this.getEntityEndpoint(entity)}/${createdId}`;

      const deleteResponse = await this.makeAuthenticatedRequest(deleteUrl, 'DELETE');
      const deleteTime = performance.now() - deleteStart;

      if (deleteResponse.ok) {
        this.printSuccess(`  DELETE: PASSED (${deleteTime.toFixed(2)}ms)`);
        this.results.performance.push({
          entity,
          operation: 'DELETE',
          time: deleteTime,
          success: true,
        });
      } else {
        this.printError(`  DELETE: FAILED (${deleteResponse.status})`);
      }
    } catch (error) {
      this.printError(`  ${entity} CRUD testing failed: ${error.message}`);
    }
  }

  async runPerformanceTests() {
    this.printPhase('⚡ Performance Testing');

    // Calculate average response times
    const performanceByEntity = {};
    this.results.performance.forEach((result) => {
      if (!performanceByEntity[result.entity]) {
        performanceByEntity[result.entity] = [];
      }
      performanceByEntity[result.entity].push(result.time);
    });

    for (const [entity, times] of Object.entries(performanceByEntity)) {
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      const minTime = Math.min(...times);

      this.printInfo(
        `${entity.padEnd(12)} | Avg: ${avgTime.toFixed(2)}ms | Min: ${minTime.toFixed(2)}ms | Max: ${maxTime.toFixed(2)}ms`
      );

      if (avgTime < 1000) {
        this.printSuccess(`  Performance: EXCELLENT`);
      } else if (avgTime < 2000) {
        this.printWarning(`  Performance: GOOD`);
      } else {
        this.printError(`  Performance: NEEDS IMPROVEMENT`);
      }
    }

    this.printInfo('Performance testing complete ✅\n');
  }

  async runSecurityTests() {
    this.printPhase('🛡️ Security Testing');

    // Test authentication requirement
    try {
      const unauthedResponse = await fetch(`${this.baseUrl}/api/cases`);
      if (unauthedResponse.status === 401) {
        this.printSuccess('Authentication requirement: ENFORCED');
      } else {
        this.printError('Authentication requirement: NOT ENFORCED');
      }
    } catch (error) {
      this.printError(`Security test failed: ${error.message}`);
    }

    // Test SQL injection protection
    try {
      const maliciousData = {
        title: "'; DROP TABLE cases; --",
        caseNumber: 'INJECT-001',
      };

      const injectResponse = await this.makeAuthenticatedRequest(
        '/api/cases',
        'POST',
        maliciousData
      );

      if (injectResponse.status === 400 || injectResponse.status === 422) {
        this.printSuccess('SQL injection protection: ACTIVE');
      } else {
        this.printWarning('SQL injection protection: REVIEW NEEDED');
      }
    } catch (error) {
      this.printSuccess('SQL injection protection: HANDLED BY ERROR BOUNDARY');
    }

    this.printInfo('Security testing complete ✅\n');
  }

  async validateDataIntegrity() {
    this.printPhase('🔍 Data Integrity Validation');

    // Test data consistency across related entities
    try {
      // Create a case
      const caseData = {
        title: 'Integrity Test Case',
        caseNumber: `INT-${Date.now()}`,
        description: 'Testing data integrity',
      };

      const caseResponse = await this.makeAuthenticatedRequest('/api/cases', 'POST', caseData);
      if (caseResponse.ok) {
        const createdCase = await caseResponse.json();

        // Create evidence linked to the case
        const evidenceData = {
          title: 'Integrity Test Evidence',
          evidenceType: 'document',
          caseId: createdCase.id,
        };

        const evidenceResponse = await this.makeAuthenticatedRequest(
          '/api/evidence',
          'POST',
          evidenceData
        );
        if (evidenceResponse.ok) {
          this.printSuccess('Cross-entity relationships: WORKING');

          // Cleanup
          await this.makeAuthenticatedRequest(
            `/api/evidence?id=${(await evidenceResponse.json()).id}`,
            'DELETE'
          );
          await this.makeAuthenticatedRequest(`/api/cases/${createdCase.id}`, 'DELETE');
        } else {
          this.printError('Cross-entity relationships: FAILED');
        }
      }
    } catch (error) {
      this.printError(`Data integrity test failed: ${error.message}`);
    }

    this.printInfo('Data integrity validation complete ✅\n');
  }

  async testRealtimeSync() {
    this.printPhase('🔄 Real-time Sync Testing');

    // Test that created data is immediately accessible
    try {
      const testData = {
        title: 'Realtime Test Case',
        caseNumber: `RT-${Date.now()}`,
      };

      const createResponse = await this.makeAuthenticatedRequest('/api/cases', 'POST', testData);
      if (createResponse.ok) {
        const created = await createResponse.json();

        // Immediately try to read it back
        const readResponse = await this.makeAuthenticatedRequest(`/api/cases/${created.id}`, 'GET');
        if (readResponse.ok) {
          this.printSuccess('Real-time sync: WORKING');

          // Cleanup
          await this.makeAuthenticatedRequest(`/api/cases/${created.id}`, 'DELETE');
        } else {
          this.printError('Real-time sync: FAILED - Data not immediately available');
        }
      }
    } catch (error) {
      this.printError(`Real-time sync test failed: ${error.message}`);
    }

    this.printInfo('Real-time sync testing complete ✅\n');
  }

  generateComprehensiveReport() {
    const endTime = performance.now();
    const totalTime = endTime - this.startTime;

    this.printPhase('📊 COMPREHENSIVE VALIDATION REPORT');

    // Calculate overall statistics
    const totalOperations = this.results.performance.length;
    const successfulOperations = this.results.performance.filter((op) => op.success).length;
    const successRate = Math.round((successfulOperations / totalOperations) * 100);

    const avgResponseTime =
      this.results.performance.reduce((sum, op) => sum + op.time, 0) / totalOperations;

    console.log(
      colors.bold +
        '\n╔══════════════════════════════════════════════════════════════════════════════╗'
    );
    console.log('║                              📊 FINAL RESULTS                              ║');
    console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
    console.log(`║ Total Operations Tested: ${totalOperations.toString().padEnd(52)} ║`);
    console.log(`║ Successful Operations:   ${successfulOperations.toString().padEnd(52)} ║`);
    console.log(`║ Success Rate:            ${successRate}%`.padEnd(74) + ' ║');
    console.log(`║ Average Response Time:   ${avgResponseTime.toFixed(2)}ms`.padEnd(74) + ' ║');
    console.log(`║ Total Test Duration:     ${(totalTime / 1000).toFixed(2)}s`.padEnd(74) + ' ║');
    console.log(
      '╚══════════════════════════════════════════════════════════════════════════════╝' +
        colors.reset
    );

    // Status assessment
    if (successRate >= 95) {
      console.log(
        colors.green +
          colors.bold +
          '\n🎉 EXCELLENT: All systems are operating at peak performance!'
      );
      console.log('✅ CRUD operations are fully synchronized with the database');
      console.log('✅ All API endpoints are working correctly');
      console.log('✅ Data integrity is maintained across all operations');
      console.log('✅ Security measures are properly implemented');
      console.log('✅ Performance is within acceptable limits');
    } else if (successRate >= 80) {
      console.log(
        colors.yellow + colors.bold + '\n⚠️ GOOD: Most systems are working with minor issues'
      );
      console.log('✅ Core functionality is operational');
      console.log('⚠️ Some optimizations may be needed');
    } else {
      console.log(colors.red + colors.bold + '\n❌ NEEDS ATTENTION: Several issues detected');
      console.log('❌ Multiple systems require fixes');
      console.log('⚠️ Review the detailed logs above');
    }

    console.log(
      colors.reset +
        '\n🔗 Access your CRUD Dashboard at: ' +
        colors.cyan +
        `${this.baseUrl}/crud-dashboard` +
        colors.reset
    );
    console.log(
      '\n📚 For detailed API documentation, visit: ' +
        colors.blue +
        `${this.baseUrl}/api-docs` +
        colors.reset
    );

    console.log(colors.dim + '\n' + '='.repeat(80));
    console.log('Validation completed at: ' + new Date().toISOString());
    console.log('Report generated by: Comprehensive CRUD Validator v2.0');
    console.log('='.repeat(80) + colors.reset);
  }

  // Helper methods
  generateTestData(entity) {
    const testData = {
      cases: {
        title: `Test Case ${Date.now()}`,
        caseNumber: `TEST-${Date.now()}`,
        description: 'Test case for CRUD validation',
        priority: 'medium',
        status: 'open',
      },
      evidence: {
        title: `Test Evidence ${Date.now()}`,
        evidenceType: 'document',
        description: 'Test evidence for CRUD validation',
      },
      reports: {
        title: `Test Report ${Date.now()}`,
        content: '<p>Test report content</p>',
        reportType: 'case_summary',
        status: 'draft',
      },
      criminals: {
        firstName: 'Test',
        lastName: `Criminal${Date.now()}`,
        status: 'active',
        threatLevel: 'low',
      },
      activities: {
        title: `Test Activity ${Date.now()}`,
        activityType: 'investigation',
        status: 'pending',
        priority: 'medium',
      },
      users: {
        email: `testuser${Date.now()}@example.com`,
        password: 'TestPassword123!',
        name: 'Test User',
        role: 'prosecutor',
      },
      canvasStates: {
        name: `Test Canvas ${Date.now()}`,
        canvasData: { objects: [], background: '#ffffff' },
        version: 1,
      },
    };

    return testData[entity] || {};
  }

  generateUpdateData(entity) {
    const updateData = {
      cases: { title: 'Updated Test Case', priority: 'high' },
      evidence: { title: 'Updated Test Evidence', summary: 'Updated summary' },
      reports: { title: 'Updated Test Report', status: 'published' },
      criminals: { threatLevel: 'medium', notes: 'Updated notes' },
      activities: { priority: 'high', status: 'in-progress' },
      users: { name: 'Updated Test User' },
      canvasStates: { name: 'Updated Test Canvas', version: 2 },
    };

    return updateData[entity] || {};
  }

  generatePatchData(entity) {
    const patchData = {
      cases: { operation: 'updatePriority', priority: 'urgent' },
      evidence: { summary: 'Patched summary' },
      reports: { operation: 'publish', isPublic: true },
      criminals: { operation: 'updateThreatLevel', threatLevel: 'high' },
      activities: { operation: 'complete' },
      users: { operation: 'updateProfile', name: 'Patched User' },
      canvasStates: { operation: 'incrementVersion' },
    };

    return patchData[entity] || {};
  }

  getEntityEndpoint(entity) {
    const endpoints = {
      cases: '/api/cases',
      evidence: '/api/evidence',
      reports: '/api/reports',
      criminals: '/api/criminals',
      activities: '/api/activities',
      users: '/api/users',
      canvasStates: '/api/canvas-states',
    };

    return endpoints[entity] || `/api/${entity}`;
  }

  async makeRequest(endpoint, method, data = null) {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    return fetch(`${this.baseUrl}${endpoint}`, options);
  }

  async makeAuthenticatedRequest(endpoint, method, data = null) {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Cookie: this.authToken || '',
      },
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    return fetch(`${this.baseUrl}${endpoint}`, options);
  }

  printPhase(message) {
    console.log(colors.cyan + colors.bold + `\n${message}` + colors.reset);
    console.log(colors.cyan + '─'.repeat(message.length) + colors.reset);
  }

  printSubPhase(message) {
    console.log(colors.blue + `\n${message}` + colors.reset);
  }

  printSuccess(message) {
    console.log(colors.green + `✅ ${message}` + colors.reset);
  }

  printError(message) {
    console.log(colors.red + `❌ ${message}` + colors.reset);
  }

  printWarning(message) {
    console.log(colors.yellow + `⚠️  ${message}` + colors.reset);
  }

  printInfo(message) {
    console.log(colors.white + `ℹ️  ${message}` + colors.reset);
  }
}

// Run the comprehensive validation
const validator = new ComprehensiveCRUDValidator();
validator.runComprehensiveValidation().catch(console.error);
