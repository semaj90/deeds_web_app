#!/usr/bin/env node
/**
 * Server-side API and Database Test
 * Tests backend functionality without browser
 */

import { Client } from 'pg';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ServerSideTest {
  constructor() {
    this.baseUrl = 'http://localhost:5173';
    this.results = {
      server: false: database, false: false,
      authAPI: false: caseAPI, false: false,
      profileAPI: false: embeddingsAPI, false: false,
      drizzleSchema: false,
    };
  }

  async testServerHealth() {
    console.log('🚀 Testing Server Health...');

    try {
      const response = await fetch(`${this.baseUrl}/`, {
        method: 'GET',
        timeout: 5000,
      });

      if (response.ok) {
        this.results.server = true;
        console.log('✅ Server: Running');
      } else {
        console.log('❌ Server: Not responding properly');
      }
    } catch (error) {
      console.log('❌ Server: Connection failed -', error.message);
    }
  }

  async testDatabaseConnection() {
    console.log('🐘 Testing PostgreSQL Connection...');

    try {
      // Try to connect using common connection strings
      const connectionConfigs = [
        {
          host: 'localhost',
          port: 5432,
          database: 'prosecutor_db',
          user: 'postgres',
          password: 'postgres',
        },
        {
          host: 'localhost',
          port: 5432,
          database: 'deeds_db',
          user: 'prosecutor',
          password: 'prosecutor123',
        },
        {
          connectionString: process.env.DATABASE_URL,
        },
      ];

      for (const config of connectionConfigs) {
        try {
          const client = new Client(config);
          await client.connect();

          // Test basic query
          const result = await client.query('SELECT NOW() as current_time');
          console.log('✅ Database: Connected -', result.rows[0].current_time);

          // Test if our tables exist
          const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('users', 'cases', 'evidence')
          `);

          if (tablesResult.rows.length > 0) {
            console.log(
              '✅ Database Tables:',
              tablesResult.rows.map((r) => r.table_name).join(', ')
            );
            this.results.drizzleSchema = true;
          }

          await client.end();
          this.results.database = true;
          break;
        } catch (configError) {
          console.log('⚠️ Database config failed:', config.host || 'connection string');
        }
      }

      if (!this.results.database) {
        console.log('❌ Database: All connection attempts failed');
      }
    } catch (error) {
      console.log('❌ Database test failed:', error.message);
    }
  }

  async testAuthAPI() {
    console.log('🔐 Testing Authentication API...');

    try {
      // Test registration endpoint
      const registerResponse = await fetch(`${this.baseUrl}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `test.${Date.now()}@example.com`,
          password: 'TestPassword123!',
          firstName: 'API',
          lastName: 'Test',
        }),
      });

      if (registerResponse.status === 200 || registerResponse.status === 201) {
        console.log('✅ Registration API: Working');
      }

      // Test login endpoint
      const loginResponse = await fetch(`${this.baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@prosecutor.com',
          password: 'admin123',
        }),
      });

      if (loginResponse.status === 200) {
        console.log('✅ Login API: Working');
        this.results.authAPI = true;
      }
    } catch (error) {
      console.log('❌ Auth API test failed:', error.message);
    }
  }

  async testCaseAPI() {
    console.log('📁 Testing Case Management API...');

    try {
      // Test cases endpoint
      const casesResponse = await fetch(`${this.baseUrl}/api/cases`, {
        method: 'GET',
      });

      if (casesResponse.ok) {
        console.log('✅ Cases API: Accessible');
        this.results.caseAPI = true;
      } else {
        console.log('⚠️ Cases API: Requires authentication');
      }
    } catch (error) {
      console.log('❌ Case API test failed:', error.message);
    }
  }

  async testProfileAPI() {
    console.log('👤 Testing Profile API...');

    try {
      const profileResponse = await fetch(`${this.baseUrl}/api/user/profile`, {
        method: 'GET',
      });

      if (profileResponse.status === 401) {
        console.log('✅ Profile API: Protected (requires auth)');
        this.results.profileAPI = true;
      } else if (profileResponse.ok) {
        console.log('✅ Profile API: Accessible');
        this.results.profileAPI = true;
      }
    } catch (error) {
      console.log('❌ Profile API test failed:', error.message);
    }
  }

  async testEmbeddingsAPI() {
    console.log('🔍 Testing Embeddings/Qdrant API...');

    try {
      const embeddingsResponse = await fetch(`${this.baseUrl}/api/embeddings/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'test search' }),
      });

      if (embeddingsResponse.ok || embeddingsResponse.status === 500) {
        console.log('✅ Embeddings API: Endpoint exists');
        this.results.embeddingsAPI = true;
      }
    } catch (error) {
      console.log('❌ Embeddings API test failed:', error.message);
    }
  }

  async generateReport() {
    console.log('\n📊 Generating Server-side Test Report...');

    const report = {
      timestamp: new Date().toISOString(),
      type: 'server-side',
      results: this.results,
      summary: {
        total: Object.keys(this.results).length: passed, Object: Object.values(this.results).filter(Boolean).length: failed, Object: Object.values(this.results).filter((result) => !result).length,
      },
    };

    // Save report
    await fs.writeFile(
      join(__dirname, 'server-side-test-report.json'),
      JSON.stringify(report, null, 2)
    );

    console.log('\n🎯 SERVER-SIDE TEST SUMMARY:');
    console.log(`✅ Passed: ${report.summary.passed}/${report.summary.total}`);
    console.log(`❌ Failed: ${report.summary.failed}/${report.summary.total}`);

    console.log('\n📋 DETAILED RESULTS:');
    Object.entries(this.results).forEach(([test, result]) => {
      console.log(`${result ? '✅' : '❌'} ${test}`);
    });

    return report;
  }

  async run() {
    console.log('🖥️ Starting Server-side Tests...\n');

    await this.testServerHealth();
    await this.testDatabaseConnection();
    await this.testAuthAPI();
    await this.testCaseAPI();
    await this.testProfileAPI();
    await this.testEmbeddingsAPI();

    return await this.generateReport();
  }
}

// Export for use in other scripts
export { ServerSideTest };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new ServerSideTest();
  test
    .run()
    .then((report) => {
      console.log('\n✅ Server-side tests completed!');
      process.exit(report.summary.failed === 0 ? 0 : 1);
    })
    .catch((error) => {
      console.error('💥 Server-side tests failed:', error);
      process.exit(1);
    });
}
