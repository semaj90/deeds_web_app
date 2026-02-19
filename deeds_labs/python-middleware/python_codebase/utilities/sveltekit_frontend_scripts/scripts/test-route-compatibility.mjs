#!/usr/bin/env node
/**
 * Route Testing Script - Test all routes for Svelte 5 compatibility
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const routeTests = [];
const errors = [];

function findRoutes(dir, basePath = '') {
  const files = readdirSync(dir);
  const routes = [];
  
  for (const file of files) {
    const filepath = join(dir, file);
    const stat = statSync(filepath);
    
    if (stat.isDirectory()) {
      if (!file.startsWith('.') && !file.startsWith('_')) {
        const newPath = basePath + '/' + file.replace(/^\(|\)$/g, '');
        routes.push(...findRoutes(filepath, newPath));
      }
    } else if (file === '+page.svelte') {
      const routePath = basePath || '/';
      routes.push({
        path: routePath,
        file: filepath
      });
    }
  }
  
  return routes;
}

function testRoute(route) {
  try {
    const content = readFileSync(route.file, 'utf-8');
    
    const issues = {
      path: route.path,
      deprecatedEvents: [],
      exportLet: false,
      dollarReactive: false,
      hasError: false
    };
    
    // Check for deprecated on: events
    const eventMatches = content.match(/on:(click|input|change|submit|keydown|keyup|focus|blur)=/g);
    if (eventMatches) {
      issues.deprecatedEvents = eventMatches;
    }
    
    // Check for export let (might still be valid in some cases)
    if (content.match(/export let /)) {
      issues.exportLet = true;
    }
    
    // Check for $: reactive statements
    if (content.match(/\$:\s*\w+\s*=/)) {
      issues.dollarReactive = true;
    }
    
    // Check for parsing errors (basic)
    if (content.match(/from:\s+['"`]/)) {
      issues.hasError = true;
    }
    
    const hasIssues = issues.deprecatedEvents.length > 0 || 
                     issues.exportLet || 
                     issues.dollarReactive ||
                     issues.hasError;
    
    if (hasIssues) {
      errors.push(issues);
    } else {
      routeTests.push({ path: route.path, status: 'ok' });
    }
    
    return issues;
  } catch (err) {
    errors.push({ path: route.path, error: err.message });
    return null;
  }
}

console.log('🔍 Scanning routes for Svelte 5 compatibility...\n');

const routes = findRoutes('src/routes');
console.log(`Found ${routes.length} routes\n`);

const tested = routes.map(route => testRoute(route)).filter(Boolean);

console.log('📊 Results:\n');
console.log(`✅ Compatible routes: ${routeTests.length}`);
console.log(`⚠️  Routes with issues: ${errors.length}\n`);

if (errors.length > 0) {
  console.log('Issues found:');
  errors.slice(0, 10).forEach(issue => {
    console.log(`\n❌ ${issue.path}`);
    if (issue.deprecatedEvents?.length > 0) {
      console.log(`  - Deprecated events: ${issue.deprecatedEvents.join(', ')}`);
    }
    if (issue.exportLet) {
      console.log(`  - Uses export let (consider $props)`);
    }
    if (issue.dollarReactive) {
      console.log(`  - Uses $: reactive (consider $derived)`);
    }
    if (issue.hasError) {
      console.log(`  - Has syntax errors`);
    }
    if (issue.error) {
      console.log(`  - Error: ${issue.error}`);
    }
  });
  
  if (errors.length > 10) {
    console.log(`\n... and ${errors.length - 10} more issues`);
  }
}

console.log('\n✨ Route compatibility scan complete!');
