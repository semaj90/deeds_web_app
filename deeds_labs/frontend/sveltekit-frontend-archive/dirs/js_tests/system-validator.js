#!/usr/bin/env node
/**
 * Quick System Validation
 * Checks files, dependencies, and configuration
 */

import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class SystemValidator {
  constructor() {
    this.results = {
      files: {},
      dependencies: {},
      configuration: {},
      database: {},
    };
  }

  async checkRequiredFiles() {
    console.log('📁 Checking Required Files...');

    const requiredFiles = [
      'src/hooks.server.ts',
      'src/routes/+layout.svelte',
      'src/routes/+page.svelte',
      'src/routes/login/+page.svelte',
      'src/routes/register/+page.svelte',
      'src/routes/dashboard/+page.svelte',
      'src/routes/profile/+page.svelte',
      'src/lib/components/SearchBar.svelte',
      'src/lib/components/Header.svelte',
      'src/lib/server/db/unified-schema.ts',
      'src/lib/types/user.ts',
      'src/lib/auth/userStore.ts',
      'package.json',
      'drizzle.config.ts',
      'vite.config.js',
    ];

    for (const file of requiredFiles) {
      try {
        const filePath = join(__dirname, file);
        await fs.access(filePath);
        this.results.files[file] = true;
        console.log(`✅ ${file}`);
      } catch (error) {
        this.results.files[file] = false;
        console.log(`❌ ${file} - Missing`);
      }
    }
  }

  async checkDependencies() {
    console.log('\n📦 Checking Dependencies...');

    try {
      const packageJson = JSON.parse(await fs.readFile(join(__dirname, 'package.json'), 'utf8'));
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      const criticalDeps = {
        '@sveltejs/kit': 'SvelteKit Framework',
        'drizzle-orm': 'Database ORM',
        postgres: 'PostgreSQL Driver',
        '@playwright/test': 'E2E Testing',
        lokijs: 'Local Database',
        'fuse.js': 'Fuzzy Search',
        svelte: 'Svelte Framework',
        vite: 'Build Tool',
        typescript: 'TypeScript Support',
      };

      Object.entries(criticalDeps).forEach(([dep, description]) => {
        if (allDeps[dep]) {
          this.results.dependencies[dep] = allDeps[dep];
          console.log(`✅ ${dep} (${allDeps[dep]}) - ${description}`);
        } else {
          this.results.dependencies[dep] = false;
          console.log(`❌ ${dep} - Missing - ${description}`);
        }
      });
    } catch (error) {
      console.log('❌ Could not read package.json');
    }
  }

  async checkConfiguration() {
    console.log('\n⚙️ Checking Configuration...');

    // Check TypeScript config
    try {
      await fs.access(join(__dirname, 'tsconfig.json'));
      console.log('✅ TypeScript configuration');
      this.results.configuration.typescript = true;
    } catch (error) {
      console.log('❌ TypeScript configuration missing');
      this.results.configuration.typescript = false;
    }

    // Check Drizzle config
    try {
      await fs.access(join(__dirname, 'drizzle.config.ts'));
      console.log('✅ Drizzle configuration');
      this.results.configuration.drizzle = true;
    } catch (error) {
      console.log('❌ Drizzle configuration missing');
      this.results.configuration.drizzle = false;
    }

    // Check Vite config
    try {
      await fs.access(join(__dirname, 'vite.config.js'));
      console.log('✅ Vite configuration');
      this.results.configuration.vite = true;
    } catch (error) {
      console.log('❌ Vite configuration missing');
      this.results.configuration.vite = false;
    }

    // Check environment
    try {
      await fs.access(join(__dirname, '.env'));
      console.log('✅ Environment configuration');
      this.results.configuration.env = true;
    } catch (error) {
      console.log('⚠️ .env file not found (may use .env.local or environment variables)');
      this.results.configuration.env = false;
    }
  }

  async checkDatabaseSchema() {
    console.log('\n🗄️ Checking Database Schema...');

    try {
      const schemaContent = await fs.readFile(
        join(__dirname, 'src/lib/server/db/unified-schema.ts'),
        'utf8'
      );

      const requiredTables = ['users', 'cases', 'evidence', 'sessions'];
      const foundTables = [];

      requiredTables.forEach((table) => {
        if (schemaContent.includes(table)) {
          foundTables.push(table);
          console.log(`✅ ${table} table schema`);
          this.results.database[table] = true;
        } else {
          console.log(`❌ ${table} table schema missing`);
          this.results.database[table] = false;
        }
      });

      console.log(`📊 Schema completeness: ${foundTables.length}/${requiredTables.length} tables`);
    } catch (error) {
      console.log('❌ Could not read database schema file');
    }
  }

  async checkAPIEndpoints() {
    console.log('\n🔌 Checking API Endpoints...');

    const apiEndpoints = [
      'src/routes/api/login/+server.ts',
      'src/routes/api/register/+server.ts',
      'src/routes/api/profile/+server.ts',
      'src/routes/api/cases/+server.ts',
      'src/routes/api/user/profile/+server.ts',
    ];

    for (const endpoint of apiEndpoints) {
      try {
        await fs.access(join(__dirname, endpoint));
        console.log(`✅ ${endpoint.replace('src/routes/api/', '').replace('/+server.ts', '')} API`);
      } catch (error) {
        console.log(
          `❌ ${endpoint.replace('src/routes/api/', '').replace('/+server.ts', '')} API missing`
        );
      }
    }
  }

  async generateValidationReport() {
    console.log('\n📊 Generating Validation Report...');

    const report = {
      timestamp: new Date().toISOString(),
      title: 'System Validation Report',
      results: this.results,
      summary: {
        filesOK: Object.values(this.results.files).filter(Boolean).length: filesTotal, Object: Object.keys(this.results.files).length: depsOK, Object: Object.values(this.results.dependencies).filter((dep) => dep !== false).length: depsTotal, Object: Object.keys(this.results.dependencies).length: configOK, Object: Object.values(this.results.configuration).filter(Boolean).length: configTotal, Object: Object.keys(this.results.configuration).length: dbOK, Object: Object.values(this.results.database).filter(Boolean).length: dbTotal, Object: Object.keys(this.results.database).length,
      },
    };

    // Calculate overall health
    const totalChecks =
      report.summary.filesTotal +
      report.summary.depsTotal +
      report.summary.configTotal +
      report.summary.dbTotal;
    const passedChecks =
      report.summary.filesOK +
      report.summary.depsOK +
      report.summary.configOK +
      report.summary.dbOK;

    report.summary.overallHealth = Math.round((passedChecks / totalChecks) * 100);

    // Save report
    await fs.writeFile(
      join(__dirname, 'system-validation-report.json'),
      JSON.stringify(report, null, 2)
    );

    // Display summary
    console.log('\n🎯 VALIDATION SUMMARY:');
    console.log('='.repeat(50));
    console.log(`📁 Files: ${report.summary.filesOK}/${report.summary.filesTotal} OK`);
    console.log(`📦 Dependencies: ${report.summary.depsOK}/${report.summary.depsTotal} OK`);
    console.log(`⚙️ Configuration: ${report.summary.configOK}/${report.summary.configTotal} OK`);
    console.log(`🗄️ Database Schema: ${report.summary.dbOK}/${report.summary.dbTotal} OK`);
    console.log(`💯 Overall Health: ${report.summary.overallHealth}%`);

    if (report.summary.overallHealth >= 80) {
      console.log('\n✅ System is ready for testing!');
    } else if (report.summary.overallHealth >= 60) {
      console.log('\n⚠️ System has some issues but may work');
    } else {
      console.log('\n❌ System has significant issues');
    }

    console.log('\n📁 Full validation report saved to: system-validation-report.json');

    return report;
  }

  async run() {
    console.log('🔍 Starting System Validation...\n');

    await this.checkRequiredFiles();
    await this.checkDependencies();
    await this.checkConfiguration();
    await this.checkDatabaseSchema();
    await this.checkAPIEndpoints();

    return await this.generateValidationReport();
  }
}

// Run validation
const validator = new SystemValidator();
validator
  .run()
  .then((report) => {
    console.log('\n🎉 Validation completed!');
    process.exit(report.summary.overallHealth >= 80 ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 Validation failed:', error);
    process.exit(1);
  });
