#!/usr/bin/env node
import 'dotenv/config';
import { resolve, join } from 'node:path';
import { writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const REPO_ROOT = resolve(process.cwd());
const SOURCES_FILE = join(REPO_ROOT, 'docs/graph/programming-doc-sources.json');
const RAW_DIR = join(REPO_ROOT, 'data/external-docs/raw');
const REPORT_JSON = join(REPO_ROOT, 'docs/graph/programming-doc-feature-gap-report.json');
const REPORT_MD = join(REPO_ROOT, 'docs/reports/programming-doc-feature-gap-report.md');

// Define technology keyword matching rules
const TECH_RULES = {
  svelte: {
    name: 'Svelte 5 Runes & Snippets',
    patterns: [/\$state\(/g, /\$derived\(/g, /\$props\(/g, /onclick\s*=/g, /{#snippet/g],
    extensions: ['.svelte', '.ts', '.js']
  },
  sveltekit: {
    name: 'SvelteKit Routing & Forms',
    patterns: [/superValidate\(/g, /fail\(\d{3}/g, /\+page\.server\./g, /\+server\./g],
    extensions: ['.svelte', '.ts', '.js']
  },
  drizzle: {
    name: 'Drizzle ORM & Postgres Schema',
    patterns: [/pgTable\(/g, /drizzle-orm/g, /serial\(/g, /integer\(/g, /references\(/g],
    extensions: ['.ts', '.js']
  },
  webgpu: {
    name: 'WebGPU & WGSL Compute Shaders',
    patterns: [/navigator\.gpu/g, /GPUAdapter/g, /GPUDevice/g, /WGSL/g, /computePass/g],
    extensions: ['.ts', '.js', '.svelte']
  },
  cuda: {
    name: 'CUDA C++ & LibTorch GPU Kernels',
    patterns: [/cudaMalloc/g, /__global__/g, /cudaDeviceSynchronize/g, /nvcc/g, /torch::cuda/g],
    extensions: ['.cu', '.cpp', '.h', '.ts', '.js']
  }
};

// Recursively walk directory and count technology keywords
async function scanCodebase(dir, stats = {}) {
  // Initialize counts
  for (const tech in TECH_RULES) {
    if (!stats[tech]) stats[tech] = 0;
  }

  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    // Ignore build, node_modules, git, and hidden folders
    if (
      entry.isDirectory() && 
      !entry.name.startsWith('.') && 
      entry.name !== 'node_modules' && 
      entry.name !== 'build' && 
      entry.name !== 'dist' && 
      entry.name !== 'tmp'
    ) {
      await scanCodebase(fullPath, stats);
    } else if (entry.isFile()) {
      const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
      
      // Read file and scan for keywords if extensions match
      let content = null;
      for (const [tech, rule] of Object.entries(TECH_RULES)) {
        if (rule.extensions.includes(ext)) {
          if (content === null) {
            try {
              content = await readFile(fullPath, 'utf8');
            } catch {
              break;
            }
          }
          
          for (const pattern of rule.patterns) {
            const matches = content.match(pattern);
            if (matches) {
              stats[tech] += matches.length;
            }
          }
        }
      }
    }
  }
  return stats;
}

async function analyze() {
  console.log(`[gap-analysis] Initializing High-Fidelity Programming Docs Gap Analysis...`);

  // 1. Read sources configuration
  if (!existsSync(SOURCES_FILE)) {
    console.error(`Missing programming doc sources configuration: ${SOURCES_FILE}`);
    process.exit(1);
  }
  const sourcesData = JSON.parse(await readFile(SOURCES_FILE, 'utf8'));
  const sources = [...sourcesData.tier1, ...sourcesData.tier2];

  // 2. Scan codebase for technology occurrences
  console.log(`[gap-analysis] Scanning codebase for API keywords and framework patterns...`);
  const codebaseStats = await scanCodebase(REPO_ROOT);
  console.log(`[gap-analysis] Scan completed:`, codebaseStats);

  // 3. Count documents crawled for each source
  const docStats = {};
  for (const source of sources) {
    const docDir = join(RAW_DIR, source.sourceId);
    let count = 0;
    if (existsSync(docDir)) {
      const files = await readdir(docDir);
      // count only markdown or html files
      count = files.filter(f => f.endsWith('.md') || f.endsWith('.html')).length;
    }
    docStats[source.sourceId] = count;
  }
  console.log(`[gap-analysis] Crawled documents counts:`, docStats);

  // 4. Calculate gaps and compile report
  const gaps = [];
  const coverage = [];

  for (const source of sources) {
    const techKey = source.sourceId;
    const usageCount = codebaseStats[techKey] || 0;
    const docsCount = docStats[techKey] || 0;
    
    let severity = 'low';
    let description = '';
    
    if (usageCount > 0 && docsCount === 0) {
      severity = 'high';
      description = `Codebase has ${usageCount} references to ${source.title} features, but NO local documentation exists. Ingestion is highly recommended.`;
    } else if (usageCount > 10 && docsCount < 5) {
      severity = 'medium';
      description = `Codebase relies heavily on ${source.title} (${usageCount} references), but documentation is sparse (${docsCount} pages). Crawling more pages is recommended.`;
    } else if (usageCount === 0) {
      severity = 'low';
      description = `No active usage of ${source.title} detected in the codebase. Existing documentation (${docsCount} pages) is sufficient.`;
    } else {
      severity = 'none';
      description = `Active usage is well covered by ${docsCount} pages of local crawled documentation.`;
    }

    if (severity !== 'none') {
      gaps.push({
        sourceId: source.sourceId,
        title: source.title,
        usageCount,
        docsCount,
        severity,
        description
      });
    }

    coverage.push({
      sourceId: source.sourceId,
      title: source.title,
      trustTier: source.trustTier,
      usageCount,
      docsCount,
      coveragePercent: usageCount === 0 ? 100 : Math.min(100, Math.round((docsCount / Math.max(3, Math.min(10, Math.ceil(usageCount / 10)))) * 100))
    });
  }

  // Sort gaps by severity (high -> medium -> low)
  const severityWeight = { high: 3, medium: 2, low: 1 };
  gaps.sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity]);

  const report = {
    generatedAt: new Date().toISOString(),
    codebasePath: REPO_ROOT,
    metrics: {
      totalGaps: gaps.length,
      highGaps: gaps.filter(g => g.severity === 'high').length,
      mediumGaps: gaps.filter(g => g.severity === 'medium').length,
      lowGaps: gaps.filter(g => g.severity === 'low').length,
    },
    gaps,
    coverage
  };

  // 5. Write JSON report
  await writeFile(REPORT_JSON, JSON.stringify(report, null, 2));
  console.log(`[gap-analysis] Written high-fidelity JSON report to: ${REPORT_JSON}`);

  // 6. Write elegant Markdown report
  let md = `# Programming Documentation & Codebase Feature Gap Report

*Generated on:* \`${new Date().toLocaleString()}\`  
*Target Workstation:* \`${REPO_ROOT}\`  
*Scope:* Cross-layer API alignment (Svelte 5, SvelteKit, Drizzle ORM, WebGPU, CUDA C++)

---

## 📊 Summary of Documentation Coverage Gaps

The automated comparative gap analysis has scanned active source files and computed documentation alignment based on usage intensity vs. crawled pages.

| Severity | Count | Status | Action Required |
|----------|-------|--------|-----------------|
| 🔴 **High** | ${report.metrics.highGaps} | Critically Exposed | Crawl official source immediately |
| 🟡 **Medium** | ${report.metrics.mediumGaps} | Partially Exposed | Expand crawl depth / topic scope |
| 🟢 **Low / None** | ${report.metrics.lowGaps} | Covered / Inactive | Perfect or unused technology |

---

## 🔍 Detailed Feature Gap Analysis

`;

  for (const gap of gaps) {
    const icon = gap.severity === 'high' ? '🔴 **HIGH SEVERITY**' : gap.severity === 'medium' ? '🟡 **MEDIUM SEVERITY**' : '🟢 **LOW SEVERITY**';
    md += `### ${icon}: ${gap.title} (\`${gap.sourceId}\`)
- **Codebase API Occurrences:** ${gap.usageCount} matches
- **Crawled Pages:** ${gap.docsCount} pages on disk
- **Finding:** ${gap.description}
- **Action Plan:** ${
      gap.severity === 'high' 
        ? `Execute \`npm run crawl:docs -- --source=${gap.sourceId}\` using Firecrawl to pull canonical Markdown documentation to \`data/external-docs/raw/${gap.sourceId}\`.` 
        : gap.severity === 'medium'
        ? `Increase crawl depth or add specific topic filters to \`programming-doc-sources.json\` and execute crawl refresh.`
        : `No action needed at this time.`
    }

`;
  }

  md += `---

## 🧬 Framework & API Coverage Matrix

This matrix represents the density of our codebase features against the Programming Docs Atlas.

| Source Title | Trust Tier | Codebase Usage Intensity | Crawled Docs | Estimated Coverage |
|--------------|------------|-------------------------|--------------|--------------------|
`;

  for (const cov of coverage) {
    md += `| ${cov.title} | \`${cov.trustTier}\` | ${cov.usageCount} matches | ${cov.docsCount} pages | \`${cov.coveragePercent}%\` |\n`;
  }

  md += `
---
*Note: This report is automatically synchronized into our agentic knowledge graph (Neo4j / Redis Bifrost) during workspace ingestion runs.*
`;

  await writeFile(REPORT_MD, md);
  console.log(`[gap-analysis] Written human-readable Markdown report to: ${REPORT_MD}`);
  console.log(`[gap-analysis] Gap analysis successfully completed!`);
}

analyze().catch(console.error);
