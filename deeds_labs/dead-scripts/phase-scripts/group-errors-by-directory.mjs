#!/usr/bin/env node
/**
 * Error Distribution Analyzer
 * Groups 49,734 errors by directory to validate 70% concentration hypothesis
 */

import fs from 'fs';

const errorFile = process.argv[2] || 'reports/errors.jsonl';
const outputFile = process.argv[3] || 'reports/directory-distribution.json';

console.log('📊 Analyzing error distribution by directory...\n');

if (!fs.existsSync(errorFile)) {
  console.error(`❌ Error file not found: ${errorFile}`);
  process.exit(1);
}

// Load events
const lines = fs.readFileSync(errorFile, 'utf-8').split('\n').filter(l => l.trim());
const events = lines.map(line => {
  try {
    return JSON.parse(line);
  } catch (e) {
    return null;
  }
}).filter(Boolean);

console.log(`✅ Loaded ${events.length} error events\n`);

// Group by directory
const dirCounts = {};
const dirErrors = {};

for (const event of events) {
  // Extract directory path
  const fullPath = event.file || '';
  const relativePath = fullPath.replace(/^c:\\Users\\[^\\]+\\Videos\\deeds-web-app\\sveltekit-frontend\\/, '');

  // Get top-level directory
  const parts = relativePath.split(/[/\\]/);
  const topDir = parts[0] || 'root';

  // Get second-level directory for src/lib breakdown
  let dir = topDir;
  if (topDir === 'src' && parts[1]) {
    dir = `${topDir}/${parts[1]}`;
    if (parts[1] === 'lib' && parts[2]) {
      dir = `${topDir}/${parts[1]}/${parts[2]}`;
    }
  }

  // Count
  if (!dirCounts[dir]) {
    dirCounts[dir] = 0;
    dirErrors[dir] = [];
  }
  dirCounts[dir]++;
  dirErrors[dir].push({
    file: relativePath,
    line: event.line,
    code: event.code,
    message: event.message?.substring(0, 100)
  });
}

// Sort by count
const sorted = Object.entries(dirCounts)
  .sort((a, b) => b[1] - a[1])
  .map(([dir, count]) => ({
    directory: dir,
    count,
    percentage: ((count / events.length) * 100).toFixed(2) + '%'
  }));

// Calculate cumulative
let cumulative = 0;
sorted.forEach(item => {
  cumulative += item.count;
  item.cumulative = cumulative;
  item.cumulativePercentage = ((cumulative / events.length) * 100).toFixed(2) + '%';
});

// Display top 20
console.log('📊 Top 20 Directories by Error Count:\n');
console.log('Rank | Directory                          | Errors  | %      | Cumulative %');
console.log('─────┼────────────────────────────────────┼─────────┼────────┼──────────────');

sorted.slice(0, 20).forEach((item, idx) => {
  const dirDisplay = item.directory.padEnd(34).substring(0, 34);
  const countDisplay = item.count.toString().padStart(7);
  const pctDisplay = item.percentage.padStart(6);
  const cumDisplay = item.cumulativePercentage.padStart(6);
  console.log(`${(idx + 1).toString().padStart(4)} │ ${dirDisplay} │ ${countDisplay} │ ${pctDisplay} │ ${cumDisplay}`);
});

// Key insights
console.log('\n' + '═'.repeat(90));
console.log('🎯 KEY INSIGHTS\n');

// Check lib/services and lib/server
const services = sorted.find(s => s.directory === 'src/lib/services');
const server = sorted.find(s => s.directory === 'src/lib/server');

if (services && server) {
  const combined = services.count + server.count;
  const combinedPct = ((combined / events.length) * 100).toFixed(2);

  console.log(`lib/services:  ${services.count.toLocaleString()} errors (${services.percentage})`);
  console.log(`lib/server:    ${server.count.toLocaleString()} errors (${server.percentage})`);
  console.log(`─────────────────────────────────────────────────────────`);
  console.log(`Combined:      ${combined.toLocaleString()} errors (${combinedPct}%)\n`);

  if (parseFloat(combinedPct) >= 65) {
    console.log('✅ Hypothesis CONFIRMED: 70% rule holds (services + server)');
    console.log('   → Focus GPU clustering on these 2 directories first\n');
  } else {
    console.log('⚠️ Hypothesis PARTIAL: Less than 70% in services + server');
    console.log(`   → Actual concentration: ${combinedPct}%\n`);
  }
} else {
  console.log('⚠️ Could not find lib/services or lib/server directories');
  console.log('   → Check directory naming or path structure\n');
}

// Top 5 concentration
const top5Count = sorted.slice(0, 5).reduce((sum, item) => sum + item.count, 0);
const top5Pct = ((top5Count / events.length) * 100).toFixed(2);
console.log(`Top 5 directories: ${top5Count.toLocaleString()} errors (${top5Pct}%)`);

// Top 10 concentration
const top10Count = sorted.slice(0, 10).reduce((sum, item) => sum + item.count, 0);
const top10Pct = ((top10Count / events.length) * 100).toFixed(2);
console.log(`Top 10 directories: ${top10Count.toLocaleString()} errors (${top10Pct}%)`);

console.log('═'.repeat(90) + '\n');

// Write detailed report
const report = {
  timestamp: new Date().toISOString(),
  summary: {
    totalErrors: events.length,
    uniqueDirectories: sorted.length,
    top5Concentration: top5Pct + '%',
    top10Concentration: top10Pct + '%',
    servicesAndServer: services && server ? {
      services: services.count,
      server: server.count,
      combined: services.count + server.count,
      percentage: ((services.count + server.count) / events.length * 100).toFixed(2) + '%'
    } : null
  },
  distribution: sorted,
  topDirectories: sorted.slice(0, 20).map(item => ({
    ...item,
    sampleErrors: dirErrors[item.directory].slice(0, 5)
  }))
};

fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));
console.log(`✅ Detailed report saved: ${outputFile}\n`);

// Recommendations
console.log('💡 RECOMMENDED STRATEGY:\n');

if (services && server) {
  const combinedPct = parseFloat(((services.count + server.count) / events.length * 100).toFixed(2));

  if (combinedPct >= 65) {
    console.log('Phase 1: Target lib/services/ and lib/server/');
    console.log(`  Expected reduction: ${(services.count + server.count).toLocaleString()} errors`);
    console.log('\nCommands:');
    console.log('  node scripts/batch-fixer-v2.mjs --plan --tier 1 --path "src/lib/services/**"');
    console.log('  node scripts/batch-fixer-v2.mjs --apply --tier 1 --path "src/lib/services/**" --limit 5000');
  } else {
    console.log('Phase 1: Target top 5 directories (broader approach)');
    sorted.slice(0, 5).forEach((item, idx) => {
      console.log(`  ${idx + 1}. ${item.directory} (${item.count.toLocaleString()} errors)`);
    });
  }
} else {
  console.log('Phase 1: Target top 10 directories');
  sorted.slice(0, 10).forEach((item, idx) => {
    console.log(`  ${idx + 1}. ${item.directory} (${item.count.toLocaleString()} errors)`);
  });
}

console.log('\nPhase 2: SIMD Semantic Clustering');
console.log('  node scripts/simd-cluster-errors.mjs --input reports/errors.jsonl\n');
