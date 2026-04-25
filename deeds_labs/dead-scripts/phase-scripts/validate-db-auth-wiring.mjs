#!/usr/bin/env node
/**
 * Phase 79: Database & Auth Wiring Validator
 *
 * Ensures all components, pages, layouts, and API endpoints are:
 * 1. Connected to legal_ai_db (via DATABASE_URL)
 * 2. Using Lucia v3 authentication where required
 * 3. Following security patterns from knowledge base
 *
 * Usage: node scripts/validate-db-auth-wiring.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROUTES_DIR = path.join(__dirname, '../src/routes');
const ROUTE_MAP = path.join(__dirname, '../knowledge/route-map.json');

// Patterns to detect
const PATTERNS = {
  luciaAuth: /lucia\.validateSession|validateSession|locals\.user|locals\.session/g,
  dbQuery: /db\.(select|insert|update|delete|query)\(|from\(|drizzle/g,
  dbImport: /import.*from.*['"].*\/db['"]/g,
  luciaImport: /import.*from.*['"].*lucia['"]/g,
  authCheck: /if\s*\(!locals\.user\)|if\s*\(locals\.user\s*===\s*null\)/g,
  redirect: /redirect\(.*\/login|throw\s+redirect/g,
  protectedLoad: /export\s+const\s+load.*PageServerLoad.*locals/gs,
  protectedEndpoint: /export\s+const\s+(GET|POST|PUT|DELETE|PATCH).*locals\.user/gs,
};

// Security requirements by route type
const SECURITY_REQUIREMENTS = {
  'protected-page': ['auth', 'database', 'redirect'],
  'protected-endpoint': ['auth', 'database', 'validation'],
  'public-page': ['database'],
  'public-endpoint': ['validation'],
};

class RouteValidator {
  constructor() {
    this.results = {
      total: 0,
      compliant: 0,
      needsAuth: [],
      needsDb: [],
      needsValidation: [],
      fullyWired: []
    };
  }

  async validate() {
    console.log('🔍 Phase 79: Database & Auth Wiring Validator\n');
    console.log('═'.repeat(80));

    // Load route map
    const routeMap = JSON.parse(fs.readFileSync(ROUTE_MAP, 'utf-8'));

    console.log(`\n📊 Loaded Route Map:`);
    console.log(`   Total Routes: ${routeMap.total_routes}`);
    console.log(`   With Auth: ${routeMap.summary.with_auth}`);
    console.log(`   With Database: ${routeMap.summary.with_database}`);
    console.log(`   With Validation: ${routeMap.summary.with_validation}\n`);

    // Validate each route
    for (const route of routeMap.routes) {
      this.results.total++;
      await this.validateRoute(route);
    }

    this.printResults();
    this.generateFixScript();
  }

  async validateRoute(route) {
    const filePath = path.join(__dirname, '..', route.file);

    if (!fs.existsSync(filePath)) {
      return; // Skip non-existent files
    }

    let content = fs.readFileSync(filePath, 'utf-8');

    // For .svelte pages, also check companion +page.server.ts
    if (route.file.endsWith('.svelte') && route.type.includes('page')) {
      const dir = path.dirname(filePath);
      const serverFile = path.join(dir, '+page.server.ts');

      if (fs.existsSync(serverFile)) {
        const serverContent = fs.readFileSync(serverFile, 'utf-8');
        // Merge server content for analysis
        content = content + '\n' + serverContent;
      }
    }

    const analysis = this.analyzeFile(content, route);

    // Determine requirements based on route type
    const isProtected = this.isProtectedRoute(route);
    const isEndpoint = route.type === 'endpoint';
    const isPage = route.type.includes('page');

    // Check compliance
    if (isProtected) {
      if (!analysis.hasAuth) {
        this.results.needsAuth.push({ ...route, analysis });
      }
      if (!analysis.hasDb) {
        this.results.needsDb.push({ ...route, analysis });
      }
    }

    if (isEndpoint && !analysis.hasValidation) {
      this.results.needsValidation.push({ ...route, analysis });
    }

    // Fully wired check
    if (analysis.hasAuth && analysis.hasDb && (isEndpoint ? analysis.hasValidation : true)) {
      this.results.compliant++;
      this.results.fullyWired.push(route.route);
    }
  }

  analyzeFile(content, route) {
    return {
      hasAuth: PATTERNS.luciaAuth.test(content) || PATTERNS.luciaImport.test(content),
      hasDb: PATTERNS.dbQuery.test(content) || PATTERNS.dbImport.test(content),
      hasValidation: /z\.|zod\.|\.safeParse\(|\.parse\(/.test(content),
      hasAuthCheck: PATTERNS.authCheck.test(content),
      hasRedirect: PATTERNS.redirect.test(content),
      isProtectedLoad: PATTERNS.protectedLoad.test(content),
      isProtectedEndpoint: PATTERNS.protectedEndpoint.test(content),
    };
  }

  isProtectedRoute(route) {
    // Routes that should have auth
    const protectedPaths = [
      '/cases',
      '/evidence',
      '/chat',
      '/dashboard',
      '/profile',
      '/admin',
      '/settings'
    ];

    return protectedPaths.some(path => route.route.startsWith(path)) ||
           route.features.auth ||
           route.route.includes('protected');
  }

  printResults() {
    console.log('\n═'.repeat(80));
    console.log('📊 VALIDATION RESULTS\n');

    const complianceRate = ((this.results.compliant / this.results.total) * 100).toFixed(1);

    console.log(`✅ Compliant Routes: ${this.results.compliant}/${this.results.total} (${complianceRate}%)`);
    console.log(`🔒 Need Auth Wiring: ${this.results.needsAuth.length}`);
    console.log(`💾 Need DB Wiring: ${this.results.needsDb.length}`);
    console.log(`✓ Need Validation: ${this.results.needsValidation.length}\n`);

    if (this.results.needsAuth.length > 0) {
      console.log('🔒 ROUTES NEEDING AUTH WIRING:');
      console.log('─'.repeat(80));
      this.results.needsAuth.slice(0, 10).forEach(route => {
        console.log(`   ${route.route.padEnd(40)} (${route.file})`);
      });
      if (this.results.needsAuth.length > 10) {
        console.log(`   ... and ${this.results.needsAuth.length - 10} more\n`);
      } else {
        console.log('');
      }
    }

    if (this.results.needsDb.length > 0) {
      console.log('💾 ROUTES NEEDING DB WIRING:');
      console.log('─'.repeat(80));
      this.results.needsDb.slice(0, 10).forEach(route => {
        console.log(`   ${route.route.padEnd(40)} (${route.file})`);
      });
      if (this.results.needsDb.length > 10) {
        console.log(`   ... and ${this.results.needsDb.length - 10} more\n`);
      } else {
        console.log('');
      }
    }

    console.log('═'.repeat(80));
  }

  generateFixScript() {
    const fixes = [];

    // Generate fix for routes needing auth
    for (const route of this.results.needsAuth) {
      fixes.push({
        file: route.file,
        route: route.route,
        type: 'auth',
        template: this.getAuthTemplate(route.type)
      });
    }

    // Generate fix for routes needing DB
    for (const route of this.results.needsDb) {
      fixes.push({
        file: route.file,
        route: route.route,
        type: 'database',
        template: this.getDbTemplate(route.type)
      });
    }

    if (fixes.length === 0) {
      console.log('✅ All routes are properly wired!\n');
      return;
    }

    console.log(`\n📝 Generated ${fixes.length} fix recommendations`);
    console.log('   Run: node scripts/apply-db-auth-fixes.mjs\n');

    // Save fixes to JSON for processing
    fs.writeFileSync(
      path.join(__dirname, '../.phase79-fixes.json'),
      JSON.stringify(fixes, null, 2)
    );
  }

  getAuthTemplate(routeType) {
    if (routeType === 'endpoint') {
      return `
// Add at top of file
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  // 1. Authentication Check
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Your logic here
  return json({ success: true });
};`;
    } else if (routeType.includes('page')) {
      return `
// Add at top of file
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  // 1. Authentication Check
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  // 2. Your logic here
  return {
    user: locals.user
  };
};`;
    }
    return '';
  }

  getDbTemplate(routeType) {
    return `
// Add at top of file
import { db } from '$lib/server/db';
import { yourTable } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

// Example query
const data = await db.query.yourTable.findMany({
  where: eq(yourTable.userId, locals.user.id)
});`;
  }
}

// Run validation
const validator = new RouteValidator();
validator.validate().catch(error => {
  console.error('❌ Validation failed:', error);
  process.exit(1);
});
