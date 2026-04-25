// Simple route tester without complex stack

const baseUrl = 'http://localhost:5173';

// Common routes to test
const testRoutes = [
  '/',                    // Home page
  '/about',              // About page
  '/demo',               // Demo page
  '/agent-demo',         // Agent demo
  '/all-routes',         // All routes page
  '/chat',               // Chat interface
  '/legal',              // Legal features
  '/api/health',         // Health check API
];

console.log('🧪 Testing route accessibility...');
console.log('Base URL:', baseUrl);
console.log('─'.repeat(60));

// Test each route
for (const route of testRoutes) {
  const url = `${baseUrl}${route}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/json,*/*',
        'User-Agent': 'Route-Tester/1.0'
      }
    });

    const status = response.status;
    const statusText = response.statusText;
    const contentType = response.headers.get('content-type') || 'unknown';

    // Get a small sample of the content
    const text = await response.text();
    const preview = text.substring(0, 100).replace(/\n/g, ' ').trim();

    console.log(`✅ ${route.padEnd(15)} | ${status} ${statusText} | ${contentType.split(';')[0]} | ${preview}...`);

  } catch (error) {
    console.log(`❌ ${route.padEnd(15)} | ERROR: ${error.message}`);
  }
}

console.log('─'.repeat(60));
console.log('🏁 Route testing complete');