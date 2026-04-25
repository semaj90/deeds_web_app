#!/usr/bin/env node
/**
 * Quick Error Sampler
 * Gets error counts quickly by sampling instead of full check
 */

import { spawn } from "child_process";
import fs from "fs";

console.log("🔍 Quick Error Sampling...\n");

const errorCodes = {};
let totalLines = 0;
let errorLines = 0;

const proc = spawn("npx", ["svelte-check", "--threshold", "error"], {
  shell: true,
});

proc.stdout.on("data", (data) => {
  const lines = data.toString().split("\n");
  lines.forEach((line) => {
    totalLines++;
    
    // Match error pattern: (error-code)
    const match = line.match(/\(([a-z0-9-]+)\)$/i);
    if (match) {
      const code = match[1];
      errorCodes[code] = (errorCodes[code] || 0) + 1;
      errorLines++;
    }
    
    // Show progress every 100 lines
    if (totalLines % 100 === 0) {
      process.stdout.write(`\r  Lines processed: ${totalLines}, Errors found: ${errorLines}`);
    }
    
    // Stop after 5000 lines for quick sample
    if (totalLines > 5000) {
      proc.kill();
    }
  });
});

proc.on("close", () => {
  console.log("\n\n📊 QUICK ERROR SAMPLE (first 5000 lines):\n");
  
  const sorted = Object.entries(errorCodes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  
  console.log("Top 20 Error Codes:");
  sorted.forEach(([code, count], i) => {
    console.log(`${(i + 1).toString().padStart(2)}. ${code.padEnd(40)} ${count.toString().padStart(6)} occurrences`);
  });
  
  console.log(`\nTotal unique error codes: ${Object.keys(errorCodes).length}`);
  console.log(`Total errors in sample: ${errorLines}`);
  console.log(`\n💡 Estimated total errors: ${Math.round(errorLines * 20)} (rough estimate)`);
  
  // Save to file
  fs.writeFileSync(
    "quick-error-sample.json",
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        sampleSize: totalLines,
        errorsInSample: errorLines,
        estimatedTotal: errorLines * 20,
        topErrors: sorted,
        allCodes: errorCodes,
      },
      null,
      2
    )
  );
  
  console.log("\n📝 Saved to: quick-error-sample.json\n");
});
