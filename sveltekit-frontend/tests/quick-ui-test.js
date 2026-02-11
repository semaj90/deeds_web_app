/**
 * Quick Manual UI Test - No Test Infrastructure Required
 * Tests button clickability and route accessibility
 */

const BASE_URL = 'http://localhost:5177';

// Routes to test
const routes = [
  '/',
  '/evidenceboard',
  '/yorha-command-center',
  '/demo/enhanced-rag-semantic',
  '/demo/nes-bits-ui',
  '/detective',
  '/chat',
  '/legal-ai/database-sync-test',
];

console.log('🚀 Starting Quick UI Test...\n');

async function testRoute(route) {
  try {
    const response = await fetch(`${BASE_URL}${route}`);
    const status = response.status;

    if (status === 200) {
      const html = await response.text();

      // Count buttons and links
      const buttonMatches = html.match(/<button[^>]*>/gi) || [];
      const linkMatches = html.match(/<a[^>]*href="[^"]*"[^>]*>/gi) || [];

      // Check for accessibility features
      const hasSkipLink = html.includes('Skip to main content');
      const hasMainContent = html.includes('id="main-content"');
      const hasAriaLabels = html.includes('aria-label');

      console.log(`✅ ${route}`);
      console.log(`   Status: ${status}`);
      console.log(`   Buttons: ${buttonMatches.length}`);
      console.log(`   Links: ${linkMatches.length}`);
      console.log(
        `   Accessibility: Skip(${hasSkipLink}) Main(${hasMainContent}) ARIA(${hasAriaLabels})`
      );

      return {
        route,
        status, buttons: buttonMatches.length, links: linkMatches.length,
        accessibility: { hasSkipLink, hasMainContent, hasAriaLabels },
      };
    } else {
      console.log(`❌ ${route} - HTTP ${status}`);
      return { route, status, error: `HTTP ${status}` };
    }
  } catch (error) {
    console.log(`❌ ${route} - Error: ${error.message}`);
    return { route, error: error.message };
  }
}

async function testAPIEndpoint() {
  console.log('\n🔄 Testing API Endpoints...');

  try {
    // Test GET endpoint
    const getResponse = await fetch(`${BASE_URL}/api/legal-processing`);
    console.log(`GET /api/legal-processing: ${getResponse.status}`);

    // Test POST endpoint with sample data
    const postResponse = await fetch(`${BASE_URL}/api/legal-processing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Sample legal document for UI testing',
        documentType: 'contract',
        practiceArea: 'corporate-law',
      }),
    });

    console.log(`POST /api/legal-processing: ${postResponse.status}`);

    if (postResponse.status !== 200) {
      const errorText = await postResponse.text();
      console.log(`   Response: ${errorText.substring(0, 100)}...`);
    }
  } catch (error) {
    console.log(`API Test Error: ${error.message}`);
  }
}

async function runTests() {
  const results = [];

  console.log('Testing Route Accessibility...\n');

  for (const route of routes) {
    const result = await testRoute(route);
    results.push(result);
    console.log(''); // Empty line for readability
  }

  await testAPIEndpoint();

  console.log('\n📊 Test Summary:');
  const successful = results.filter((r) => r.status === 200);
  const failed = results.filter((r) => r.status !== 200);

  console.log(`✅ Successful routes: ${successful.length}/${routes.length}`);
  console.log(`❌ Failed routes: ${failed.length}/${routes.length}`);

  if (successful.length > 0) {
    const totalButtons = successful.reduce((sum, r) => sum + (r.buttons || 0), 0);
    const totalLinks = successful.reduce((sum, r) => sum + (r.links || 0), 0);
    const accessibleRoutes = successful.filter(
      (r) => r.accessibility?.hasSkipLink && r.accessibility?.hasMainContent
    ).length;

    console.log(`\n🎯 UI Elements Found:`);
    console.log(`   Total Buttons: ${totalButtons}`);
    console.log(`   Total Links: ${totalLinks}`);
    console.log(`   Accessible Routes: ${accessibleRoutes}/${successful.length}`);
  }

  console.log('\n✅ Quick UI Test Complete!');
}

// Run the tests
runTests().catch(console.error);
