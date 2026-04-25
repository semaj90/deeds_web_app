// Comprehensive CRUD and CMS Database Sync Validation
// Tests all CRUD operations for Cases, Evidence, Reports, and other entities

import { db } from '../lib/server/db/index.js';
import { cases, evidence, reports, users } from '../lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';

/**
 * @typedef {object} TestResult
 * @property {string} operation
 * @property {string} entity
 * @property {boolean} success
 * @property {string} [error]
 * @property {any} [data]
 */

class DatabaseSyncValidator {
  results = [];
  testUserId = 'test-user-id';

  addResult(operation, entity, success, error, data) {
    this.results.push({ operation, entity, success, error, data });
    const status = success ? '✅' : '❌';
    console.log(`${status} ${entity} - ${operation}: ${success ? 'SUCCESS' : error}`);
  }

  async createTestUser() {
    try {
      const testUser = {
        id: this.testUserId,
        email: 'test-crud@example.com',
        name: 'Test CRUD User',
        hashedPassword: 'dummy-hash',
        role: 'prosecutor',
      };

      // Check if user exists first
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.id, this.testUserId))
        .limit(1);

      if (existingUser.length === 0) {
        await db.insert(users).values(testUser);
      }

      this.addResult('CREATE', 'User', true, undefined, {
        id: this.testUserId,
      });
      return this.testUserId;
    } catch (error) {
      this.addResult('CREATE', 'User', false, error.message);
      throw error;
    }
  }

  async testCasesCRUD() {
    console.log('\n🔍 Testing Cases CRUD Operations...');

    try {
      // CREATE
      const newCase = {
        title: 'Test CRUD Case',
        description: 'Testing CRUD operations',
        caseNumber: `CRUD-${Date.now()}`,
        priority: 'medium',
        status: 'open',
        category: 'test',
        jurisdiction: 'Test County',
        tags: ['test', 'crud'],
        metadata: { testData: true },
        createdBy: this.testUserId,
      };

      const [createdCase] = await db.insert(cases).values(newCase).returning();
      this.addResult('CREATE', 'Cases', true, undefined, {
        id: createdCase.id,
      });

      // READ
      const fetchedCase = await db
        .select()
        .from(cases)
        .where(eq(cases.id, createdCase.id))
        .limit(1);

      this.addResult(
        'READ',
        'Cases',
        fetchedCase.length > 0,
        fetchedCase.length === 0 ? 'Case not found after creation' : undefined
      );

      // UPDATE
      const updateData = {
        title: 'Updated Test Case',
        priority: 'high',
        tags: ['updated', 'test'],
        updatedAt: new Date(),
      };

      const [updatedCase] = await db
        .update(cases)
        .set(updateData)
        .where(eq(cases.id, createdCase.id))
        .returning();

      this.addResult(
        'UPDATE',
        'Cases',
        updatedCase && updatedCase.title === 'Updated Test Case',
        updatedCase ? undefined : 'Case update failed'
      );

      // DELETE
      const deletedCases = await db.delete(cases).where(eq(cases.id, createdCase.id)).returning();

      this.addResult(
        'DELETE',
        'Cases',
        deletedCases.length > 0,
        deletedCases.length === 0 ? 'Case deletion failed' : undefined
      );
    } catch (error) {
      this.addResult('CRUD', 'Cases', false, error.message);
    }
  }

  async testEvidenceCRUD() {
    console.log('\n📁 Testing Evidence CRUD Operations...');

    try {
      // First create a test case for evidence
      const testCase = {
        title: 'Evidence Test Case',
        caseNumber: `EV-${Date.now()}`,
        createdBy: this.testUserId,
      };
      const [caseForEvidence] = await db.insert(cases).values(testCase).returning();

      // CREATE
      const newEvidence = {
        title: 'Test Evidence File',
        description: 'Testing evidence CRUD operations',
        caseId: caseForEvidence.id,
        evidenceType: 'document',
        fileType: 'pdf',
        fileName: 'test-evidence.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        hash: 'abc123def456',
        tags: ['test', 'document'],
        isAdmissible: true,
        confidentialityLevel: 'standard',
        uploadedBy: this.testUserId,
      };

      const [createdEvidence] = await db.insert(evidence).values(newEvidence).returning();
      this.addResult('CREATE', 'Evidence', true, undefined, {
        id: createdEvidence.id,
      });

      // READ
      const fetchedEvidence = await db
        .select()
        .from(evidence)
        .where(eq(evidence.id, createdEvidence.id))
        .limit(1);

      this.addResult(
        'READ',
        'Evidence',
        fetchedEvidence.length > 0,
        fetchedEvidence.length === 0 ? 'Evidence not found after creation' : undefined
      );

      // UPDATE
      const updateData = {
        title: 'Updated Evidence File',
        summary: 'Updated summary',
        aiTags: ['ai-processed'],
        updatedAt: new Date(),
      };

      const [updatedEvidence] = await db
        .update(evidence)
        .set(updateData)
        .where(eq(evidence.id, createdEvidence.id))
        .returning();

      this.addResult(
        'UPDATE',
        'Evidence',
        updatedEvidence && updatedEvidence.title === 'Updated Evidence File',
        updatedEvidence ? undefined : 'Evidence update failed'
      );

      // DELETE
      const deletedEvidence = await db
        .delete(evidence)
        .where(eq(evidence.id, createdEvidence.id))
        .returning();

      this.addResult(
        'DELETE',
        'Evidence',
        deletedEvidence.length > 0,
        deletedEvidence.length === 0 ? 'Evidence deletion failed' : undefined
      );

      // Clean up test case
      await db.delete(cases).where(eq(cases.id, caseForEvidence.id));
    } catch (error) {
      this.addResult('CRUD', 'Evidence', false, error.message);
    }
  }

  async testReportsCRUD() {
    console.log('\n📄 Testing Reports CRUD Operations...');

    try {
      // First create a test case for reports
      const testCase = {
        title: 'Reports Test Case',
        caseNumber: `RP-${Date.now()}`,
        createdBy: this.testUserId,
      };
      const [caseForReport] = await db.insert(cases).values(testCase).returning();

      // CREATE
      const newReport = {
        title: 'Test Legal Report',
        content: '<h1>Test Report Content</h1><p>This is test content.</p>',
        caseId: caseForReport.id,
        reportType: 'case_summary',
        status: 'draft',
        isPublic: false,
        tags: ['test', 'legal'],
        metadata: {
          wordCount: 10,
          estimatedReadTime: 1,
          confidentialityLevel: 'restricted',
        },
        createdBy: this.testUserId,
      };

      const [createdReport] = await db.insert(reports).values(newReport).returning();
      this.addResult('CREATE', 'Reports', true, undefined, {
        id: createdReport.id,
      });

      // READ
      const fetchedReport = await db
        .select()
        .from(reports)
        .where(eq(reports.id, createdReport.id))
        .limit(1);

      this.addResult(
        'READ',
        'Reports',
        fetchedReport.length > 0,
        fetchedReport.length === 0 ? 'Report not found after creation' : undefined
      );

      // UPDATE
      const updateData = {
        title: 'Updated Legal Report',
        content: '<h1>Updated Content</h1><p>This is updated content.</p>',
        status: 'published',
        updatedAt: new Date(),
      };

      const [updatedReport] = await db
        .update(reports)
        .set(updateData)
        .where(eq(reports.id, createdReport.id))
        .returning();

      this.addResult(
        'UPDATE',
        'Reports',
        updatedReport && updatedReport.title === 'Updated Legal Report',
        updatedReport ? undefined : 'Report update failed'
      );

      // DELETE
      const deletedReport = await db
        .delete(reports)
        .where(eq(reports.id, createdReport.id))
        .returning();

      this.addResult(
        'DELETE',
        'Reports',
        deletedReport.length > 0,
        deletedReport.length === 0 ? 'Report deletion failed' : undefined
      );

      // Clean up test case
      await db.delete(cases).where(eq(cases.id, caseForReport.id));
    } catch (error) {
      this.addResult('CRUD', 'Reports', false, error.message);
    }
  }

  async testDatabaseConnection() {
    console.log('\n🔌 Testing Database Connection...');

    try {
      // Test basic database connectivity
      const userCount = await db.select().from(users).limit(1);
      this.addResult('CONNECTION', 'Database', true);
    } catch (error) {
      this.addResult('CONNECTION', 'Database', false, error.message);
    }
  }

  async testRelationships() {
    console.log('\n🔗 Testing Database Relationships...');

    try {
      // Create test case
      const testCase = {
        title: 'Relationship Test Case',
        caseNumber: `REL-${Date.now()}`,
        createdBy: this.testUserId,
      };
      const [parentCase] = await db.insert(cases).values(testCase).returning();

      // Create evidence linked to case
      const linkedEvidence = {
        title: 'Linked Evidence',
        evidenceType: 'document',
        caseId: parentCase.id,
        uploadedBy: this.testUserId,
      };
      const [evidence1] = await db.insert(evidence).values(linkedEvidence).returning();

      // Create report linked to case
      const linkedReport = {
        title: 'Linked Report',
        caseId: parentCase.id,
        createdBy: this.testUserId,
      };
      const [report1] = await db.insert(reports).values(linkedReport).returning();

      // Test foreign key relationships by querying related data
      const caseWithEvidence = await db
        .select()
        .from(evidence)
        .where(eq(evidence.caseId, parentCase.id));

      const caseWithReports = await db
        .select()
        .from(reports)
        .where(eq(reports.caseId, parentCase.id));

      this.addResult(
        'RELATIONSHIPS',
        'Foreign Keys',
        caseWithEvidence.length > 0 && caseWithReports.length > 0,
        'Foreign key relationships not working'
      );

      // Clean up
      await db.delete(evidence).where(eq(evidence.id, evidence1.id));
      await db.delete(reports).where(eq(reports.id, report1.id));
      await db.delete(cases).where(eq(cases.id, parentCase.id));
    } catch (error) {
      this.addResult('RELATIONSHIPS', 'Foreign Keys', false, error.message);
    }
  }

  async cleanupTestUser() {
    try {
      await db.delete(users).where(eq(users.id, this.testUserId));
      this.addResult('CLEANUP', 'Test User', true);
    } catch (error) {
      this.addResult('CLEANUP', 'Test User', false, error.message);
    }
  }

  async runFullValidation() {
    console.log('🚀 Starting Comprehensive CRUD & CMS Database Sync Validation');
    console.log('=' * 80);

    try {
      await this.testDatabaseConnection();
      await this.createTestUser();
      await this.testCasesCRUD();
      await this.testEvidenceCRUD();
      await this.testReportsCRUD();
      await this.testRelationships();
      await this.cleanupTestUser();
    } catch (error) {
      console.error('❌ Validation failed:', error);
    }

    this.generateReport();
  }

  generateReport() {
    console.log('\n' + '=' * 80);
    console.log('📊 CRUD & CMS VALIDATION REPORT');
    console.log('=' * 80);

    const totalTests = this.results.length;
    const passedTests = this.results.filter((r) => r.success).length;
    const failedTests = totalTests - passedTests;

    console.log(`\n📈 Summary:`);
    console.log(`  Total Tests: ${totalTests}`);
    console.log(`  Passed: ${passedTests} ✅`);
    console.log(`  Failed: ${failedTests} ❌`);
    console.log(`  Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

    if (failedTests > 0) {
      console.log(`\n❌ Failed Tests:`);
      this.results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`  - ${r.entity} ${r.operation}: ${r.error}`);
        });
    }

    // Test by entity
    const entities = ['Cases', 'Evidence', 'Reports', 'Database'];
    entities.forEach((entity) => {
      const entityTests = this.results.filter((r) => r.entity === entity);
      const entityPassed = entityTests.filter((r) => r.success).length;
      const entityTotal = entityTests.length;

      if (entityTotal > 0) {
        const rate = ((entityPassed / entityTotal) * 100).toFixed(1);
        console.log(`\n${entity}: ${entityPassed}/${entityTotal} (${rate}%)`);
      }
    });

    console.log('\n🎯 CRUD Operations Status:');
    ['CREATE', 'READ', 'UPDATE', 'DELETE'].forEach((op) => {
      const opTests = this.results.filter((r) => r.operation === op);
      const opPassed = opTests.filter((r) => r.success).length;
      console.log(`  ${op}: ${opPassed}/${opTests.length} ✅`);
    });

    const isFullyWorking = failedTests === 0;
    console.log(
      `\n🏆 Overall Status: ${isFullyWorking ? '✅ ALL SYSTEMS OPERATIONAL' : '⚠️ ISSUES DETECTED'}`
    );

    if (isFullyWorking) {
      console.log(
        '\n🎉 All CRUD operations and CMS functionality are properly synced with the database!'
      );
    } else {
      console.log('\n⚠️ Some operations failed. Please review the errors above.');
    }
  }
}

// Export for use in validation scripts
export { DatabaseSyncValidator };

// Run validation if called directly
if (import.meta.env?.NODE_ENV !== 'production') {
  const validator = new DatabaseSyncValidator();
  validator.runFullValidation().catch(console.error);
}
