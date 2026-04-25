// Quick test to check if the app is working
console.log('=== Deeds App Quick Health Check ===');

const testUrls = [
  'http://localhost:5173/',
  'http://localhost:5173/login',
  'http://localhost:5173/register',
  'http://localhost:5173/dashboard',
];

async function checkHealth() {
  for (const url of testUrls) {
    try {
      console.log(`Checking: ${url}`);
      const response = await fetch(url);
      console.log(`✅ ${url} - Status: ${response.status}`);
    } catch (error) {
      console.log(`❌ ${url} - Error: ${error.message}`);
    }
  }
}

// Run the health check
checkHealth()
  .then(() => {
    console.log('=== Health Check Complete ===');
  })
  .catch(console.error);
