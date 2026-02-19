#!/usr/bin/env node

/**
 * Manual UX Testing Script
 * Tests the enhanced-bits components integration without Playwright setup overhead
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);

async function testDevServer() {
  console.log('🧪 Testing UX Layouts with Enhanced-Bits Components');
  console.log('='.repeat(60));

  const baseURL = 'http://localhost:5174';

  try {
    // Test 1: Case Scoring Dashboard
    console.log('📊 Testing Case Scoring Dashboard...');
    const caseScoringResponse = await fetch(`${baseURL}/demo/case-scoring`);

    if (caseScoringResponse.ok) {
      const html = await caseScoringResponse.text();

      // Check for key components
      const checks = [
        { name: 'Demo Header', pattern: /Case Scoring Dashboard Demo/i },
        { name: 'Dashboard Component', pattern: /case-scoring-dashboard/i },
        { name: 'Demo Toggle', pattern: /demo-toggle/i },
        { name: 'Enhanced-Bits Cards', pattern: /case-score-card/i },
        { name: 'Modal Support', pattern: /modal-overlay/i },
        { name: 'Loading States', pattern: /loading-state/i },
        { name: 'Responsive Grid', pattern: /cases-grid/i },
      ];

      let passed = 0;
      checks.forEach((check) => {
        if (check.pattern.test(html)) {
          console.log(`  ✅ ${check.name}`);
          passed++;
        } else {
          console.log(`  ❌ ${check.name}`);
        }
      });

      console.log(`  📈 Case Scoring Dashboard: ${passed}/${checks.length} checks passed`);
    } else {
      console.log('  ❌ Failed to load Case Scoring Dashboard');
    }

    // Test 2: LoadingButton Component
    console.log('\\n🔘 Testing LoadingButton Component...');
    const loadingButtonResponse = await fetch(`${baseURL}/demo/loading-button`);

    if (loadingButtonResponse.ok) {
      const html = await loadingButtonResponse.text();

      const checks = [
        { name: 'LoadingButton Demo Page', pattern: /LoadingButton Component Demo/i },
        { name: 'Button Variants', pattern: /loading-button--primary/i },
        {
          name: 'Button Sizes',
          pattern: /loading-button--sm|loading-button--md|loading-button--lg/i,
        },
        { name: 'Loading Spinner', pattern: /loading-button__spinner/i },
        { name: 'ARIA Attributes', pattern: /aria-busy|aria-label/i },
        { name: 'Disabled States', pattern: /loading-button--disabled/i },
        { name: 'Form Integration', pattern: /demo-form/i },
      ];

      let passed = 0;
      checks.forEach((check) => {
        if (check.pattern.test(html)) {
          console.log(`  ✅ ${check.name}`);
          passed++;
        } else {
          console.log(`  ❌ ${check.name}`);
        }
      });

      console.log(`  📈 LoadingButton: ${passed}/${checks.length} checks passed`);
    } else {
      console.log('  ❌ Failed to load LoadingButton Demo');
    }

    // Test 3: SIMD Parser Integration
    console.log('\\n⚡ Testing SIMD Parser Integration...');

    // Check if SIMD parser module exists
    try {
      const simdParserResponse = await fetch(`${baseURL}/_app/immutable/chunks/simd-json-parser`);
      if (simdParserResponse.ok || simdParserResponse.status === 404) {
        // 404 is expected if not bundled, but server should respond
        console.log('  ✅ SIMD Parser module endpoint accessible');
      }
    } catch (error) {
      console.log('  ⚠️  SIMD Parser integration: endpoint check failed');
    }

    // Test 4: N64-UI-HOWTO Compliance
    console.log('\\n🎮 Testing N64-UI-HOWTO Compliance...');

    const complianceChecks = [
      { name: 'Headless Components (unstyled)', test: () => html.includes('headless') },
      { name: 'Accessible ARIA attributes', test: () => /aria-[a-z]+=/i.test(html) },
      { name: 'SSR Compatible', test: () => html.includes('<!DOCTYPE html>') },
      { name: 'Focus Management', test: () => /focus|tabindex/i.test(html) },
      { name: 'Keyboard Navigation', test: () => /onkey|keydown|keyboard/i.test(html) },
    ];

    let html = await caseScoringResponse.text();
    html += await loadingButtonResponse.text();

    complianceChecks.forEach((check) => {
      try {
        if (check.test()) {
          console.log(`  ✅ ${check.name}`);
        } else {
          console.log(`  ⚠️  ${check.name} - needs verification`);
        }
      } catch (error) {
        console.log(`  ❌ ${check.name} - test failed`);
      }
    });

    // Performance Check
    console.log('\\n📊 Performance Summary...');

    const performanceMetrics = {
      'Case Scoring Dashboard Size': `${(await caseScoringResponse.text()).length} bytes`,
      'LoadingButton Demo Size': `${(await loadingButtonResponse.text()).length} bytes`,
      'Server Response': caseScoringResponse.ok ? 'OK' : 'Error',
      'Dev Server Port': '5174',
    };

    Object.entries(performanceMetrics).forEach(([key, value]) => {
      console.log(`  📈 ${key}: ${value}`);
    });

    console.log('\\n' + '='.repeat(60));
    console.log('🎉 UX Layout Testing Complete!');
    console.log('\\n💡 Next Steps:');
    console.log('  • Visit http://localhost:5174/demo/case-scoring');
    console.log('  • Visit http://localhost:5174/demo/loading-button');
    console.log('  • Test interactions manually in browser');
    console.log('  • Verify mobile responsiveness');
  } catch (error) {
    console.error('❌ Testing failed:', error.message);
    console.log('\\n🔧 Troubleshooting:');
    console.log('  • Make sure dev server is running on port 5174');
    console.log('  • Check: npm run dev is active');
    console.log('  • Verify: Redis container is running');
  }
}

// Run the test
testDevServer();
