// Quick test for port 5174
const baseUrl = 'http://localhost:5174';
const routes = ['/', '/about', '/demo', '/agent-demo', '/all-routes', '/chat', '/legal', '/api/health'];

console.log('🧪 Testing routes on port 5174...');
console.log('Base URL:', baseUrl);
console.log('────────────────────────────────────────────────────────────');

for (const route of routes) {
  try {
    const response = await fetch(baseUrl + route);
    console.log(`✅ ${route.padEnd(15)} | Status: ${response.status}`);
  } catch (error) {
    console.log(`❌ ${route.padEnd(15)} | ERROR: ${error.message}`);
  }
}

console.log('────────────────────────────────────────────────────────────');
console.log('🏁 Route testing complete');