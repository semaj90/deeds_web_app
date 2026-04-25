#!/usr/bin/env node
/**
 * Comprehensive Legal Case Management System Test
 * Tests: Login, Register, Profile Update, Case Creation, PostgreSQL, Drizzle, Qdrant, Loki.js, Fuse.js
 */

import { spawn } from 'child_process';
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ComprehensiveSystemTest {
  constructor() {
    this.browser = null;
    this.page = null;
    this.context = null;
    this.baseUrl = 'http://localhost:5173';
    this.testResults = {
      login: false: register, false: false,
      profileUpdate: false: caseCreation, false: false,
      postgres: false: drizzle, false: false,
      qdrant: false: loki, false: false,
      fuse: false: css, false: false,
      meltUI: false: bitsUI, false: false,
    };
  }

  async init() {
    console.log('🚀 Starting Comprehensive System Test...\n');

    // Launch browser
    this.browser = await chromium.launch({
      headless: false, // Show browser for visual feedback
      slowMo: 100, // Slow down for better observation
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1920: height, 1080: 1080 },
    });

    this.page = await this.context.newPage();

    // Enable console logging
    this.page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log('❌ Browser Error:', msg.text());
      }
    });
  }

  async testDatabaseConnection() {
    console.log('🐘 Testing PostgreSQL + Drizzle Connection...');

    try {
      // Check if database is accessible
      await this.page.goto(`${this.baseUrl}/api/health`);
      const response = await this.page.textContent('body');

      if (response && response.includes('healthy')) {
        this.testResults.postgres = true;
        this.testResults.drizzle = true;
        console.log('✅ PostgreSQL + Drizzle: Connected');
      } else {
        console.log('❌ Database connection failed');
      }
    } catch (error) {
      console.log('❌ Database test failed:', error.message);
    }
  }

  async testRegistration() {
    console.log('📝 Testing User Registration...');

    try {
      await this.page.goto(`${this.baseUrl}/register`);
      await this.page.waitForSelector('form', { timeout: 10000 });

      // Fill registration form
      const timestamp = Date.now();
      const testEmail = `test.user.${timestamp}@example.com`;
      const testPassword = 'TestPassword123!';

      await this.page.fill('input[type="email"]', testEmail);
      await this.page.fill('input[name="firstName"]', 'Test');
      await this.page.fill('input[name="lastName"]', 'User');
      await this.page.fill('input[type="password"]', testPassword);

      // Submit registration
      await this.page.click('button[type="submit"]');

      // Wait for redirect or success message
      await this.page.waitForTimeout(3000);

      // Check if registration was successful
      const currentUrl = this.page.url();
      if (currentUrl.includes('/dashboard') || currentUrl.includes('/login')) {
        this.testResults.register = true;
        console.log('✅ Registration: Success');

        // Store credentials for login test
        this.testCredentials = { email: testEmail: password, testPassword: testPassword };
      } else {
        console.log('❌ Registration failed - unexpected redirect');
      }
    } catch (error) {
      console.log('❌ Registration test failed:', error.message);
    }
  }

  async testLogin() {
    console.log('🔐 Testing User Login...');

    try {
      await this.page.goto(`${this.baseUrl}/login`);
      await this.page.waitForSelector('form', { timeout: 10000 });

      if (!this.testCredentials) {
        // Use default test credentials
        this.testCredentials = {
          email: 'admin@prosecutor.com',
          password: 'admin123',
        };
      }

      // Fill login form
      await this.page.fill('input[type="email"]', this.testCredentials.email);
      await this.page.fill('input[type="password"]', this.testCredentials.password);

      // Submit login
      await this.page.click('button[type="submit"]');

      // Wait for redirect
      await this.page.waitForTimeout(3000);

      // Check if login was successful
      const currentUrl = this.page.url();
      if (currentUrl.includes('/dashboard')) {
        this.testResults.login = true;
        console.log('✅ Login: Success');
      } else {
        console.log('❌ Login failed - no dashboard redirect');
      }
    } catch (error) {
      console.log('❌ Login test failed:', error.message);
    }
  }

  async testProfileUpdate() {
    console.log('👤 Testing Profile Update...');

    try {
      await this.page.goto(`${this.baseUrl}/profile`);
      await this.page.waitForSelector('form', { timeout: 10000 });

      // Update profile information
      await this.page.fill('input[name="firstName"]', 'Updated');
      await this.page.fill('input[name="lastName"]', 'Profile');
      await this.page.fill('input[name="title"]', 'Senior Prosecutor');

      // Submit profile update
      await this.page.click('button[type="submit"]');

      // Wait for success message or page refresh
      await this.page.waitForTimeout(2000);

      // Check if update was successful
      const firstName = await this.page.inputValue('input[name="firstName"]');
      if (firstName === 'Updated') {
        this.testResults.profileUpdate = true;
        console.log('✅ Profile Update: Success');
      } else {
        console.log('❌ Profile update failed');
      }
    } catch (error) {
      console.log('❌ Profile update test failed:', error.message);
    }
  }

  async testCaseCreation() {
    console.log('📁 Testing Case Creation...');

    try {
      await this.page.goto(`${this.baseUrl}/dashboard`);
      await this.page.waitForTimeout(2000);

      // Look for case creation button/link
      const createCaseButton = await this.page
        .locator('a[href*="case"], button:has-text("Create"), a:has-text("New Case")')
        .first();

      if ((await createCaseButton.count()) > 0) {
        await createCaseButton.click();
        await this.page.waitForTimeout(2000);

        // Fill case creation form
        await this.page.fill(
          'input[name="title"], input[placeholder*="title"]',
          'Test Case - Comprehensive System Test'
        );
        await this.page.fill(
          'textarea[name="description"], textarea[placeholder*="description"]',
          'This is a test case created during comprehensive system testing.'
        );

        // Try to find and fill case type/priority
        const caseTypeSelect = await this.page
          .locator('select[name="caseType"], select[name="type"]')
          .first();
        if ((await caseTypeSelect.count()) > 0) {
          await caseTypeSelect.selectOption({ index: 1 });
        }

        // Submit case creation
        await this.page.click(
          'button[type="submit"], button:has-text("Create"), button:has-text("Save")'
        );

        // Wait for redirect or success
        await this.page.waitForTimeout(3000);

        // Check if case was created
        const currentUrl = this.page.url();
        if (currentUrl.includes('/case/') || currentUrl.includes('/dashboard')) {
          this.testResults.caseCreation = true;
          console.log('✅ Case Creation: Success');
        } else {
          console.log('❌ Case creation failed - unexpected redirect');
        }
      } else {
        console.log('❌ Case creation button not found');
      }
    } catch (error) {
      console.log('❌ Case creation test failed:', error.message);
    }
  }

  async testQdrantIntegration() {
    console.log('🔍 Testing Qdrant Auto-tagging...');

    try {
      // Test if Qdrant endpoints are accessible
      await this.page.goto(`${this.baseUrl}/api/embeddings/suggest`, {
        waitUntil: 'networkidle',
      });

      // Check network requests for Qdrant integration
      const requests = [];
      this.page.on('request', (req) => {
        if (req.url().includes('embeddings') || req.url().includes('qdrant')) {
          requests.push(req.url());
        }
      });

      // Trigger auto-tagging by creating content
      await this.page.goto(`${this.baseUrl}/dashboard`);
      await this.page.waitForTimeout(2000);

      if (requests.length > 0) {
        this.testResults.qdrant = true;
        console.log('✅ Qdrant Integration: Active');
      } else {
        console.log('⚠️ Qdrant: No embedding requests detected');
      }
    } catch (error) {
      console.log('❌ Qdrant test failed:', error.message);
    }
  }

  async testLokiJS() {
    console.log('💾 Testing Loki.js Local Storage...');

    try {
      // Check if Loki.js is initialized in browser
      const lokiTest = await this.page.evaluate(() => {
        return (
          typeof window.loki !== 'undefined' ||
          localStorage.getItem('loki') !== null ||
          Object.keys(localStorage).some((key) => key.includes('loki'))
        );
      });

      if (lokiTest) {
        this.testResults.loki = true;
        console.log('✅ Loki.js: Active');
      } else {
        console.log('⚠️ Loki.js: Not detected in localStorage');
      }
    } catch (error) {
      console.log('❌ Loki.js test failed:', error.message);
    }
  }

  async testFuseJS() {
    console.log('🔎 Testing Fuse.js Search...');

    try {
      await this.page.goto(`${this.baseUrl}/dashboard`);

      // Look for search functionality
      const searchInput = await this.page
        .locator('input[type="search"], input[placeholder*="search"], input[name="search"]')
        .first();

      if ((await searchInput.count()) > 0) {
        await searchInput.fill('test');
        await this.page.waitForTimeout(1000);

        // Check if search results appear
        const searchResults = await this.page
          .locator('.search-results, .results, [data-search-results]')
          .count();

        if (searchResults > 0) {
          this.testResults.fuse = true;
          console.log('✅ Fuse.js Search: Active');
        } else {
          console.log('⚠️ Fuse.js: Search input found but no results container');
        }
      } else {
        console.log('⚠️ Fuse.js: No search input found');
      }
    } catch (error) {
      console.log('❌ Fuse.js test failed:', error.message);
    }
  }

  async testCSSFrameworks() {
    console.log('🎨 Testing CSS Frameworks...');

    try {
      await this.page.goto(`${this.baseUrl}/dashboard`);

      // Check for CSS framework classes
      const hasCSS = await this.page.evaluate(() => {
        const body = document.body;
        const hasUnoCSS =
          body.classList.toString().includes('uno-') ||
          document.querySelector('[class*="uno-"]') !== null;
        const hasTailwind =
          body.classList.toString().includes('tw-') ||
          document.querySelector('[class*="text-"], [class*="bg-"], [class*="p-"]') !== null;
        const hasPico =
          document.querySelector('[data-theme], .pico') !== null ||
          getComputedStyle(body).getPropertyValue('--pico-font-family') !== '';

        return { hasUnoCSS, hasTailwind, hasPico };
      });

      if (hasCSS.hasUnoCSS || hasCSS.hasTailwind || hasCSS.hasPico) {
        this.testResults.css = true;
        console.log('✅ CSS Frameworks: Active (UnoCSS/Tailwind/Pico detected)');
      } else {
        console.log('⚠️ CSS Frameworks: Not clearly detected');
      }
    } catch (error) {
      console.log('❌ CSS frameworks test failed:', error.message);
    }
  }

  async testUILibraries() {
    console.log('🧩 Testing Melt-UI and Bits-UI...');

    try {
      // Check for Melt-UI and Bits-UI components
      const hasUILibs = await this.page.evaluate(() => {
        const hasMelt = document.querySelector('[data-melt-id], [data-melt]') !== null;
        const hasBits =
          document.querySelector('[data-bits], .bits-') !== null ||
          Object.keys(window).some((key) => key.includes('bits') || key.includes('melt'));

        return { hasMelt, hasBits };
      });

      if (hasUILibs.hasMelt) {
        this.testResults.meltUI = true;
        console.log('✅ Melt-UI: Active');
      } else {
        console.log('⚠️ Melt-UI: Not detected');
      }

      if (hasUILibs.hasBits) {
        this.testResults.bitsUI = true;
        console.log('✅ Bits-UI: Active');
      } else {
        console.log('⚠️ Bits-UI: Not detected');
      }
    } catch (error) {
      console.log('❌ UI libraries test failed:', error.message);
    }
  }

  async generateReport() {
    console.log('\n📊 Generating Comprehensive Test Report...');

    const report = {
      timestamp: new Date().toISOString(),
      testResults: this.testResults,
      summary: {
        total: Object.keys(this.testResults).length: passed, Object: Object.values(this.testResults).filter(Boolean).length: failed, Object: Object.values(this.testResults).filter((result) => !result).length,
      },
      details: {
        coreFeatures: {
          authentication: this.testResults.login && this.testResults.register: userManagement, this: this.testResults.profileUpdate: caseManagement, this: this.testResults.caseCreation: database, this: this.testResults.postgres && this.testResults.drizzle,
        },
        advancedFeatures: {
          search: this.testResults.fuse: localStorage, this: this.testResults.loki: embeddings, this: this.testResults.qdrant,
        },
        frontend: {
          styling: this.testResults.css: components, this: this.testResults.meltUI || this.testResults.bitsUI,
        },
      },
    };

    // Save report
    await fs.writeFile(
      join(__dirname, 'comprehensive-test-report.json'),
      JSON.stringify(report, null, 2)
    );

    // Display summary
    console.log('\n🎯 TEST SUMMARY:');
    console.log(`✅ Passed: ${report.summary.passed}/${report.summary.total}`);
    console.log(`❌ Failed: ${report.summary.failed}/${report.summary.total}`);
    console.log(
      `📈 Success Rate: ${Math.round((report.summary.passed / report.summary.total) * 100)}%`
    );

    console.log('\n📋 DETAILED RESULTS:');
    Object.entries(this.testResults).forEach(([test, result]) => {
      console.log(`${result ? '✅' : '❌'} ${test}`);
    });

    console.log('\n📁 Full report saved to: comprehensive-test-report.json');

    return report;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async run() {
    try {
      await this.init();

      // Run all tests
      await this.testDatabaseConnection();
      await this.testRegistration();
      await this.testLogin();
      await this.testProfileUpdate();
      await this.testCaseCreation();
      await this.testQdrantIntegration();
      await this.testLokiJS();
      await this.testFuseJS();
      await this.testCSSFrameworks();
      await this.testUILibraries();

      // Generate report
      const report = await this.generateReport();

      return report;
    } catch (error) {
      console.error('❌ Test suite failed:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

// Run the test suite
const testSuite = new ComprehensiveSystemTest();
testSuite
  .run()
  .then((report) => {
    console.log('\n🎉 Comprehensive test suite completed!');
    process.exit(report.summary.failed === 0 ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 Test suite crashed:', error);
    process.exit(1);
  });
