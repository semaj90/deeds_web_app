import { ENV } from '../../src/lib/server/env.server.js';
import { fetchFromOllama } from '../../src/lib/server/ai/ollama-client.js';
import fs from 'fs';
import path from 'path';

/**
 * TurboQuant & RotorQuant Benchmark Suite
 * 
 * Measures throughput (t/s) and latency (ms) across different 
 * Gemma 4 E4B quantization profiles.
 */

const PROMPTS = [
  "Draft a formal complaint for a breach of contract regarding a real estate transaction where the seller failed to disclose structural defects.",
  "Summarize the key differences between a motion to dismiss and a motion for summary judgment under the Federal Rules of Civil Procedure.",
  "Analyze the following fact pattern for potential tort liability: A customer slips on a grape in a grocery store aisle that was last inspected 4 hours ago.",
];

async function benchProfile(label, port) {
  console.log(`\n🚀 Benchmarking Profile: ${label} on :${port}`);
  const results = [];

  for (const prompt of PROMPTS) {
    const start = Date.now();
    try {
      const response = await fetch(`http://127.0.0.1:${port}/completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          n_predict: 256,
          stream: false
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const end = Date.now();
      
      const durationSec = (end - start) / 1000;
      const tokens = data.content.length / 4; // Rough estimate
      const tps = tokens / durationSec;

      results.push({
        prompt: prompt.slice(0, 30) + "...",
        durationMs: end - start,
        tps: tps.toFixed(2),
        tokens: Math.round(tokens)
      });
      console.log(`  - ${prompt.slice(0, 30)}... | ${tps.toFixed(2)} t/s | ${end - start}ms`);
    } catch (e) {
      console.error(`  - ❌ Failed: ${e.message}`);
    }
  }

  return results;
}

async function main() {
  const report = {
    timestamp: new Date().toISOString(),
    results: {}
  };

  // We assume the user has the servers running or we guide them to start them
  // For this script, we just try to hit the ports defined in the launcher
  
  // RotorQuant usually on 8090
  report.results.rotorquant = await benchProfile("RotorQuant (IQ4_XS)", 8090);
  
  // AtomicBot might be on a different port or the same if swapped
  // report.results.atomicbot = await benchProfile("AtomicBot (Turbo3)", 8080);

  const reportPath = path.join(process.cwd(), 'logs/turboquant/bench-results.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`\n✅ Benchmark complete. Report saved to ${reportPath}`);
}

main().catch(console.error);
