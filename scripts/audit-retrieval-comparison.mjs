import fs from 'fs';
import path from 'path';

async function runComparisonSmokeTest() {
  console.log("🔍 Running Retrieval Comparison Smoke Test...");
  
  // Note: in a real environment this would hit http://localhost:5173/api/debug/retrieval-comparison
  // We'll simulate the fetch for the CLI smoke test or just report it's available.
  
  try {
    const url = 'http://127.0.0.1:5173/api/debug/retrieval-comparison?q=smoke';
    console.log(`Fetching from sidecar: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("✅ Comparison Result:");
    console.log(JSON.stringify(data, null, 2));

    const outPath = path.join(process.cwd(), 'docs', 'reports', 'retrieval-comparison-smoke.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
    
    console.log(`💾 Saved comparison smoke test to ${outPath}`);
  } catch (err) {
    console.warn("⚠️ Could not fetch from dev server. Is Vite running?", err.message);
  }
}

runComparisonSmokeTest().catch(console.error);
